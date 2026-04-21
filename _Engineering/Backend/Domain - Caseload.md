# Backend Domain - Caseload

## Primary ownership

- Caseload CRUD/search and schedule data shaping.
- Agency/user scoping for caseload visibility.
- Caseload APIs consumed by frontend management pages and Go/AppSync migration work.

## Read these first

- `backend/src/controllers/caseload.controller.ts`
- `backend/src/services/caseload.service.ts`
- `backend/src/entities/caseload.entity.ts`
- `backend/src/entities/caseload-schedule.entity.ts`
- `backend/src/entities/caseload-site.entity.ts`
- `backend/src/test/caseload.integration.test.ts`

## Common change patterns

1. Update DTOs and validators for incoming caseload/schedule data.
2. Update service query/aggregation logic.
3. Keep tenancy and role constraints explicit.
4. Add integration coverage for schedule edge cases.
5. Coordinate contract changes with frontend and Go/AppSync paths.

## Gotchas

- Time and timezone handling can break scheduling output silently.
- Caseload data has both assignment and schedule facets; avoid mixing concerns.
- Partial migration to GraphQL read paths means temporary dual behavior may exist.

## Done checklist

- Search/list/detail flows still return complete and scoped data.
- Schedule reads/writes handle date boundaries correctly.
- Integration tests cover modified behavior.
- Cross-repo contract consumers are updated.

