# Go Domain - Caseload

## Primary ownership

- AppSync `getCaseloadSchedule` resolver behavior.
- Query-time auth/role checks for schedule reads.
- SQL read/mapping layer for schedule output.

## Read these first

- `go/backend/appsync/schema.graphql`
- `go/backend/appsync/main.go`
- `go/backend/appsync/getcaseloadschedule.go`
- `go/backend/appsync/platformdb/caseloadschedule.go`
- `go/backend/appsync/platformdb/user.go`
- `go/backend/appsync/getcaseloadschedule_test.go`

## Common change patterns

1. Update GraphQL schema types/arguments first.
2. Update resolver structs/mapping in `getcaseloadschedule.go`.
3. Update SQL query and scanning logic in `platformdb/`.
4. Keep identity/role checks explicit in handler flow.
5. Update tests to match both auth and data-shape expectations.

## Gotchas

- Schema changes without matching resolver/type updates will break quickly.
- Date range and timezone assumptions can alter grouped schedule output.
- Role lookup failures should stay explicit and fail closed.

## Done checklist

- AppSync schema matches returned response shape.
- Resolver dispatch path in `main.go` includes expected field handling.
- Unauthorized requests are rejected.
- Tests cover both happy path and permission failure.

---

**Related:** [[Go/Agent Work Guide]] | [[Go/Domain Playbooks]] | [[Backend/Domain - Caseload]] | [[Frontend/Domain - Caseload]]
