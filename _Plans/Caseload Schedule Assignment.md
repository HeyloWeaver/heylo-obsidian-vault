---
status: proposed
owner: Mike
created: 2026-04-29
tags:
  - plan
  - frontend
  - caseload
related:
  - "[[Caseload Creation Redesign]]"
  - "[[Caseload Redesign v1]]"
  - "[[Frontend/Domain - Caseload]]"
  - "[[Go/Domain - Caseload]]"
type: plan
---

# Caseload Schedule Assignment — Plan

Wire the new Go AppSync `assignCaseloadSchedule` mutation (shipped in `go` repo commit [`419271d`](https://github.com/heylo-tech/go/commit/419271de79c2fcfa3a9d9c5a4982845b73008c3b)) into the v2 caseload schedule page so users can **assign** unfilled template slots and **reassign** existing assignments from a single dialog.

The work is **frontend-only**. The Go mutation upserts on `(caseloadId, utcStart)`, so one call covers both create-and-assign (when the slot is currently a template projection) and reassignment (when a `caseloadschedule` row already exists).

## Goal

From the calendar grid on `/caseload-management/v2`, clicking any schedule pill opens an Assign Shift dialog. The dialog picks a user from the caseload's agency and submits to `assignCaseloadSchedule`. The schedule re-fetches on success, the hatched (unassigned) pill turns into a solid assigned pill, and reassignments swap the displayed user.

## Definition of Done

- Clicking an **unassigned** (hatched) pill opens the dialog in *Assign* mode; clicking an **assigned** pill opens it in *Reassign* mode with the current user preselected.
- The dialog submits a single shift to `caseloadService.assignCaseloadSchedule({ caseloadId, userId, shifts: [{ startDate, startTime }] })` and on success calls the v2 page's `loadSchedule({ force: true })` (no optimistic store update — per `CLAUDE.md` backend rules).
- Reassign mode disables Submit when the selected user equals the current `entry.userId` (no-op guard).
- Backend `BadInput` errors (template mismatch, before/after caseload range, user not in agency, duplicate shift) surface as inline dialog errors using the message text the Go resolver returns.
- The pill click handler is wired in both `calendar-day.tsx` and `calendar-week.tsx`; `SchedulePill.onClick` is already a prop.
- The mapping `entry.date → AssignShiftInput.startDate` (YYYY-MM-DD) and `entry.startTime → AssignShiftInput.startTime` (HH:mm) is direct — view model already produces those exact strings, no conversion.

## Scope Boundaries (what we are NOT doing)

- Not touching `go/`, `backend/`, `tablet/`, `hub/`. The Go mutation is merged and complete.
- **Not implementing unassign** (setting `userId` back to null). The Go mutation rejects an empty `userId` at [`assigncaseloadschedule.go:31-33`](https://github.com/heylo-tech/go/blob/master/backend/appsync/assigncaseloadschedule.go#L31-L33), so removal-of-assignment is a separate backend ticket. Out of scope for this plan; needs Chris to add an unassign mutation.
- **Not implementing bulk multi-select assign in v1.** The mutation's `shifts` array supports it cleanly, but UX (drag-select on the calendar, multi-pill picker, etc.) is out of scope here — flagged as a follow-up under Open Questions.
- Not changing v1 (`/caseload-management`) — assignment there continues to flow through the legacy `AssignSchedule` REST modal.
- Not changing the `getCaseloadSchedule` query shape; the existing view model in [`services/caseloadServiceV2.ts`](frontend/services/caseloadServiceV2.ts) already exposes everything the dialog needs.

## Backend contract (reference)

```graphql
assignCaseloadSchedule(
  caseloadId: ID!
  userId: ID!
  shifts: [AssignShiftInput!]!
): AssignCaseloadScheduleResult!

input AssignShiftInput {
  startDate: String!   # "YYYY-MM-DD"
  startTime: String!   # "HH:mm" — must match the caseload's day-of-week template
}

type AssignCaseloadScheduleResult { ids: [ID!]! }
```

Resolver: [`backend/appsync/assigncaseloadschedule.go`](https://github.com/heylo-tech/go/blob/master/backend/appsync/assigncaseloadschedule.go).

Validation enforced server-side:
- `caseloadId` / `userId` non-empty; `shifts` non-empty.
- Caller must be super-admin or admin in the caseload's agency (resolved from `caseloadsite.agencyId`, *not* `caseload.agencyId`).
- Target `userId` must have a userrole in that agency.
- Each shift's `(weekday, startTime)` must match an entry in the caseload's `DayOfWeekDetail` template; the resolver derives `endTime` from the matched template row.
- `startDate` must fall in `[caseload.StartDateTime, caseload.EndDateTime]` (date-only comparison).
- Duplicate `(caseloadId, utcStart)` within a single request is rejected.
- Existing rows with the same `(caseloadId, utcStart)` are **updated** (`userId` swap = reassign); otherwise inserted.

## Implementation Steps

### 1. Service + GraphQL — [`services/caseloadServiceV2.ts`](frontend/services/caseloadServiceV2.ts)

Add an `ASSIGN_CASELOAD_SCHEDULE` `gql` document mirroring the schema above. Add `caseloadService.assignCaseloadSchedule(req): Promise<{ ids: string[] }>` next to `addCaseload`. No `update` callback — the page re-fetches via the existing `loadSchedule({ force: true })` action.

### 2. Request model — new [`lib/models/caseload/assignCaseloadScheduleRequest.ts`](frontend/lib/models/caseload/assignCaseloadScheduleRequest.ts)

```ts
export type AssignShiftInput = {
  startDate: string;   // YYYY-MM-DD
  startTime: string;   // HH:mm
};

export type AssignCaseloadScheduleRequest = {
  caseloadId: string;
  userId: string;
  shifts: AssignShiftInput[];
};
```

Mirrors the shape of [`addCaseloadRequest.ts`](frontend/lib/models/caseload/addCaseloadRequest.ts).

### 3. Selection state — [`schedule-page.tsx`](frontend/components/caseload-management/v2/schedule-page.tsx)

Lift a `selectedEntry: ScheduleEntry | null` state to the page. Pass setter into `<CalendarMonth>` / `<CalendarWeek>`. Render `<AssignShiftDialog>` when non-null.

### 4. Pill click wiring — [`calendar-day.tsx`](frontend/components/caseload-management/v2/calendar/calendar-day.tsx) and [`calendar-week.tsx`](frontend/components/caseload-management/v2/calendar/calendar-week.tsx)

`SchedulePill` already accepts `onClick` ([`schedule-pill.tsx:30`](frontend/components/caseload-management/v2/calendar/schedule-pill.tsx#L30)) and renders a button affordance when supplied. Pass an `onClick={() => onSelectEntry(entry)}` callback for every pill — both assigned and unassigned.

### 5. New component — `components/caseload-management/v2/assign-shift-dialog.tsx`

Props:
```ts
type AssignShiftDialogProps = {
  entry: ScheduleEntry;            // from view model
  caseloadName: string;            // pulled from context for header
  siteName: string;
  onClose: () => void;
  onAssigned: () => void;          // page calls loadSchedule({ force: true })
};
```

Behavior:
- Header: "Assign shift" if `entry.userId == null`, else "Reassign shift".
- Subheader: `${entry.date} • ${entry.startTime}–${entry.endTime} • ${siteName}`.
- Body: agency-user picker (see Open Question 1) preselected to `entry.userId` in reassign mode.
- Submit calls `caseloadService.assignCaseloadSchedule({ caseloadId: entry.caseloadId, userId: selectedUserId, shifts: [{ startDate: entry.date, startTime: entry.startTime }] })`.
- Disable Submit when: nothing selected, mutation in flight, or (reassign mode AND `selectedUserId === entry.userId`).
- On error: render the resolver's `Message` inline at the bottom of the dialog. Don't toast — error wording is specific (e.g. "shift 0: 2026-05-12 09:00 does not match the caseload template") and belongs next to the form.
- On success: close, call `onAssigned()`, toast "Assigned to {userName}" / "Reassigned to {userName}".

### 6. Refetch — [`context/caseload-context.tsx`](frontend/context/caseload-context.tsx)

Re-use the existing `loadSchedule({ force: true })` action that the create flow uses post-`addCaseload`. No new context surface needed.

## Open Questions

1. **User picker source.** Need an agency-users dropdown — is there an existing query (e.g. on `userService` or a v2-friendly Apollo query) that returns users for a given agency? If not, this plan assumes we add a minimal one (`listAgencyUsers(agencyId)` returning `{ id, firstName, lastName }`) used only by this dialog. Owner: confirm before coding.
2. **Bulk multi-select assign.** Out of scope for v1 but the mutation's `shifts: [...]` already supports it. Likely follow-up: shift-click / drag-select to gather multiple unassigned pills, then a single user pick. Worth a separate plan.
3. **True unassign.** Backend doesn't currently allow `userId == null`. Coordinate with Chris on adding `unassignCaseloadSchedule(scheduleIds: [ID!]!)` (or accepting null on the existing mutation). Tracked here so it's not lost; not blocking this plan.
4. **Multi-site caseloads.** Resolver picks `Sites[0].Timezone` to anchor `startTime` for multi-site caseloads ([`assigncaseloadschedule.go:54-61`](https://github.com/heylo-tech/go/blob/master/backend/appsync/assigncaseloadschedule.go#L54-L61)). Frontend doesn't need to handle this, but the dialog should display *the entry's site*, not "first site of the caseload", to avoid confusing operators of multi-site caseloads.
