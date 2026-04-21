# Frontend Domain - Caseload

## Primary ownership

- Caseload management pages and scheduling UX.
- Caseload data loading/editing and shift/conflict presentation.
- Current transition path from fixture-backed beta toward GraphQL-backed reads.

## Read these first

- `frontend/app/(private)/caseload-management/`
- `frontend/components/caseload-management/`
- `frontend/services/caseloadService.ts`
- `frontend/stores/useCaseloadScheduleStore.ts`
- `frontend/lib/models/caseload/`
- `frontend/lib/fixtures/caseload-schedule.sample.json`

## Common change patterns

1. Adjust schedule fields/contracts -> update models + service return types.
2. Update list/schedule components and empty/loading states.
3. Keep store state transitions aligned with component expectations.
4. If moving API source, make migration path explicit and test both flows.

## Gotchas

- Beta scheduling work has active evolution; read TODOs before refactoring.
- Fixture-backed behavior can mask backend contract issues.
- Timezone and date-window logic is easy to regress.

## Done checklist

- Schedule data renders correctly across date ranges.
- CRUD/update workflows still persist and refresh expected UI state.
- Empty/loading/error states are still coherent.
- No hidden dependency on fixture-specific shape.

