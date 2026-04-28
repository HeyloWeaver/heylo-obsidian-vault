---
status: proposed
owner: Mike
created: 2026-04-28
tags:
  - plan
  - frontend
  - caseload
related:
  - "[[Caseload Redesign v1]]"
  - "[[Frontend/Domain - Caseload]]"
  - "[[Go/Domain - Caseload]]"
type: plan
ticket: HEY-366
---

# Caseload Creation Redesign — Plan (HEY-366)

Linear: [HEY-366: Caseload Creation redesign](https://linear.app/heylo-tech/issue/HEY-366/caseload-creation-redesign)

## Goal

Replace the v2 "Create Schedule" path with a new **Add Caseload** form that submits to the new Go AppSync `addCaseload` mutation (shipped in `go` repo commit `0f580f8`). The form lives only on `/caseload-management/v2`; the legacy REST `/caseload` flow on the v1 page is untouched.

The work is **frontend-only**. Logic that the v1 form computes locally (concrete-date expansion of weekly slots, per-slot conflict grouping, timezone forwarding) now happens server-side in Go — we delete that code rather than port it.

## Definition of Done

- A new form, **Add Caseload**, opens from the v2 page's "Create Schedule" button and from empty-cell clicks on `CalendarMonth` / `CalendarWeek`.
- It submits to the GraphQL `addCaseload` mutation through Apollo and is wired up in `services/caseloadServiceV2.ts` (or a sibling).
- On success, the v2 page re-fetches the schedule via the existing `loadSchedule({ force: true })` action (no optimistic store update).
- Inputs collected: site multi-select, date range (start required, end optional), per-day enabled + one or more time slots, optional `name`.
- **No user selection** in the create form — caseloads are created unassigned and assigned via the existing `AssignSchedule` flow.
- Server-side `ScheduleConflict` errors render as a single inline form error pointing the user to the legacy list to inspect (no per-slot highlight in v1 of this redesign — see Open Questions).
- Edit / split-assignment paths continue to use the legacy REST `CreateUpdateSchedule` modal *for now* — see Scope Boundaries.

## Scope Boundaries (what we are NOT doing)

- Not touching `backend/` (Nest API), `go/`, `tablet/`, `hub/`. The Go endpoint is already merged.
- Not migrating **edit** or **delete** to Go. `addCaseload` is create-only; updates and deletes still flow through `caseloadService` REST endpoints.
- Not migrating the legacy `/caseload-management` (v1) page. v1 keeps the REST-backed `CreateUpdateSchedule` until v2 fully replaces it.
- Not changing the assignment flow (`AssignSchedule` / `assignCaseload`) — assignment remains REST.
- Not introducing a new state library; we keep `useCaseloadScheduleStore` (Zustand) for v2 page state.
- Not adding optimistic updates — re-fetch after mutation per the [[Frontend/Agent Work Guide]] convention.

## Open Questions

- **`dayOfWeek` numbering** — Go validates `0–6` but does not pin which day is `0`. Frontend v1 uses `Monday=1 … Sunday=7`; JS `Date.getDay()` and Go `time.Weekday` use `Sunday=0 … Saturday=6`. **Proposal:** standardize on `Sunday=0 … Saturday=6` for the new mutation since it matches Go's `time.Weekday` and the JS `Date` API used in the read path. Confirm with Chris before wiring.
- **Conflict UX regression** — v1 shows red-bordered slots and a per-day conflicts popover (`groupConflictsByWeekday`). Go returns a single `ScheduleConflict` error with a message naming the conflicting caseload ID. **Proposal:** show that message in the form's root error region and skip per-slot decoration; add a follow-up ticket to enrich the Go error payload (e.g., return offending intervals) if we want richer UI.
- **`name` field** — the Go input accepts an optional name. Linear ticket doesn't say if we expose it. **Proposal:** add it as an optional text input above the date range so it shows up in the existing caseload list immediately.
- **Where to mount the new form** — co-locate under `frontend/components/caseload-management/v2/` (next to `schedule-page.tsx`), or keep at `frontend/components/caseload-management/` so the v1 page can adopt it later? **Proposal:** mount under `v2/` — the v1 page stays on REST until retired, and co-location keeps the v2 surface self-contained.

---

## Proposed File Layout

```
frontend/
  app/(private)/caseload-management/v2/
    page.tsx                                # unchanged

  components/caseload-management/v2/
    add-caseload.tsx                        # NEW — form modal targeting Go addCaseload
    schedule-page.tsx                       # UPDATE — open <AddCaseload/> instead of <CreateUpdateSchedule/> for creates
    (calendar/, toolbar/ unchanged)

  lib/models/caseload/
    addCaseloadRequest.ts                   # NEW — typed input matching the GraphQL mutation
    formSchemas.ts                          # UPDATE — add AddCaseloadSchema (no userId, optional name)

  services/
    caseloadServiceV2.ts                    # UPDATE — add `addCaseload` mutation alongside `getSchedule`
```

Edit and split-assignment flows in `schedule-page.tsx` (`handleScheduleEntryClick`) keep using the existing `CreateUpdateSchedule` modal until those endpoints are migrated.

## What moves off the frontend

| Today (v1 form) | After (v2 + Go) |
|---|---|
| `onSubmit` flattens `schedule[]` × slots × `getNextDayDate` into concrete `daySchedules` with start/end Dates | Submit raw `daysOfWeek: [{ dayOfWeek, startTime, endTime }]` — Go expands intervals (incl. overnight split at midnight) |
| Sentinel `endDate.setHours(23,59,59)` | Send `endDate` as `YYYY-MM-DD`; Go treats it as inclusive |
| `timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone` | Not sent — Go parses dates as UTC date-only |
| Catch `ScheduleConflictException` and run `groupConflictsByWeekday` to highlight slots | Catch Go `ScheduleConflict` error and render the message; no per-slot decoration |
| User selection on create (`userId`) | Removed from create — assignment via `AssignSchedule` |

Once **all** v2 create entry-points use the new form, we can drop `getNextDayDate` and `groupConflictsByWeekday` from `frontend/lib/utils.ts` *if* no other caller remains. Verify before deleting.

## Service layer

`services/caseloadServiceV2.ts` adds an Apollo mutation alongside the existing `getSchedule` query. Sketch:

```ts
const ADD_CASELOAD = gql`
  mutation AddCaseload(
    $startDate: String!
    $endDate: String
    $siteIds: [ID!]!
    $daysOfWeek: [DayOfWeekTimeInput!]!
    $name: String
  ) {
    addCaseload(
      startDate: $startDate
      endDate: $endDate
      siteIds: $siteIds
      daysOfWeek: $daysOfWeek
      name: $name
    ) { id }
  }
`;

export const caseloadService = {
  async getSchedule(...): Promise<GetScheduleResponse> { /* existing */ },

  async addCaseload(req: AddCaseloadRequest): Promise<{ id: string }> {
    const result = await apolloClient.mutate({
      mutation: ADD_CASELOAD,
      variables: req,
    });
    if (!result.data?.addCaseload?.id) throw new Error("addCaseload returned no id");
    return result.data.addCaseload;
  },
};
```

`AddCaseloadRequest` lives in `lib/models/caseload/addCaseloadRequest.ts` and mirrors the GraphQL input verbatim — no `userId`, no `timezoneId`, no concrete `daySchedules`.

## Form schema and component

New zod schema `AddCaseloadSchema` (in `formSchemas.ts`): drop `userId`, add optional `name`, keep `siteIds`, `date`, and the existing `schedule[]` shape (the per-day enabled + slots structure). The submit handler maps each enabled day's slots to `{ dayOfWeek, startTime, endTime }` using the agreed-on numbering (see Open Questions) — no date math, no timezone.

`add-caseload.tsx` is a fork of `create-update-schedule.tsx` with the user-related code removed:

- Drop the `userService.postSearch` fetch and the `<UserSelect/>` field.
- Drop the `defaultValues?.userId` branch in the data-fetching effect.
- Drop `caseloadId`/`isEditMode`/edit-mode display branches — this modal is create-only.
- Drop `groupConflictsByWeekday` import and `setScheduleConflicts` plumbing into `<WeekDaySchedule/>`.
- Catch `ApolloError` → if the GraphQL error type is `ScheduleConflict`, set `form.setError("root", { message })`; otherwise show the generic message.
- Add an optional name `<Input/>` at the top of the form body.

`<WeekDaySchedule/>` itself stays on the existing `conflicts` prop signature — we just always pass `{}` from the new form. That keeps the legacy v1 page working unchanged.

## Wiring `schedule-page.tsx`

In `frontend/components/caseload-management/v2/schedule-page.tsx`:

- Replace the `openCreateSchedule` and `handleEmptyCellCreate` handlers' target modal with `<AddCaseload/>`.
- `<AddCaseload/>` only needs `open`, `onOpenChange`, `onSuccess`, `defaultValues` — no `caseloadId`, `displayName`, `isSplit`.
- Continue to mount `<CreateUpdateSchedule/>` for `handleScheduleEntryClick` (edits) until the edit endpoint is migrated.
- `onSuccess` calls `loadSchedule({ force: true })` exactly as today.

## Constants

Add to `lib/models/caseload/caseloadConstants.ts`:

```ts
/** Conflict error type returned by Go addCaseload */
export const SCHEDULE_CONFLICT_ERROR_TYPE = "ScheduleConflict";

/** Bad-input error type returned by Go addCaseload */
export const BAD_INPUT_ERROR_TYPE = "BadInput";
```

No new route paths; v2 path constant already lives in this file.

## Milestones

1. **Models + service** — add `AddCaseloadRequest`, `AddCaseloadSchema`, `caseloadService.addCaseload` mutation; no UI yet. Verify against a real Go env with `apollo client` devtools.
2. **`add-caseload.tsx` modal** — fork the v1 form, strip user/edit branches, render against fixture submit (logging mutation variables only).
3. **Wire to `schedule-page.tsx`** — both "Create Schedule" header button and empty-cell click open the new modal; success triggers `loadSchedule({ force: true })`.
4. **Conflict + bad-input error rendering** — surface Go errors in `form.setError("root", …)`.
5. **Optional `name` input** — text field above date range, defaults to empty.
6. **Cleanup pass** — confirm legacy v1 page still compiles; remove `userId`, `timezoneId`, and date-flattening helpers from any callers we just orphaned (only if no other caller remains).
7. **Docs** — update `_Engineering/Frontend/Domain - Caseload.md` to mention the v2 mutation path; add a one-liner to `_Engineering/Go/Domain - Caseload.md` cross-referencing the consumer.

## Risks / Watch-outs

- **`dayOfWeek` numbering drift** — get explicit confirmation from Chris before merging; mismatch will silently reverse weekly schedules.
- **Lost conflict granularity** — falling back to a single error string is a UX regression vs. v1; surface the Linear ticket for "enrich Go error payload" so it doesn't get forgotten.
- **Apollo cache** — `getCaseloadSchedule` results are cached; after `addCaseload`, we already call `loadSchedule({ force: true })` (`fetchPolicy: "network-only"`). Double-check the force path actually bypasses cache for the affected month.
- **End-date semantics** — v1 sentinel was `23:59:59` on the end date. Go now treats end as a `YYYY-MM-DD` and stores it as midnight; conflict logic uses `EndDateTime IS NULL OR EndDateTime >= start`. Verify a same-day end-date caseload renders correctly in the calendar.
- **Overnight slots** — Go splits overnight intervals at midnight; the form must allow `endTime < startTime` for cross-midnight shifts. Confirm `<WeekDaySchedule/>`'s `isValidEndTime` doesn't block this case (it currently treats `end <= start` as invalid). Likely needs a small relaxation or a follow-up.
- **Dual code paths during migration** — both `CreateUpdateSchedule` (REST) and `AddCaseload` (GraphQL) live in the v2 tree. Document which one to touch in `_Engineering/Frontend/Domain - Caseload.md` to avoid confusion.

## Out-of-scope (explicitly deferred)

- Migrating update/delete to Go.
- Migrating the v1 `/caseload-management` page.
- Per-slot conflict highlighting (depends on enriching the Go error payload first).
- Cross-midnight UX polish in `<WeekDaySchedule/>` if it requires more than a guard relaxation.
- Removing REST `caseloadService.createCaseload` from the codebase — keep until all callers are gone.

## Related Code Anchors

- Go endpoint: `go/backend/appsync/addcaseload.go`, `go/backend/appsync/schema.graphql` (`addCaseload` mutation, `DayOfWeekTimeInput`)
- Existing v1 form: `frontend/components/caseload-management/create-update-schedule.tsx`
- Existing v2 page + store: `frontend/components/caseload-management/v2/schedule-page.tsx`, `frontend/stores/useCaseloadScheduleStore.ts`
- Existing v2 service: `frontend/services/caseloadServiceV2.ts`
- Form schema: `frontend/lib/models/caseload/formSchemas.ts`
- Constants: `frontend/lib/models/caseload/caseloadConstants.ts`
- Apollo client: `frontend/lib/apollo-client.ts`
