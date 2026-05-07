---
status: planned
owner: Mike
created: 2026-05-07
tags:
  - plan
  - frontend
  - backend
  - tablet
  - communication
type: plan
updated: 2026-05-07
---

# Daily Todos MVP — Plan

## Goal

Give caretakers a per-resident, per-day checklist that surfaces on the resident's tablet. Caretakers manage the list (the **template**) on the operator console; each day, that template materializes into a fresh **instance** on the tablet that anyone present can check off. Completion state lives per-day, so yesterday's check marks stay in history while today starts clean.

## Definition of Done

- As a caretaker, on a resident detail page, I can add, edit, reorder, and soft-delete checklist items in that resident's template.
- As a caretaker, when I edit the template, the resident's tablet (and any other operator viewing the same resident) updates within ~1s.
- As a resident or caretaker on the tablet, I see today's checklist on the home screen and I can tap a row to toggle it complete/incomplete.
- A toggle on the tablet is reflected on the operator console within ~1s.
- At midnight site-local time (lazily on first read of a new day, no cron required), today's instance is empty of completion state — yesterday's completed rows remain in history but do not appear.
- Backend route paths and column names use PascalCase per current convention.
- Build number in `tablet/pubspec.yaml` is bumped so deployed tablets pick up the OTA.

---

## Locked Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Scope of a list | Per-resident | Matches `/User/My`-keyed tablet model. |
| Granularity | Per-day instances | "Per-day" is in the requirement; preserves history. |
| Materialization | Lazy on first `GET` for the day | No cron; works across timezones; cheap. |
| Tablet interactive? | Yes — anyone present can toggle | The whole point of putting it on the tablet. |
| Audit | Capture `CompletedByUserId` + `CompletedOn` | Cheap to write now; UI can be added later. |
| Realtime | Single new WS event `DailyTodoChanged` | Mirrors existing one-event-per-domain pattern. |
| Column casing | **PascalCase** (overrides stale CLAUDE.md) | Matches current backend convention (`/ReadReceipt`, `Id`, `StatusId`). |

---

## Data Model

Two tables. The template owns the list shape; the instance owns one day's completion state.

### `dailytodotemplate`

| Column | Type | Notes |
|---|---|---|
| `Id` | `varchar(36)` PK | uuid |
| `ResidentId` | `varchar(36)` | FK → `users(Id)` |
| `AgencyId` | `varchar(36)` | FK → `agency(Id)` |
| `SiteId` | `varchar(36)` | FK → `site(Id)` |
| `Label` | `varchar(255)` | |
| `SortOrder` | `int` | dense, gap-tolerant |
| `IsDeleted` | `tinyint(1)` | default `0` |
| `CreatedOn` | `datetime` | DB-managed |
| `UpdatedOn` | `datetime` | DB-managed |

Indexes: `(ResidentId, IsDeleted, SortOrder)`, `(SiteId, IsDeleted)`.

### `dailytodoinstance`

| Column | Type | Notes |
|---|---|---|
| `Id` | `varchar(36)` PK | uuid |
| `TemplateId` | `varchar(36)` | FK → `dailytodotemplate(Id)` (DB-level, no ORM cascade) |
| `ResidentId` | `varchar(36)` | denormalized for query speed |
| `Date` | `date` | site-local date the instance is for |
| `Label` | `varchar(255)` | snapshot of template label at materialization time |
| `SortOrder` | `int` | snapshot |
| `IsCompleted` | `tinyint(1)` | default `0` |
| `CompletedOn` | `datetime` | nullable |
| `CompletedByUserId` | `varchar(36)` | nullable, FK → `users(Id)` |
| `CreatedOn` | `datetime` | DB-managed |
| `UpdatedOn` | `datetime` | DB-managed |

Indexes: `UNIQUE (TemplateId, Date)`, `(ResidentId, Date)`.

> Label/SortOrder are snapshotted at materialization so editing the template tomorrow doesn't rewrite yesterday's history. Editing the template **does** update today's instances if the day has already been materialized — see §3.

---

## What Already Exists

| Thing | Location | Notes |
|---|---|---|
| WebSocket dispatch infra | `backend/src/services/websocket.service.ts`, `frontend/context/socket-context.tsx`, `tablet/lib/services/realtime.service.dart` | Used for messages, calls, alerts |
| Backend `AppEvent` enum | `backend/src/domain/models/common/event.ts` | Add `DailyTodoChanged` |
| Frontend `Event` enum | `frontend/lib/models/common/event.ts` | Mirror |
| Tablet events enum | `tablet/lib/enums/events.enum.dart` | Mirror |
| Tablet home grid | `tablet/lib/ui/screens/home/home.view.dart` | Slot for new card alongside `clock_card`, `weather_card`, `missed_calls_card`, `unread_messages_card` |
| Resident detail page (operator console) | _confirm during slice 2_ | Embed caretaker UI here |
| `DataState<T>` pattern | tablet controllers | New tablet client wrappers must return `DataState<T>` |
| Auth/role guards | `backend/src/guards/auth.guard.ts`, `roles.guard.ts` | Reuse for write authorization |

---

## Implementation Steps

### 1. Backend — entities, migration, module wiring

**Files**
- `backend/src/entities/daily-todo-template.entity.ts`
- `backend/src/entities/daily-todo-instance.entity.ts`
- `backend/src/migrations/<ts>-create-daily-todo.ts`
- `backend/src/modules/daily-todo.module.ts`
- Register in `backend/src/app.module.ts`

**Entity rules** (project conventions):
- `@Entity({ name: 'dailytodotemplate' })` and `@Entity({ name: 'dailytodoinstance' })` — lowercase, no separators.
- Columns PascalCase (`Id`, `ResidentId`, `Label`, …).
- `CreatedOn` / `UpdatedOn` use `insert: false, update: false`. Migration sets `DEFAULT CURRENT_TIMESTAMP` / `ON UPDATE CURRENT_TIMESTAMP`.
- No `cascade: true` or `onDelete: 'CASCADE'` on relation decorators. DB-level FK `ON DELETE` rules in the migration are fine.

### 2. Backend — service

**`backend/src/services/daily-todo.service.ts`**

All reads via `repository.manager.query()`. All multi-row writes wrapped in `manager.transaction(...)`.

Methods:

- `listTemplate(residentId)` → `Array<{ Id, Label, SortOrder }>`. Single SQL with `WHERE IsDeleted = 0 ORDER BY SortOrder`.
- `createTemplateItem(residentId, label, sortOrder?)` → `{ Id }`. If `sortOrder` is omitted, set to `MAX(SortOrder) + 1`. Returns the new id only.
- `updateTemplateItem(id, { label?, sortOrder? })` → `{ Id }`. If today's instance exists for this template, update its snapshotted `Label` / `SortOrder` in the same transaction so the tablet reflects the edit immediately.
- `deleteTemplateItem(id)` → `{ Id }`. Soft-delete the template row; in the same transaction, soft-equivalent on today's instance (delete it, since instances aren't user-visible history rows for incomplete items — see §"Open notes").
- `getTodayForResident(residentId, siteTimezone)` → `Array<{ InstanceId, Label, SortOrder, IsCompleted, CompletedOn, CompletedByUserId }>`. **Lazily materializes**: in one transaction, computes today's date in site-local time, `INSERT … SELECT` from active templates that don't yet have an instance for `(TemplateId, Date)`, then selects the full set. Idempotent on retry due to the `UNIQUE (TemplateId, Date)` index.
- `toggleInstance(instanceId, isCompleted, callerUserId)` → `{ Id }`. Updates `IsCompleted`, `CompletedOn`, `CompletedByUserId`. Authorization: caller must belong to the same agency/site as the instance's resident.

**Site-local "today"**: read the resident's site's timezone (existing on the `site` entity — confirm column name during slice). Use that for the `Date` calculation. No DST footguns since `DATE` ignores time-of-day.

After every mutation, broadcast `DailyTodoChanged` with payload `{ ResidentId }` to: the resident's tablet WS connection + any operator WS connections currently subscribed to that resident.

### 3. Backend — controller

**`backend/src/controllers/daily-todo.controller.ts`** — PascalCase routes per `/ReadReceipt` precedent.

| Verb | Path | Roles | Returns |
|---|---|---|---|
| `GET` | `/DailyTodo/Template?residentId=…` | admin, supportProfessional | `Array<TemplateItem>` |
| `POST` | `/DailyTodo/Template` | admin, supportProfessional | `{ Id }` |
| `PATCH` | `/DailyTodo/Template/:id` | admin, supportProfessional | `{ Id }` |
| `DELETE` | `/DailyTodo/Template/:id` | admin, supportProfessional | `{ Id }` |
| `GET` | `/DailyTodo/My/Today` | resident (tablet) | `Array<InstanceItem>` |
| `GET` | `/DailyTodo/Today?residentId=…` | admin, supportProfessional | `Array<InstanceItem>` |
| `PATCH` | `/DailyTodo/Instance/:id/Toggle` | admin, supportProfessional, resident | `{ Id }` |

DTOs in `backend/src/domain/dto/daily-todo/`:
- `create-daily-todo-template.dto.ts` — `{ residentId: string; label: string; sortOrder?: number }`
- `update-daily-todo-template.dto.ts` — `{ label?: string; sortOrder?: number }`
- `toggle-daily-todo-instance.dto.ts` — `{ isCompleted: boolean }`

All requests validated via existing `ValidationPipe`. Tenancy enforced in the service (compare `ContextService.agencyId` to the resident's agency).

### 4. Backend — realtime event

- Add `DailyTodoChanged = <next>` to `backend/src/domain/models/common/event.ts` (`AppEvent` enum).
- Emit from `DailyTodoService` after every successful mutation. Payload: `{ ResidentId: string }`.
- Recipients: connected WS clients whose user is the resident, or whose user is an operator currently scoped to the resident's agency. Use the existing fan-out helpers in `WebSocketService`.

### 5. Frontend — operator console (caretaker UI)

**Files**
- `frontend/lib/models/dailytodo/dailyTodo.ts` — `DailyTodoTemplateItem`, `DailyTodoInstanceItem` interfaces.
- `frontend/lib/models/dailytodo/dailyTodoConstants.ts` — any path/label constants (no enum needed in MVP).
- `frontend/services/dailyTodo.service.ts` — axios methods for the 7 endpoints.
- `frontend/components/daily-todos/DailyTodosPanel.tsx` — the editor.
- Embed in resident detail page (path TBD in slice).

**Behavior**
- Renders the template list with: inline add row, drag-to-reorder (using whatever DnD util is already in the project — confirm during slice; otherwise use up/down buttons for MVP), edit-in-place, delete.
- Renders today's instance state read-only beside the editor (so caretakers can see what's already been checked off today).
- After every mutation: re-fetch both lists. **No optimistic patches.**
- Subscribe to `DailyTodoChanged` in `frontend/context/socket-context.tsx`; on receipt, if `ResidentId` matches the currently-viewed resident, re-fetch.
- Mirror the new event in `frontend/lib/models/common/event.ts`.

**Standards** (per Frontend Agent Work Guide)
- Tailwind theme tokens only (`text-foreground`, `bg-muted`, `border-destructive`, …) — no raw hex.
- Use enums for any discriminated string values.
- Path constant if a new top-level route is added.

### 6. Tablet — Flutter card on home

**Files**
- `tablet/lib/models/daily_todo.dart` + `tablet/lib/models/response/daily_todo_response.dart` (`@JsonSerializable`).
- `tablet/lib/services/daily_todo.service.dart` — owns `BehaviorSubject<List<DailyTodo>>`; calls `GET /DailyTodo/My/Today` on connect / on WS event / on pull-to-refresh; calls `PATCH /DailyTodo/Instance/:id/Toggle`.
- `tablet/lib/controllers/daily_todo.controller.dart` — thin `DataState<T>` HTTP wrapper per existing pattern.
- `tablet/lib/ui/screens/home/daily_todos_card/daily_todos_card.view.dart` + `.view_model.dart`.
- Slot the card into `tablet/lib/ui/screens/home/home.view.dart` alongside the existing cards.
- Register service + controller in `tablet/lib/main.dart` GetIt graph after `AuthService` and `RealtimeService`.
- Add `DailyTodoChanged` to `tablet/lib/enums/events.enum.dart`.
- Add a dispatch case in `tablet/lib/services/realtime.service.dart` that re-fetches `GET /DailyTodo/My/Today`.

**Behavior**
- `StreamBuilder` on the controller's todos stream.
- Empty state: friendly "No todos for today" copy.
- Each row: large checkbox + label; tap toggles. Optimistic UI is fine on the tablet (toggle locally, await server) — but on WS event from the server (including own toggles), refetch to stay authoritative.
- Landscape only, `FlutterScreenUtil` sizing, theme colors only.

**Codegen**: run `flutter pub run build_runner build --delete-conflicting-outputs` after adding the model.

**Build number**: bump the integer after `+` in `tablet/pubspec.yaml`'s `version` so deployed tablets pick up the OTA.

### 7. Verification

| Layer | Checks |
|---|---|
| Backend | Service unit tests on `getTodayForResident` (lazy materialization, idempotent across calls, correct site-local date), `toggleInstance` audit fields, tenancy enforcement. Integration test for all 7 routes. Confirm raw SQL only — no `find` with `relations`. |
| Frontend | Add/edit/reorder/delete trigger re-fetch. WS event from another browser tab updates the list without a manual refresh. Roles: resident user cannot reach the caretaker editor; admin/SP can. |
| Tablet | Card renders on landscape home grid. Toggle persists across app restart. WS event from the operator console updates the card within ~1s. Empty state and error state render. Verify on a real device in `--release`, not just emulator (per Tablet Agent Work Guide). |

---

## Out of Scope (V2 candidates)

- Recurring/ad-hoc one-off todos that aren't tied to a template.
- Time-of-day grouping (morning / afternoon / evening / bedtime).
- Per-todo icons, images, or category tags.
- Audit timeline UI (the `CompletedByUserId` / `CompletedOn` columns are written from V1, just unsurfaced).
- Caseload integration ("which staff is responsible for which todos today").
- Voice command toggling on the tablet ("Hey Heylo, mark take meds done").
- Reporting / completion analytics across days.
- Push notifications when items remain unchecked late in the day.

---

## Open Notes (resolve in slice)

- **Resident detail host page**: confirm where in the operator console the editor mounts. If there's no dedicated resident detail page yet, this plan assumes one exists or that we add a small one.
- **Site timezone column**: confirm name on the `site` entity (`Timezone`? `TimeZoneId`?) before writing the date math.
- **Soft-delete vs hard-delete of today's instance** when the template is deleted mid-day: plan above proposes hard delete of today's not-yet-completed instance, and leaving completed instances in history. Revisit if product wants instance to vanish entirely.
- **Drag-to-reorder util on frontend**: confirm what's already in use (dnd-kit? react-beautiful-dnd?). For MVP, fall back to up/down arrows if nothing is established.
