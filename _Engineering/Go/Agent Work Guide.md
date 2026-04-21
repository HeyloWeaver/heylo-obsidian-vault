# Go - Agent Work Guide

This guide is optimized for agents making changes in `go/backend/appsync/`.

Use with root [[README]] and backend/frontend overviews for cross-repo context.
Use [[Go/Domain Playbooks]] for subsystem-specific entry points.

---

## What this repo area owns

- Focused AWS Lambda resolver for AppSync GraphQL.
- Heavy read path support (currently caseload schedule query).
- Direct MySQL reads through a small platform DB layer.

---

## High-signal files to read first

- `go/backend/appsync/main.go` - Lambda entrypoint, auth checks, resolver dispatch.
- `go/backend/appsync/schema.graphql` - GraphQL contract.
- `go/backend/appsync/getcaseloadschedule.go` - resolver behavior.
- `go/backend/appsync/platformdb/caseloadschedule.go` - DB access for schedule reads.
- `go/backend/appsync/platformdb/user.go` - role/user query checks.
- `go/backend/appsync/getcaseloadschedule_test.go` - existing test pattern.

---

## Fast change recipes

### Add a new GraphQL query

1. Add query and output types in `schema.graphql`.
2. Add dispatch case in `main.go` handler switch.
3. Add resolver file (`get<Thing>.go`) with auth/validation.
4. Add DB query methods under `platformdb/`.
5. Add focused test file (`get<Thing>_test.go`).

### Extend existing query fields

1. Add fields to GraphQL schema.
2. Extend domain structs and mapper logic in resolver.
3. Update platformdb query/select logic.
4. Add regression tests for field population and auth edge cases.

---

## Gotchas and drift risks

- Resolver authorization depends on claims and role lookup; preserve that flow.
- DB access is intentionally narrow and explicit; avoid hidden query sprawl.
- Connection defaults in local dev are permissive for convenience; avoid carrying that into production assumptions.
- Frontend may still be on transitional data paths (fixture/REST/GraphQL), so coordinate rollout behavior.

---

## Done checklist for Go/AppSync tasks

- Schema and resolver behavior are aligned.
- Handler dispatch includes the new field/query.
- Role/identity checks still gate unauthorized access.
- Tests cover happy path and auth failures.
- Update `_Engineering/Go/*` notes when schema/contract semantics change.

