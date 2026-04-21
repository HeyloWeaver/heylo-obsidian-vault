---
status: in_progress
owner: Mike
created: 2026-04-20
tags:
  - plan
  - frontend
  - caseload
related:
  - "[[Frontend/High Level Overview]]"
type: plan
updated: 2026-04-21
---

# Caseload Redesign v1 — Plan

## Goal

Ship the first pass of the redesigned Caseload Management experience as a **new, separate page** (new file, new URL) so it can evolve alongside the existing `/caseload-management` page without regressing the admin flow currently in production.

This first milestone is **view-only, super-admin-only**: a super user lands on the new page, picks a month, filters by site and/or user, and sees the agency's schedule for that month. Day cells show who is scheduled, when, and where, ordered by user. Mutations (create/edit/delete schedule) are explicitly out of scope.

## Definition of Done

Pulled from the ticket so we check the boxes on merge:

- Route is `/caseload-management/beta`, nested under the existing caseload-management tree.
- The new sidebar entry renders **only for `superAdmin`** — it is hidden for `admin`, `supportProfessional`, and `resident`.
- Clicking it opens the new UX.
- Month picker is present; selecting a month shows the agency schedule for that month.
- Site filter is present and functional.
- User filter is present and functional.
- For any given day, each schedule entry shows: scheduled user, start time, end time, and site.
- Entries within a day are **ordered by user** (a user may appear multiple times if scheduled across multiple sites).
- Data is driven by a JSON fixture (no live API).
- One single "get all schedule data" call shape is assumed — one endpoint returns everything the page needs.

## Scope Boundaries (what we are NOT doing)

- No GraphQL wiring yet. The page talks to a local fixture via a mock service that matches the eventual `GetSchedule` contract.
- No mutation flows (no create / edit / delete schedule). Existing modals on the legacy page stay where they are.
- No Vercel middleware. Role gating stays in the sidebar filter + page-level guard, consistent with the rest of the app.
- No mobile-specific layout in v1. We design the DOM so a mobile pass is feasible in v2, but we don't ship it.
- Not touching the legacy `/caseload-management` page, the legacy `caseload-context.tsx`, or `caseloadService.ts`.

## Open Questions

- **Schedule data shape** — Chris to confirm the JSON shape. Stub below is a placeholder; we'll align on merge.
- **CSS / component library** — proposal below (stay on shadcn/ui, add `zustand`). Flag before implementation if we want to try something different for the calendar grid.

---

## Proposed URL & File Layout

New page at `/caseload-management/beta`, nested under the existing route:

```
frontend/
  app/(private)/caseload-management/
    page.tsx                       # Legacy — unchanged
    beta/
      page.tsx                     # New route entry, wraps view in store provider
      layout.tsx                   # superAdmin-only guard

  components/caseload-management/
    (legacy files unchanged)
    beta/
      schedule-page.tsx            # Top-level composition (toolbar + grid)
      toolbar/
        schedule-toolbar.tsx       # Hosts month picker + filters + view toggle
        month-picker.tsx           # Month/year dropdown
        site-filter.tsx            # Multi-select pills
        user-filter.tsx            # Multi-select pills
        view-toggle.tsx            # Month / Week toggle (week view stubbed)
      calendar/
        calendar-month.tsx         # 6x7 grid of CalendarDay
        calendar-week.tsx          # 1x7 row of CalendarDay (behind toggle)
        calendar-day.tsx           # Single day cell: date header + ordered pill list
        schedule-pill.tsx          # Atomic pill: user • time • site
      empty-state.tsx
      loading-state.tsx

  lib/models/caseload-beta/
    scheduleModel.ts               # Types for the fixture / eventual GraphQL payload

  services/
    caseloadScheduleBetaService.ts # Mock service: loads fixture, returns typed response

  lib/fixtures/
    caseload-schedule.sample.json  # Fixture data (awaiting Chris)

  stores/
    useCaseloadScheduleBetaStore.ts # Zustand store (filters + data + derived selectors)
```

Co-locating the new code under `/caseload-management/beta/` (both in `app/` and in `components/`) keeps the "beta of an existing feature" relationship obvious and makes cleanup trivial when the legacy page is retired.

## Navigation & Access

SuperAdmin-only visibility. The new entry is a **top-level sidebar item** — front-and-center so superAdmins don't have to hunt through the "Support" submenu to find it.

**Sidebar change** in `components/sidebar/app-sidebar.tsx#data.navMain`, add a new top-level item:

```ts
{
  title: "Caseload Management",
  url: "/caseload-management/v2",
  icon: CalendarRange, // or another distinct lucide icon
},
```

**Role filter change** in `lib/utils.ts#filterNavigationLinks`. The existing rules hide `Caseload Management` from superAdmin and hide a bunch of items from non-superAdmins. Add one new rule: show `Caseload Management` only when `userRole === RoleId.superAdmin`:

```ts
// Hide the new beta page from everyone except superAdmin
if (
  userRole !== RoleId.superAdmin &&
  item.path === "/caseload-management/v2"
) {
  return false;
}
```

Place that rule alongside the existing `superAdmin`-specific carve-outs so the intent stays grouped. Note: this rule needs to live *outside* the existing "hide regular nav items from superAdmin" block — otherwise the beta item would be caught by that sweep too. Confirm during implementation.

**Page-level guard** inside `app/(private)/caseload-management/beta/layout.tsx`: read `useUser()`; if `userRole !== RoleId.superAdmin`, render a 403-ish empty state. No new `middleware.ts` rules. This catches anyone who hand-types `/caseload-management/beta` despite the sidebar filter.

Trade-off we're accepting: this breaks the existing convention of "superAdmin-only pages live under the 'Support' submenu" (e.g., `/caseload/superuser`, `/alerts/superuser`). We're prioritizing discoverability for this launch. If the pattern gets awkward — e.g., the beta ships widely and we want to replace the admin page — we'll revisit placement at that time.

## State Management — Zustand

We introduce `zustand` on this page as the first adoption, scoped so it doesn't bleed into legacy pages:

- Add `zustand` to `frontend/package.json`.
- One store: `useCaseloadScheduleBetaStore` in `frontend/stores/useCaseloadScheduleBetaStore.ts`.
- Store slices (single store, plain actions — no slice middleware needed at this size):
  - `filters`: `{ selectedMonth: Date, selectedSiteIds: string[], selectedUserIds: string[], view: 'month' | 'week' }`
  - `data`: `{ response: GetScheduleResponse | null, isLoading: boolean, error: Error | null }`
  - `ui`: `{ activeDay: string | null }` (for future side panel; not required in v1)
- Actions: `setMonth`, `setView`, `toggleSite`, `toggleUser`, `clearFilters`, `loadSchedule`.
- Selectors (co-located, memoized with `useShallow`):
  - `selectVisibleEntries(state)` → entries filtered by selected sites/users.
  - `selectEntriesByDay(state, dayISO)` → sorted by user name, then start time.
  - `selectSiteById`, `selectUserById` for pill rendering.

Rationale for Zustand over existing React Context (used by legacy `caseload-context.tsx`): the grid re-renders hot as filters change; fine-grained subscriptions via Zustand selectors avoid the context-wide re-render pattern, and the store is easy to mock in tests / storybook later.

## CSS / Component Library

- Stay on **shadcn/ui + Tailwind v4**, matching the rest of the app. Adds no new runtime library for UI primitives.
- Use **`react-day-picker`** (already in deps) for `MonthPicker` (dropdown caption mode, hide the day grid).
- Use **`date-fns`** (already in deps) for month/week math (`startOfMonth`, `eachDayOfInterval`, `format`, etc.). Do **not** add `dayjs` or `luxon`.
- Calendar grid is hand-rolled with Tailwind grid utilities — cheaper and more controllable than pulling in `react-big-calendar` or FullCalendar for a read-only view.
- If we find ourselves fighting the grid, the fallback is `react-big-calendar` — flag before adopting.

## Atomic Components (build order)

Built bottom-up so each can be visually reviewed in isolation:

1. `SchedulePill` — `{ user, start, end, site }`. Variants: default, multi-site (dot indicator), overflow (compact). Shows user initials/avatar, `HH:mm–HH:mm`, site chip. Click → no-op in v1 (hook point for future detail panel).
2. `CalendarDay` — `{ date, entries }`. Header (date number, "today" state), scrollable list of `SchedulePill`s **ordered by user name then start time**, "+N more" collapse when too many.
3. `CalendarWeek` — `{ weekStart, entriesByDay }`. 7-column row of `CalendarDay`.
4. `CalendarMonth` — `{ month, entriesByDay }`. 6-week grid, leading/trailing days dimmed.
5. `MonthPicker` — controlled; emits `Date` for first of month.
6. `SiteFilter` / `UserFilter` — multi-select popovers; pill chips for active selections; "Clear" affordance.
7. `ScheduleToolbar` — composes MonthPicker + filters + view toggle; sticky at top of page.
8. `SchedulePage` — composes toolbar + month/week view, handles loading/empty/error.

## Data Layer

### Service

`services/caseloadScheduleBetaService.ts`:

```ts
export const caseloadScheduleBetaService = {
  async getSchedule(req: { month: string /* YYYY-MM */ }): Promise<GetScheduleResponse> {
    // v1: return fixture filtered to requested month
    // v2: swap to GraphQL / AppSync call — call site unchanged
  },
};
```

A single endpoint, single call. The store's `loadSchedule(month)` action is the only caller.

### Fixture

`lib/fixtures/caseload-schedule.sample.json` — shape stub pending Chris:

```ts
type GetScheduleResponse = {
  month: string;                               // "2026-05"
  agency: { id: string; name: string };
  sites: Array<{ id: string; name: string; colorHex?: string }>;
  users: Array<{ id: string; name: string; avatarUrl?: string }>;
  entries: Array<{
    id: string;
    userId: string;
    siteId: string;
    date: string;                              // "2026-05-14"
    startTime: string;                         // "09:00"
    endTime: string;                           // "17:00"
    notes?: string;
  }>;
};
```

Fixture should cover: multiple users, multiple sites, one user scheduled at two sites on the same day, a day with zero entries, a day with many entries (overflow), and days at month boundaries.

## Milestones

1. **Scaffolding** — new route at `/caseload-management/beta`, top-level sidebar entry gated to superAdmin, page-level guard, empty page that renders "Beta".
2. **Store + service + fixture** — `useCaseloadScheduleBetaStore` loads the fixture; show raw JSON to sanity-check.
3. **Atomic pieces** — `SchedulePill`, `CalendarDay` in isolation with hardcoded props.
4. **Month view** — `CalendarMonth` wired to the store, no filters yet.
5. **Month picker** — changing month re-loads fixture (filter by `month` in the mock service).
6. **Filters** — `SiteFilter`, `UserFilter` drive selectors; grid updates without refetch.
7. **Polish** — loading, empty, error states; today indicator; overflow behavior.
8. **Week view toggle** — behind the view toggle, reuses `CalendarDay`.
9. **Cleanup** — remove dead fixture scaffolding that won't apply once GraphQL lands; leave a `TODO(graphql)` at the service boundary.

## Risks / Watch-outs

- **Fixture drift** — if we build before Chris's shape lands, we'll rework types. Mitigation: wrap the fixture in an adapter so the shape change is one file.
- **Zustand adoption scope creep** — keep the store in `frontend/stores/` and page-specific. Don't rewrite `caseload-context.tsx`.
- **Overflow in dense days** — a single site with 10+ users on one day will blow up a calendar cell. Plan for "+N more" from the start.
- **Month boundaries & timezones** — agency-local TZ vs. browser TZ. Render using the agency's timezone if present in the payload; document the assumption.
- **Accessibility of the grid** — keyboard nav across days isn't required in v1, but don't build ourselves into a `div`-soup corner. Use `role="grid"` semantics.
- **Nested-route access leak** — because `/caseload-management/beta` lives under the legacy parent, a non-superAdmin who hand-types the URL must hit the page-level guard. Don't rely on sidebar filtering alone.
- **Filter-rule ordering** — the new `Caseload Management` rule in `filterNavigationLinks` must be placed such that it isn't short-circuited by the existing "hide regular nav items from superAdmin" block. Double-check on implementation.

## Out-of-scope (explicitly deferred)

- Mobile layout.
- Create / edit / delete schedule.
- Conflict detection / warnings on overlapping shifts.
- Drag-to-reschedule.
- Printing / export.
- Live GraphQL wiring.
- Exposing the page to `admin` (the legacy `/caseload-management` remains the admin surface).

## Related Code Anchors

- Legacy page: `frontend/app/(private)/caseload-management/page.tsx`
- Legacy components: `frontend/components/caseload-management/*`
- Legacy context: `frontend/context/caseload-context.tsx`
- Sidebar: `frontend/components/sidebar/app-sidebar.tsx`
- Nav role filter: `frontend/lib/utils.ts#filterNavigationLinks`
- Service pattern: `frontend/services/caseloadService.ts`
- Existing models: `frontend/lib/models/caseload/*`
- Existing superAdmin precedent: `/caseload/superuser`, `/alerts/superuser`, etc., all exposed via the "Support" nested menu.