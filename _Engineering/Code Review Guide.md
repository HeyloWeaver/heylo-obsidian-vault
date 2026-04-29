---
type: guide
tags: [engineering, agents, review]
owner: Mike
updated: 2026-04-29
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

- Before reaching for a new dep, **search the workspace first**: `grep -r "from \"<keyword>\"" frontend/ backend/` and check `package.json`.
- Date formatting → `date-fns` (already used everywhere — see `frontend/components/caseload-management/`).
- UI primitives → Radix + components in `components/ui/` (frontend) or MUI 7 (customer-onboarding, inventory).
- State → Redux Toolkit (frontend), Zustand 5 (customer-onboarding, inventory).
- HTTP → axios via `frontend/lib/api.ts` or NestJS `HttpService`.
- If you genuinely need something new, raise it in standup or Slack first — don't sneak it in via a PR.

### No hardcoded literals where an enum exists (or should exist)

- Strings like `'open'`, `'resolved'`, role names, status codes — always reference the enum.
- If the enum doesn't exist yet, **create it** in `backend/src/domain/enums/` or `frontend/lib/models/.../enums`. This is a project rule, not a preference.

### Validation belongs in the right layer

Before adding a guard at the top of a service method, ask: *can a guard, middleware, interceptor, or `ContextService` handle this once for everyone?*

- "Is the user real and not deleted?" → `ContextService.validateJwtToken` (backend).
- "Does the user have role X?" → `@Roles()` + `RolesGuard`.
- "Is this request authenticated?" → `AuthGuard`.
- "Does the agency match the resource's tenancy?" → consider a tenancy helper rather than per-endpoint joins.

If you find yourself writing the same `if (!user) return [];` in three services, that's the smell — fix the layer, not the endpoint.

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

This is in the Backend Agent Work Guide and Ritwik's CLAUDE.md both — call it out in review every time. The frontend re-fetches the full page after a successful create/update. No optimistic store patches, no returning the full row.

### Long ternaries → multi-line or `if`

If a `?:` wraps to two lines and you need to count parens to read it, refactor to an `if`. Same for ternaries embedded in JSX.

### Helpers above their callers

Define helper functions above the function that uses them. Reading top-to-bottom should reveal the building blocks before the assembly.

### No JS ternaries in SQL template strings

Building optional `WHERE` clauses with `${condition ? 'AND x = ?' : ''}` makes the params array drift out of sync with the SQL. Always build imperatively:

```ts
let where = 'WHERE a.IsDeleted = 0';
const params: any[] = [];
if (agencyId) { where += ' AND a.AgencyId = ?'; params.push(agencyId); }
```

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
6. **Response shape changes**: any other consumer of this endpoint? grep for the route.
7. **Removed endpoint/field**: any caller still expecting it? grep before deleting.

If a change touches a shared layer (`ContextService`, `AuthGuard`, `socket-context`, `lib/api.ts`), assume blast radius is the whole repo until proven otherwise.

---

## Self-review checklist before opening a PR

Run this list before requesting human review. Most PR comments are caught here.

### Universal

- [ ] No `any` introduced (search the diff: `grep -nE ':\s*any\b|\bas any\b' <files>`).
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
- [ ] Entity table name lowercase, columns PascalCase, timestamps `insert: false, update: false`.
- [ ] Backend ships the data shape the frontend renders directly (`{ open, resolved }`, totals, etc.) — frontend isn't filtering/counting.
- [ ] Validation that applies to *all* endpoints lives in `ContextService` / `AuthGuard` / `RolesGuard`, not duplicated in services.

### Frontend-specific

- [ ] Existing libraries used for date math (`date-fns`), UI primitives (Radix or MUI as appropriate), HTTP (`lib/api.ts`).
- [ ] No client-side filtering/grouping/counting that the backend should do.
- [ ] After a mutation, the page re-fetches via the existing service — no Redux store patches.
- [ ] Generic endpoint consumers don't bake one ticket/alert/device "type" into the rendering.
- [ ] Role gating in `middleware.ts` and sidebar visibility match.

### Cross-repo

- [ ] DTO field names match between backend, frontend, and (if relevant) tablet/AppSync.
- [ ] Enum values match across repos.
- [ ] Realtime event emitters and consumers both updated.
- [ ] Docs in `_Engineering/<area>/` updated when architecture or a contract changed.

---

## When in doubt

- Ask: "Would chris flag this?" If the answer is plausibly yes, fix it before he does.
- Ask: "Could a future reader add a new caller to this code without re-deriving every constraint?" If no, the constraint is hidden — surface it (enum, type, guard, comment that explains *why*).
- Ask: "Am I making the codebase bigger, or am I making it more coherent?" Both can ship; only the second is a clean review.
