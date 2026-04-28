---
type: note
tags: [notes, engineering, architecture]
owner: Mike
updated: 2026-04-21
status: current
---
Frontend:
- I really like app (private) and (public) folders for separation of concerns
- `lib` is well organized
- components are custom but also well organized
- service layer is clean (`services` + shared client in `lib/api.ts`)
- caseload beta is still fixture-backed with a TODO to move to GraphQL
- Frontend automated tests are not yet standardized; linting is currently the primary quality gate.
- I think `redux`/`jotai` deps might be dead weight
- `middleware.ts` centralizes auth + role redirects cleanly
- middleware is doing Segment page tracking, which is convenient but mixes concerns

Backend:
- Not everything is lambdas - core API is NestJS modules/controllers/services
- Starting to create a new service with GO and GraphQL
- `app.module` is doing a lot (might become painful over time)
- Swagger at `/api` is a nice touch for internal discoverability
- CORS allowlist is hardcoded in `main.ts` (less flexible for env churn)
- service + integration test coverage exists, but the e2e hello-world test looks stale
- backend has a big env/config surface area (Cognito, IoT, Daily, Segment, Intercom, S3, etc.)
- backend scripts are super operationally rich (good power, but raises maintenance burden)
- there are at least 6 targeted integration tests in `src/test` (nice confidence layer)

Go:
- AppSync Lambda under `go/backend/appsync` is real and production-shaped
- GraphQL schema for `getCaseloadSchedule` is already checked in
- feels intentionally narrow: good for heavier read paths
- local dev default DB connection in `main.go` is very permissive (`root@127.0.0.1`)
- DB pool is intentionally small (max open/idle = 3), seems Lambda-conscious

Cross-cutting:
- architecture is converging on Nest REST + WebSocket + Go/AppSync for hot paths
- there are 3 backend execution models now (Nest, TS lambdas, Go lambda), so onboarding cost is real
- backend lambdas have their own `package.json` + buildspec files, which implies separate deploy lifecycle