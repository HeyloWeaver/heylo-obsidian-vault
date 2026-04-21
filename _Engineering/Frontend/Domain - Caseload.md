---
type: domain
tags: [frontend, caseload]
owner: Mike
updated: 2026-04-21
status: current
---
# Frontend Domain - Caseload

## Primary ownership

- Caseload management pages and scheduling UX.
- Caseload data loading/editing and shift/conflict presentation.
- Current transition path from fixture-backed beta toward GraphQL-backed reads.

## Read these first

- `frontend/app/(private)/caseload-management/`
- `frontend/components/caseload-management/`
- `frontend/services/beta/caseloadService.ts`
- `frontend/stores/useCaseloadScheduleStore.ts`
- `frontend/lib/models/caseload/caseloadConstants.ts` — all enums, route paths, and shared constants for this feature; read before touching any caseload component
- `frontend/lib/models/caseload/`
- `frontend/lib/fixtures/caseload-schedule.sample.json`

## Constants and enums (`caseloadConstants.ts`)

All repeated values for the caseload feature live in `lib/models/caseload/caseloadConstants.ts`. Do not add new hardcoded strings, numbers, or route paths to components — add them here first.

Key exports:

| Export | What it is |
|---|---|
| `ViewMode` | String enum — `Month` / `Week` |
| `WeekLayout` | String enum — `Site` / `Person` |
| `CASELOAD_V2_PATH` | Route string `/caseload-management/v2` |
| `DAY_LABELS` | `["Sun" … "Sat"]` shared across calendar views |
| `DEFAULT_SITE_COLOR` | Fallback hex when a site has no `colorHex` |
| `PILL_BORDER_LEFT_WIDTH` | Border width on schedule pills |
| `PILL_BG_ALPHA` | Background opacity on schedule pills |
| `UNASSIGNED_STAFF_LABEL` | Displayed when a user can't be resolved |
| `UNKNOWN_SITE_LABEL` | Displayed when a site can't be resolved |
| `AGENCY_NAME_PLACEHOLDER` | Placeholder until the API returns agency name |

## Common change patterns

1. Adjust schedule fields/contracts → update models + service return types.
2. Update list/schedule components and empty/loading states.
3. Keep store state transitions aligned with component expectations.
4. If moving API source, make migration path explicit and test both flows.

## Gotchas

- Beta scheduling work has active evolution; read TODOs before refactoring.
- Fixture-backed behavior can mask backend contract issues.
- Timezone and date-window logic is easy to regress.
- `AGENCY_NAME_PLACEHOLDER` is a known stub — agency name is not yet fetched from GraphQL.

## Done checklist

- Schedule data renders correctly across date ranges.
- CRUD/update workflows still persist and refresh expected UI state.
- Empty/loading/error states are still coherent.
- No hidden dependency on fixture-specific shape.
- New string/number values added to `caseloadConstants.ts`, not inlined in components.
