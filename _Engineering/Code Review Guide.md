---
type: guide
tags: [engineering, agents, review]
owner: Mike
updated: 2026-05-08
status: current
---
# Code Review Guide

This guide is for agents (and humans) reviewing code in any Heylo repo. The goal is to catch the things our team flags repeatedly in PR review, before the PR ever gets opened.

Use this in addition to the area-specific guides:

- [[Frontend/Agent Work Guide]]
- [[Backend/Agent Work Guide]]
- [[Go/Agent Work Guide]]
- [[Tablet/Agent Work Guide]]
- [[Hub/Agent Work Guide]]

There is also a `/code-review` slash command (defined in `backend/.claude/commands/code-review.md`, mirrored at [[Backend/Commands/code-review]]) that runs an automated review of a branch or PR using the rules below.

---

## Mindset

**Review like chris would.** He cares less about superficial style and more about whether the code makes the system *better* or just *bigger*. The bar isn't "does it work" — it's "does this fit the codebase, will it survive the next change, and is the right layer doing the work."

A few things he reaches for in review repeatedly:

- "I'd rather not put this check in every endpoint." → push validation up to middleware/guard/context.
- "Please put more logic in the backend. Do not use the backend as a REST service that just returns lists. Have it assemble data for the front end." → the backend should ship the frontend exactly what it needs, pre-grouped, pre-counted, pre-shaped.
- "Each ticket type has its own set of attributes, we're going to get all of them." → don't bake assumptions about a single shape into a generic endpoint.
- "Would rather use a date library." → if a library exists in the project for this, use it. Don't reinvent.

If a reviewer would say any of those, the code isn't ready.

---

## Hard rules — block on these

These are non-negotiable. If a change introduces any of them, push back before approving.

### No `any`

- No `: any`, no implicit `any`, no `as any` casts to silence the compiler.
- Type external API responses with explicit interfaces (see Intercom integration in `backend/src/services/intercom.service.ts` for the pattern: declare local response shapes, then `httpSvc.get<T>(...)`).
- If the type is genuinely unknown, use `unknown` and narrow — that forces the reader to think.

### No new libraries without explicit approval

- Before reaching for a new dep, **search the workspace first**: `rg "from ['\\\"]<keyword>['\\\"]" frontend backend` and check `package.json`.
- Date formatting → `date-fns` (already used everywhere — see `frontend/components/caseload-management/`).
- UI primitives → Radix + components in `components/ui/` (frontend) or MUI 7 (customer-onboarding, inventory).
- State → Zustand 5 for new feature-level state in the main frontend; existing React Context/providers remain for legacy and app-wide concerns. Customer-onboarding and inventory also use Zustand 5.
- HTTP → axios via `frontend/lib/api.ts` or NestJS `HttpService`.
- If you genuinely need something new, raise it in standup or Slack first — don't sneak it in via a PR.

### No hardcoded literals where an enum exists (or should exist)

- Strings like `'open'`, `'resolved'`, role names, status codes — always reference the enum.
- If the enum doesn't exist yet, **create it** in `backend/src/domain/enums/` or `frontend/lib/models/.../enums`. This is a project rule, not a preference.
- **This applies to migrations.** Seed inserts and lookup `WHERE name = 'Live'` patterns must import the matching enum and use parameter bindings — no inline string literals in migration SQL:
  ```ts
  import { AgencyStatusName } from '../domain/enums/agency-status-name';
  await queryRunner.query(
    `INSERT INTO agencystatus (Name) VALUES (?), (?);`,
    [AgencyStatusName.Live, AgencyStatusName.Demo],
  );
  ```

### Validation belongs in the right layer

Before adding a guard at the top of a service method, ask: *can a guard, middleware, interceptor, or `ContextService` handle this once for everyone?*

- "Is the user real and not deleted?" → `ContextService.validateJwtToken` (backend).
- "Does the user have role X?" → `@Roles()` + `RolesGuard`.
- "Is this request authenticated?" → `AuthGuard`.
- "Does the agency match the resource's tenancy?" → consider a tenancy helper rather than per-endpoint joins.
- **Agency authorization specifically**: use `contextSvc.agencyId`. Do not look up the user and read `userRoles[0].agencyId` — the context service already has it.

If you find yourself writing the same `if (!user) return [];` in three services, that's the smell — fix the layer, not the endpoint.

### Use NestJS exceptions, not bare `throw new Error()`

Inside backend services and controllers, throw the NestJS exception that maps to the HTTP status the frontend should see:

- `BadRequestException` (400) — invalid input
- `UnauthorizedException` (401) — not authenticated
- `ForbiddenException` (403) — authenticated but not allowed
- `NotFoundException` (404) — entity doesn't exist
- `ConflictException` (409) — uniqueness/state violation

Bare `throw new Error()` becomes a 500 and the frontend can't tell what went wrong.

### No sensitive data in logs

Log entity **IDs** only. Never log:

- Physical device IDs (kept off camera/sensor identifiers)
- Secrets, tokens, JWTs, Cognito attributes
- Credentials, passwords, hashed or otherwise
- PII beyond what's already in the entity row

If you need to debug a foreign key, log the internal UUID, not the third-party identifier.

### Performance — flag these in review

- **N+1 queries**: a `for`/`map` over a list that calls a service method per row → fold into one joined query.
- **Unbounded queries**: any `SELECT` without a `LIMIT` or tenancy `WHERE` clause when the table grows with usage (alerts, calls, events, messages).
- **Missing indexes**: filtering or joining on a column without an index on a large table → flag, suggest a migration.
- **Loading rows to count them**: `find(...).length` or `forEach`-then-`++` instead of SQL `COUNT()`/`GROUP BY`.

### Security — flag these in review

- **SQL injection**: any string interpolation into raw SQL that isn't a column/table name. Always use `?` placeholders and the params array.
- **Auth bypass**: an endpoint missing `@UseGuards(AuthGuard)`/`@Roles(...)`, or a controller that uses `req.user` without a guard.
- **Tenancy leak**: a query that filters on `id` but not `agencyId` when the entity is agency-scoped — one customer can read another's data.
- **Open redirects / unvalidated user input** flowing into URLs, file paths, or shell commands.

---

## Domain-specific rules currently in flight

These come from the `/code-review` command and reflect rules the team is actively enforcing right now. They're scoped (deprecations, in-progress migrations) and may change — keep this section in sync with `backend/.claude/commands/code-review.md`.

- **No `deviceCapability`** — use `deviceType.name` with the `DeviceTypeName` enum. `deviceCapability` is deprecated and being removed.
- **User role changes** are restricted to `admin` ↔ `supportProfessional`. Any other role transition requires deleting and recreating the user.
- **User agency changes are not allowed** on update. Delete and recreate the user instead.

---

## Soft rules — strongly prefer

### Boy scout rule

Leave the file better than you found it, in proportion to the change. Don't refactor unrelated code in a "fix bug" PR — but if you're already editing the function, fix the small things you see (a `findAndCount` you'd never write today, a magic string, a missing enum).

The Backend Agent Work Guide is explicit: when you touch existing TypeORM-with-relations code, convert it to raw SQL **in the same PR**.

### Chameleon code — match the surrounding style

Code should look like it was written by the same person who wrote the file around it.

- Indentation, brace style, import order: copy the file, don't impose a global preference.
- Naming: if the surrounding code uses `getXyz`/`createXyz`, don't introduce `fetchXyz`.
- Error handling: if the file logs and returns empty on Intercom failures, don't suddenly throw.
- DTO patterns: if controllers return `{ id }` after mutations, don't return the full row in your new endpoint.

A PR full of "improvements" that diverge from the file's existing style is harder to review than the original problem warranted.

### Backend assembles, frontend renders

The frontend should not be doing work the backend can do once.

- **Filtering / grouping**: if the UI shows "Open" and "Resolved" sections, ship `{ open, resolved }` from the API, not a flat list the frontend filters.
- **Counts / totals**: compute them in SQL and include them in the response — don't `.length` on the client.
- **Sorting**: do it in `ORDER BY`, not `Array.sort`.
- **Lookups across tables**: do them in one joined query, not N round trips.

Exception: when the frontend needs the same data sliced multiple ways and assembling on the backend would force multiple round trips, render-side derivation is fine. Bias toward backend assembly.

### Don't bake one shape into a generic endpoint

If an endpoint serves multiple "types" (ticket types, alert types, device types) that have different attribute schemas, don't pluck a single named field out for the response. Return the bag (`attributes: Record<string, unknown>`) and let the consumer pick. Renaming `Site` to `Location` on the frontend is fine; making the backend pretend every ticket has a `Site` is not.

### Mutation responses are `{ id }`; frontend re-fetches

Call this out in review every time. The frontend re-fetches the full page after a successful create/update. No optimistic client-state patches, no returning the full row.

### Don't pre-decide values the caller should own

When a new typed field (status, category, type, role assignment) lands on an entity that admins/sales configure, expose it on the **create** DTO — don't omit it and hardcode a "safe" default in the service to make the field easy to roll out. Omitting forces a create-then-update flow, hides the contract from API consumers, and leaves dead lookup branches.

The field should always appear on the DTO. Whether it's *required* or *optional with a server-side fallback* is a separate decision driven by the deploy-skew rule below. "Optional with default" is fine; "absent from the DTO entirely" is not.

### Backwards-compatible contract changes (deploy skew)

Heylo doesn't atomically deploy frontend and backend. Between a backend merge and the matching frontend rollout completing, the new contract is broken for any client still running the old code.

For **customer-facing endpoints**, default to backwards-compatible additions:

- New DTO properties land **optional** with a server-side default, not required. The field still appears on the DTO so new callers can set it; old callers omitting it get the default and don't 400.
- Don't rename or repurpose existing fields — add a new one and deprecate the old.
- Don't remove enum values that old clients may still send.
- When a removal is genuinely needed, ship it across two deploy cycles: cycle 1 stops sending/depending on the value; cycle 2 deletes the field.

For **super-user / internal-only endpoints with low traffic** (agency creation, infra knobs), requiring a new field is acceptable — but call out the deploy-skew window in the PR description so reviewers can decide whether to coordinate the deploy.

This rule resolves the tension with "Don't pre-decide values the caller should own": the field belongs on the DTO either way; deploy-skew controls whether it's required or optional. A server-side default that exists *only* because the field is absent from the DTO is a smell. A server-side default that exists because the field is optional-for-compat is correct.

### No `eager: true` on entity relations except for tiny lookup tables

Avoid `eager: true` on `@ManyToOne` / `@OneToMany` / `@OneToOne` decorators. ORM auto-loading hides queries from the call site, makes it easy to pull more than the caller needs, and chains recursively when loaded entities have their own eager relations.

The only acceptable use is small, static reference tables — status, type, severity, role-name lookups with a fixed handful of rows that never grow. Even then, prefer requesting the relation explicitly (`relations: ['status']` at the call site, or hand-rolled SQL) so the load is visible in review.

For everything else, fetch the relation explicitly where you need it.

### List-endpoint ordering should be useful to humans

When a list endpoint feeds a UI control (dropdown, picker, sortable table default), `ORDER BY` the human-meaningful column — usually `name ASC` — not by `id` or row-insertion order.

`id` reflects the order rows were inserted in the seed migration; that's not a sort anyone wants in a UI. Exceptions: lists with an intrinsic ordering (priority, severity, time-based) should use that column.

### Validate AND assign — don't half-apply a DTO field

Validating that a DTO value is acceptable is only half the work. If you don't also assign it to the entity, it never gets persisted. AutoMapper carries required `@AutoMap()` fields cleanly, but optional fields can drop silently or overwrite to `undefined` on update. After `mapper.map(dto, …, Entity)`, explicitly assign anything that's optional on update:

```ts
agency.statusId = dto.statusId ?? existing.statusId;
```

Pair this with the existence check in the same method — validate, then assign. A pattern of "validate but never assign" is one of the most common review flags on update endpoints.

### Document new eager relations in the PR description

When you add a relation to an existing entity load — especially on `/users/my`, the auth bootstrap, or anything called on every page render — say *why* in the PR description. One sentence is enough: "FE needs `agency.status` to gate demo-mode UI." Reviewers should not have to open the matching FE PR to find out.

### No silent async failures — surface load errors to the user

Frontend async work (data loads, dropdown population, lookups) must not fail silently. Two related rules, both flagged repeatedly in review:

- **Use `async/await` + `try/catch`, not `.then(setX).catch(console.error)`.** The promise-chain form is hard to reason about in `useEffect`, makes it easy to drop the failure on the floor, and reads inconsistently with the rest of the codebase.
- **Tell the user when a load fails.** A `console.error` is not user-feedback — it's a guarantee the support team will be pinged in Slack instead. Render an inline error message near the affected control (e.g. under the field whose options failed to load) and disable the control while the data is missing. Reset the error state when the dialog/page reopens.

```tsx
// ❌ Silent failure — user sees an empty dropdown and assumes it's broken
useEffect(() => {
  if (!open) return;
  agencyService.getStatuses()
    .then(setStatuses)
    .catch((err) => console.error('Failed to load agency statuses', err));
}, [open]);

// ✅ try/catch + visible error
useEffect(() => {
  if (!open) return;
  const load = async () => {
    try {
      setStatuses(await agencyService.getStatuses());
      setStatusesError('');
    } catch (err) {
      console.error('Failed to load agency statuses', err);
      setStatusesError('Failed to load agency statuses. Please try again.');
    }
  };
  load();
}, [open]);
```

The same applies to any in-component `fetch`/`api.get`/service call where the user would otherwise stare at an empty list, an empty Select, or a stuck spinner with no idea why.

### Don't duplicate role gating in the UI when the screen is already role-gated

If only superadmins can reach a screen, don't gate individual fields on that screen with a second `isSuperAdmin` check — it's redundant, drifts out of sync between sibling components (e.g. `create-modal` vs. `update-modal`), and forces the next reader to figure out which layer is actually load-bearing. Either:

- Trust the route/sidebar gate and render fields unconditionally, or
- If a field genuinely needs a *different* role than the screen, gate it — and document why in a one-line comment.

If you find yourself adding the same `isSuperAdmin` (or other role) check to one of two paired modals but not the other, that's the smell. Pick one approach for the pair.

### Long ternaries → multi-line or `if`

If a `?:` wraps to two lines and you need to count parens to read it, refactor to an `if`. Same for ternaries embedded in JSX.

### Helpers above their callers

Define helper functions above the function that uses them. Reading top-to-bottom should reveal the building blocks before the assembly.

### No JS ternaries in SQL template strings

Building optional `WHERE` clauses with `${condition ? 'AND x = ?' : ''}` makes the params array drift out of sync with the SQL. Always build imperatively:

```ts
let where = 'WHERE a.isDeleted = 0';
const params: Array<string | number | boolean | Date> = [];
if (agencyId) { where += ' AND a.agencyId = ?'; params.push(agencyId); }
```

Use the actual column names from the migration. New columns are camelCase; legacy tables may still contain PascalCase columns.

### No ORM cascade

Never `cascade: true` or `onDelete: 'CASCADE'` on `@ManyToOne`/`@OneToMany`/`@OneToOne`. Delete dependents explicitly inside the service transaction. DB-level FK cascade in a migration is fine as a safety net.

### `COUNT()` returns strings

Wrap with `parseInt()` before returning from a service.

---

## Cross-codebase impact — ask these before approving

Most bugs come from changes that look local but ripple. Walk through:

1. **DTO/contract changes**: did the frontend service, model, and component update too? Did the tablet app? AppSync resolver?
2. **Enum changes**: every consumer of the old value handled? Are there migrations/seed data referencing the old string?
3. **Auth/role changes**: middleware, guards, sidebar visibility, mobile/tablet screens — all aligned?
4. **Realtime events**: if you changed the emitter, did you update the consumer in `frontend/context/socket-context.tsx` and tablet handlers?
5. **DB schema**: migration written? Entity matches lowercase table name? Timestamp columns use `insert: false, update: false` with no JS-side default?
6. **Response shape changes**: any other consumer of this endpoint? Search for the route before changing it.
7. **Removed endpoint/field**: any caller still expecting it? Search before deleting.

If a change touches a shared layer (`ContextService`, `AuthGuard`, `socket-context`, `lib/api.ts`), assume blast radius is the whole repo until proven otherwise.

---

## Self-review checklist before opening a PR

Run this list before requesting human review. Most PR comments are caught here.

### Universal

- [ ] No `any` introduced (search the diff: `rg -n ':\s*any\b|\bas any\b' <files>`).
- [ ] No new dependencies; if there is one, justification is explicit in the PR description.
- [ ] All hardcoded enums-worthy strings reference an enum/constant.
- [ ] Code style matches the surrounding file (indentation, naming, import order, error-handling pattern).
- [ ] Helper functions defined above their callers.
- [ ] Long ternaries broken into `if`/multi-line.
- [ ] No code is being added that another layer (middleware, guard, context, hook) could provide once.

### Backend-specific

- [ ] Reads use `repository.manager.query()` (no `findAndCount` / `find` with relations / joined `createQueryBuilder`).
- [ ] Multi-table writes wrapped in `manager.transaction(async (manager) => …)`.
- [ ] No `cascade: true` / `onDelete: 'CASCADE'` on relation decorators.
- [ ] Create/update endpoints return `{ id }` only.
- [ ] Pagination uses two separate queries (`SELECT …` + `SELECT COUNT(*) AS total`); no `COUNT(*) OVER()`.
- [ ] `COUNT()` results wrapped in `parseInt()`.
- [ ] `WHERE` clauses built imperatively, not via JS ternaries inside SQL strings.
- [ ] Entity table name lowercase, new columns camelCase, timestamps `insert: false, update: false`.
- [ ] Backend ships the data shape the frontend renders directly (`{ open, resolved }`, totals, etc.) — frontend isn't filtering/counting.
- [ ] Validation that applies to *all* endpoints lives in `ContextService` / `AuthGuard` / `RolesGuard`, not duplicated in services.
- [ ] Errors throw NestJS exceptions (`BadRequestException`, `ForbiddenException`, etc.), not bare `throw new Error(...)`.
- [ ] Logs include entity IDs only — no physical device IDs, secrets, tokens, or PII.
- [ ] Agency authorization uses `contextSvc.agencyId`, not `userRoles[0].agencyId`.
- [ ] No `deviceCapability` references — uses `deviceType.name` + `DeviceTypeName` enum.
- [ ] User updates don't change `agencyId`; role changes are limited to `admin` ↔ `supportProfessional`.
- [ ] Queries on agency-scoped entities filter by the actual agency column, usually `agencyId` in new tables (no tenancy leaks).
- [ ] No unbounded `SELECT` on growth-prone tables (alerts, calls, events, messages) — `LIMIT` or tenancy filter present.
- [ ] No N+1 in service methods — joined queries instead of per-row lookups.
- [ ] Migration seed/lookup SQL imports the matching enum and uses parameter bindings — no inline string literals.
- [ ] Every DTO field validated in a service method is also assigned to the entity (with `?? existing.x` fallback when optional on update).
- [ ] New typed/configurable fields (status, category, type) are exposed on the **create** DTO — not omitted in favor of a hardcoded default.
- [ ] New required fields on customer-facing DTOs are landed as **optional with a server-side default**; required-only is reserved for super-user/internal endpoints, and the deploy-skew window is called out in the PR.
- [ ] No `eager: true` on relation decorators — exception is small static reference tables (status/type/severity), and even those prefer explicit `relations: [...]` at call time.
- [ ] List endpoints feeding UI controls `ORDER BY` the human-meaningful column (usually `name ASC`) — not `id` or insertion order.
- [ ] New eager relations on existing entity loads (`/me`, auth bootstrap, list endpoints) are explained in the PR description.

### Frontend-specific

- [ ] Existing libraries used for date math (`date-fns`), UI primitives (Radix or MUI as appropriate), HTTP (`lib/api.ts`).
- [ ] No client-side filtering/grouping/counting that the backend should do.
- [ ] After a mutation, the page re-fetches via the existing service — no optimistic client-state patches.
- [ ] Generic endpoint consumers don't bake one ticket/alert/device "type" into the rendering.
- [ ] Role gating in `middleware.ts` and sidebar visibility match.
- [ ] Async loads in components use `async/await` + `try/catch` (not `.then().catch()`); failures set a user-visible error state and the dependent control is disabled while data is missing.
- [ ] Sibling create/update modals (and other paired flows) handle role gating the same way — no `isSuperAdmin` in one but not the other.

### Cross-repo

- [ ] DTO field names match between backend, frontend, and (if relevant) tablet/AppSync.
- [ ] Enum values match across repos.
- [ ] Realtime event emitters and consumers both updated.
- [ ] Docs in `_Engineering/<area>/` updated when architecture or a contract changed.

---

## How to present findings

When reporting a review (especially via `/code-review` or in a PR comment thread), group findings by severity so the author knows what to fix first:

- **Blockers** — must fix before merge. Anything from "Hard rules" above, plus correctness bugs, security issues, tenancy leaks, and contract drift.
- **Warnings** — should fix, but not a dealbreaker. Soft-rule violations, performance smells, missed boy-scout opportunities, drift from the surrounding file's style.
- **Nits** — style/preference, optional. Naming, formatting the linter didn't catch, comment quality.

Each finding should include the file path with line number (`backend/src/services/x.service.ts:142`), one sentence describing the issue, and one sentence on the fix. Don't restate the rule — link to the section of this guide.

---

## When in doubt

- Ask: "Would chris flag this?" If the answer is plausibly yes, fix it before he does.
- Ask: "Could a future reader add a new caller to this code without re-deriving every constraint?" If no, the constraint is hidden — surface it (enum, type, guard, comment that explains *why*).
- Ask: "Am I making the codebase bigger, or am I making it more coherent?" Both can ship; only the second is a clean review.
