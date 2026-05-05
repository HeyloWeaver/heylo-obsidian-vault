---
type: overview
tags: [go, appsync, graphql]
owner: Mike
updated: 2026-05-05
status: current
---
# Go - High Level Overview

The Go surface currently lives under `go/backend/appsync/`. It is a focused AWS Lambda/AppSync GraphQL path for heavier reads that should not be forced through the NestJS REST API.

Use this with [[Go/Agent Work Guide]] and [[Go/Domain Playbooks]].

---

## What this layer does

- Exposes AppSync GraphQL fields backed by Go Lambda resolvers.
- Performs explicit auth and role checks from request identity/claims.
- Reads shared MySQL domain data through the `platformdb` package.
- Shapes data for frontend consumers that need data-heavy reads, currently centered on caseload scheduling.

This is not a replacement for the NestJS API. Mutations, core business workflows, auth/session behavior, and most integrations still belong in `backend/`.

---

## Runtime shape

1. AppSync invokes the Go Lambda with field name, arguments, and identity claims.
2. `main.go` validates identity and dispatches by GraphQL field.
3. Resolver files validate arguments, enforce role/agency access, and coordinate DB reads.
4. `platformdb/` runs explicit MySQL queries and maps rows into resolver structs.
5. The resolver returns a GraphQL response shape consumed by `frontend/`.

Keep the schema, resolver structs, SQL scan order, and frontend model/service shape aligned in the same change.

---

## Core files

- `go/backend/appsync/schema.graphql` - GraphQL contract.
- `go/backend/appsync/main.go` - Lambda entrypoint, auth checks, and dispatch.
- `go/backend/appsync/getcaseloadschedule.go` - current primary resolver.
- `go/backend/appsync/platformdb/` - MySQL access layer.
- `go/backend/appsync/*_test.go` - resolver tests.
- Matching frontend service/model files under `frontend/services/` and `frontend/lib/models/`.

---

## When to use Go/AppSync

Good fits:

- data-heavy read paths
- read shapes that aggregate or group relational data
- GraphQL consumers that benefit from a purpose-built resolver
- workloads where explicit SQL and typed response mapping are clearer than REST list endpoints

Poor fits:

- writes or multi-table mutations
- auth/session ownership
- realtime fanout
- device ingestion
- small CRUD endpoints that already fit the NestJS API

---

## Change risks

- Schema drift: `schema.graphql`, resolver structs, and frontend models must match.
- Auth drift: role/agency checks must fail closed and stay aligned with backend role semantics.
- SQL scan drift: selected columns, scan destinations, and response mapping must remain in the same order.
- Date/time drift: schedule reads are sensitive to date range and timezone assumptions.
- Consumer drift: frontend may still have transitional REST/fixture paths for a domain.

---

## Verification

Use [[Agent Verification Matrix]] for commands.

Minimum useful checks for Go/AppSync changes:

1. `go test ./...` from `go/backend/appsync/`.
2. `npm run dev:go:once` from the vault root when local env is available.
3. Frontend type/build or service-level verification when GraphQL response shape changes.
4. Manual page verification when the changed resolver backs a visible UI flow.
