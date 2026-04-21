---
type: audit
tags:
  - engineering
  - architecture
  - audit
  - backend
  - frontend
  - go
  - onboarding
owner: Mike
updated: 2026-04-21
status: current
repos:
  - frontend
  - backend
  - go
stack:
  - Next.js 15
  - NestJS 11
  - Go
  - MySQL
  - AWS
action_items_total: 20
action_items_high: 5
action_items_medium: 7
action_items_low: 8
action_items_resolved: 0
risk_level: medium
top_risk: shared MySQL DB with no RDS Proxy under Lambda concurrency
reviewed_by: Mike
next_review: 2026-06-01
review_trigger: after RDS Proxy decision + caseload beta GraphQL migration
related:
  - "[[04-20-26 - Architecture Notes]]"
  - "[[Agent Work - Start Here]]"
  - "[[Agent Work Guide]]"
---
# Codebase Audit — Full Stack Architecture Review
*Senior full-stack architect onboarding pass. Three repos: `frontend/`, `backend/`, `go/`. Written as a peer-level audit for the team — what's working well, what to watch, and what to fix.*

---

## Executive Summary

The architecture is coherent and well-intentioned. NestJS handles the core REST + real-time API, a fleet of TypeScript Lambdas handles scheduled/event-driven device monitoring, and a Go/AppSync Lambda handles high-throughput read paths. The frontend is Next.js 15 App Router with a clean service layer. The main architectural risks are: (1) three backend execution models with independent deploy lifecycles and no shared runtime contract, (2) hardcoded config that will bite during environment changes, (3) a `app.module.ts` that is already large and will become painful, and (4) a state management layer that carries dead weight. None of these are showstoppers — they're manageable with deliberate effort.

---

## Repo 1: `frontend/` — Next.js 15 App Router

### Structure & Organization
- App Router with `(private)/` and `(public)/` route groups — clean separation of concerns, good pattern
- `lib/` is well-organized: `api.ts` (shared Axios client), `appsync-client.ts` (AppSync/Amplify wrapper), `cognito.ts`, `event-hub.ts`, `constants/`, `models/`, `utils/`
- `services/` layer maps 1:1 to backend domain modules — clean and predictable
- `components/ui/` is shadcn/Radix-based with Tailwind v4 — well-structured
- `components/caseload-management/beta/` is clearly scoped as a feature-in-progress — appreciated
- Model types live in `lib/models/` — good discipline; frontend doesn't let backend types leak in raw

### Auth & Middleware
- Auth token is a Cognito `idToken` cookie. `middleware.ts` reads it, and the backend `AuthGuard` validates it
- `middleware.ts` centralizes auth redirect + role-based routing — clean at first glance, but it's also doing Segment page tracking inline. These are two different concerns in one file. As role logic grows this will become hard to test and reason about
- Role redirect logic in middleware has at least one redundant conditional: the `/sites` block checks `roleId === RoleId.superAdmin` inside an `if` that already asserts that same condition — dead branch
- Auth tokens (idToken, roleId, agencyId, userId) stored in cookies — means they travel with every request, including to static assets. Ensure cookie scope is tight (HttpOnly, SameSite, Secure)
- The `config` cookie is base64-encoded JSON (AppConfig) read and decoded in middleware — fragile, needs versioning or graceful fallback if shape changes

### State Management
- `zustand` is the active store (`useCaseloadScheduleStore`) — correct tool for this use case
- `redux`, `@reduxjs/toolkit`, `react-redux`, `redux-persist`, and `jotai` are all in `package.json` as dependencies. No meaningful usage visible in current source. These are almost certainly dead weight from an earlier iteration — should be audited and removed. They add ~80KB+ to the bundle for no benefit
- `context/socket-context.tsx`, `context/video-call-context.tsx`, `context/caseload-context.tsx` — React Context for infrastructure-level concerns (socket, video). Fine pattern for this scale

### Real-Time / WebSocket
- `socket-context.tsx` manages the WebSocket lifecycle — the implementation is sophisticated: exponential backoff, a watchdog timer (15s), HTTP ping keepalive (4s via `connectionService.ping()`), visibility change reconnect, intentional-close flag
- The WebSocket URL is `wss://<appConfig.webSocketApiEndpoint>?jwt=<idToken>` — token in the query string. This works, but JWT in URL is logged by proxies, CDNs, and browser history. A more secure approach is to upgrade auth to a header or a short-lived ticket pattern
- `EventHub` (custom event emitter in `lib/event-hub.ts`) is used as the in-process message bus from WebSocket messages to React components — clever, but entirely untyped. Any consumer can subscribe to any event string. Worth adding typed event maps as the surface grows
- Alert audio has a browser autoplay unlock pattern (unlocks on first user gesture) — good defensive code
- Desktop Notification API requested on mount — `Notification.requestPermission()` without user gesture will be silently ignored in Chrome. Needs to be triggered from a user interaction

### AppSync / GraphQL
- `lib/appsync-client.ts` wraps `aws-amplify/api` with `generateClient()` — lazy Amplify config via `isConfigured` flag. Fine for now; `generateClient()` may not be stable across auth token refreshes — worth monitoring
- `services/beta/caseloadService.ts` reads `idToken` from cookie directly (falls back to `userService.getMy()`) and passes it as `authToken` to AppSync — this is correct since AppSync uses Cognito User Pools auth. Cookie read via `document.cookie.split` is fragile if the cookie name ever changes; abstract it
- The `normalizeMonth` function slices to 7 chars but the input could be e.g. `2026-04-21` — the slice would produce `2026-04`, which is correct. But passing a full ISO date string to a function called `normalizeMonth` is a silent footgun

### Video / Streaming
- `@daily-co/daily-js` + `@daily-co/daily-react` for video calls — `video-call-context.tsx` manages the Daily session
- `@aws-sdk/client-kinesis-video` + `client-kinesis-video-archived-media` + `hls.js` for camera streaming — KVS → HLS playback
- `@ffmpeg/ffmpeg` + `@ffmpeg/core` are also in deps — unclear if actively used or left over. ffmpeg.wasm is very large (~30MB WASM). Verify it's actually loaded
- `reactStrictMode: false` — comment says "Disabled for testing video stream cleanup." This should not live in production config permanently. Strict mode double-invocation of effects is exactly the right tool for catching stream cleanup issues during development

### Build & Config
- `eslint.ignoreDuringBuilds: true` — ESLint is not running in CI/CD. This is a significant quality gate gap
- `typescript.ignoreBuildErrors: false` — TypeScript errors do block builds, which is correct
- S3 image domains for dev, qa, and prod are all allowlisted in `next.config.ts` — includes raw S3 bucket hostnames. If the bucket policy is ever public, image URLs are discoverable. Use CloudFront in front of S3 for all envs
- No `output: 'standalone'` or `output: 'export'` setting — default Next.js server rendering. Fine, just confirm deployment target supports Node server mode

### Testing
- No test files found in `frontend/`. Linting is the only automated quality gate
- `react-hook-form` + `zod` are in use (via `@hookform/resolvers`) — good; form validation is standardized

---

## Repo 2: `backend/` — NestJS 11

### Structure & Organization
- Standard NestJS layout: `src/modules/`, `src/controllers/`, `src/services/`, `src/entities/`, `src/domain/`
- 21 modules, 28 controllers, 28 services — domain coverage is comprehensive: agency, site, user, role, auth, device, alert, call, conversation, caseload, analytics, intercom, inventory, customer-onboarding, share context
- `@automapper/nestjs` used for DTO-to-entity and entity-to-DTO mapping — 16 mapping profiles registered in `app.module.ts`. Clean approach but adds indirection that can be confusing when debugging what fields are being set

### `app.module.ts`
- This file is already large — it registers all 43 entities, all 21 modules, and all 16 mapping profiles in one place
- `TypeOrmModule.forRootAsync` lists every entity inline rather than using `autoLoadEntities: true` — every new entity requires a two-file edit. Consider switching to `autoLoadEntities: true` for maintainability
- `APP_GUARD` is registered twice (AuthGuard + RolesGuard), both with `Scope.REQUEST` — request-scoped guards are instantiated per request, which has a performance cost. Acceptable for now but worth profiling under load
- DB config: `connectionLimit: 10`, `connectTimeout: 20000`, keepalive enabled — solid. `synchronize: false` is correct for production

### Auth
- `AuthGuard` supports two paths: staff auth (Cognito JWT via cookie or Bearer header) and share auth (short-lived Bearer token for shared context endpoints)
- `@Public()` and `@ShareAuth()` decorators allow route-level opt-out — good pattern
- JWT validation delegates to `ContextService.validateJwtToken()` (Cognito JWT verify) — should be using `aws-jwt-verify` or similar, which is present in `package.json`. Verify it validates `iss`, `aud`, and `exp`
- No refresh token logic visible — once idToken expires the client gets a 401. Confirm client-side refresh is handled

### Database & Migrations
- TypeORM with MySQL 2 driver — `synchronize: false` in all cases, manual migrations only. Good discipline
- 80+ migration files spanning the full entity lifecycle — device types, inventory, hardware, shipments, MFA, caseload, alerts
- Migration timestamps are Unix epoch millis — not always sequential (some gaps visible), which can cause ordering issues if developers create migrations concurrently. Consider using a sequential counter or enforcing timestamp generation via CLI
- `data-source.ts` for CLI migration runner — correctly loads env from `src/config/{NODE_ENV}.env`
- No visible seed files or fixture data for dev — onboarding a new dev environment requires a real data export or manual setup

### WebSocket Architecture
- No NestJS WebSocket gateway — intentional. Real-time push goes through AWS API Gateway WebSocket, not a Nest gateway
- `WebSocketService` stores connection IDs in MySQL (`webSocketConnection` table), then pushes via `ApiGatewayManagementApiClient.PostToConnectionCommand`
- Stale connections (410 status) are batch-removed from the DB — clean pattern
- Connection is tied to `createdById` (user) OR `deviceId` — devices get WebSocket connections too, which is interesting. Devices receive pushed commands/state via the same WebSocket infra as users
- The HTTP ping on the frontend (every 4s) triggers a backend response that acts as a WebSocket keepalive — a clever workaround for API Gateway's idle timeout, but it means every connected user generates 15 HTTP requests/min. At scale this could be non-trivial load

### Lambda Functions (TS)
Located in `backend/lambdas/` — each is a standalone TypeScript Lambda with its own `buildspec.yml`:
- `camera-checker` — monitors camera device health
- `device-alert-notifier` — sends notifications for device alerts
- `device-alert-summary` — aggregates alert summaries
- `device-checker.ts` — checks device connectivity, generates alerts, pushes WebSocket events to users
- `hub-checker-2` — hub health monitoring
- `sensor-checker` — sensor status monitoring
- `tablet-checker-2` — tablet device monitoring
- `tablet-updater` — tablet state updates

**Key observation:** These Lambdas import directly from `src/` in the main backend (`from '../src/entities/...', 'src/services/...'`). This means:
  - The Lambda build step must compile the entire backend src tree
  - Any breaking change to a backend entity or service can silently break Lambda behavior at deploy time
  - The Lambdas and the main app share TypeORM entities but run in separate processes with no shared DB pool
  - Deployment is separate (`buildspec.yml` per Lambda) — a Lambda can be deployed independently of the main app, which is a contract risk

### Operational Scripts
`backend/scripts/` contains 40+ scripts covering: SSM activation, MQTT publishing, agency/hub policy sync, MFA toggling, camera auth, Lambda deployment, Kinesis stream tagging, and more. These are operationally rich and represent significant institutional knowledge.

Concerns:
- Scripts are TypeScript run via `ts-node` — no compiled distribution. Anyone running them needs the full dev environment
- No README or index for the scripts directory — discoverability is low for new engineers
- Several deployment scripts (`deploy-*.sh`, `deploy-*.js`) are in scripts/ but Lambda deployment is also in `buildspec.yml` — two sources of truth for how Lambdas get deployed
- `nullify-super-admin-agency.js`, `remove-device-numbers.js` are one-time data fix scripts — they should be archived or deleted once confirmed run in production

### External Integrations
The backend has a wide integration surface:
- **Cognito** — auth and user management
- **IoT Core** — `aws-iot-device-sdk-v2`, MQTT for device communication
- **Kinesis Video Streams** — camera streaming
- **S3** — file storage
- **SES** — transactional email
- **SQS** — async messaging
- **SSM** — device fleet management
- **DynamoDB** — appears in scripts but not in main service
- **Daily.co** — video call sessions
- **Segment** — analytics
- **Intercom** — customer support

Each integration is wrapped in a service (`aws.service.ts`, `daily.service.ts`, `email.service.ts`, `intercom.service.ts`). The `aws.service.ts` is likely a broad wrapper — worth auditing to confirm it doesn't become a "god service."

### Config & Environment
- Config loaded from `src/config/{NODE_ENV}.env` — the directory is environment-specific. Good pattern
- CORS allowlist in `main.ts` is hardcoded with 9 origins including a raw CloudFront domain (`d3s6y1quuhb4ws.cloudfront.net`). Should be environment-variable-driven — a config change today requires a code deployment
- `process.env.PORT ?? 3000` — good fallback
- No validation of required env vars at startup (e.g., via `Joi` schema in `ConfigModule`) — a missing env var will fail silently or at runtime. Add `validationSchema` to `ConfigModule.forRoot()`

### Testing
- Jest configured, `@nestjs/testing` present
- Integration tests in `src/test/` (at least 6 targeted integration tests)
- `test/app.e2e-spec.ts` appears to be the stale hello-world test (mentioned in existing notes)
- Service-level unit test coverage not assessed — likely partial based on the integration-test-heavy approach
- `run-tests.js` in root — custom test runner script, unclear if this is what CI uses

---

## Repo 3: `go/` — AppSync Lambda

### Structure
- Single Lambda at `go/backend/appsync/`
- Files: `main.go`, `common.go`, `getcaseloadschedule.go`, `getcaseloadschedule_test.go`, `schema.graphql`
- `platformdb/` package: `caseloadschedule.go`, `user.go`, `role.go`, `userrole.go` — DB query functions only, no ORM
- Build/deploy: `bin/deploy.sh`, `bin/test-compile.sh`, `buildspec.yml`

### Architecture
- AWS Lambda handler receives AppSync resolver events (`ResolverEvent`)
- Handler dispatches on `event.Info.FieldName` — currently only `getCaseloadSchedule`
- Auth: validates `event.Identity` (Cognito claims), then calls `platformdb.GetUserRole()` to confirm the user actually exists and has a role in the DB. This is correct — don't trust claims alone
- Cognito custom attributes used: `custom:platformUserId`, `custom:platformAgencyId`, `custom:platformRoleId` — these are set at user creation. Any mismatch between Cognito and the DB is caught by `GetUserRole`
- `zap` for structured logging — good choice for Lambda (JSON logs to CloudWatch)
- Panic recovery in `handler` via `defer/recover` — prevents Lambda crashes from surfacing unhandled panics

### Database
- Direct MySQL connection (`database/sql` + `go-sql-driver/mysql`)
- `db` is a package-level var initialized in `init()` — shared across Lambda invocations within the same container. This is the correct pattern for Lambda DB connections
- Pool: `SetMaxOpenConns(3)` + `SetMaxIdleConns(3)` — Lambda-conscious. With 3 open connections max per container instance, and Lambda scaling to many instances, this could create connection pressure on the MySQL DB under high concurrency. The NestJS pool also uses `connectionLimit: 10`. Monitor `Too many connections` errors on the DB as traffic grows
- Local dev connection: `root@tcp(127.0.0.1:3306)/heylo?parseTime=true&loc=UTC` — no password, hardcoded. Fine for local but worth making the default `DB_DSN` env-var driven rather than a fallback literal
- `parseTime=true&loc=UTC` — correct. DATETIME columns in UTC, parsed into Go `time.Time` as UTC

### `getCaseloadschedule.go`
- Query joins `caseloadschedule → caseload → caseloadsite → site → user` — single SQL query, no N+1. Clean
- Timezone-aware: comment notes callers should pass a buffered UTC window (±24h) and filter by site-local time. This logic lives in the Go handler — worth documenting the caller contract more explicitly
- Schedules with NULL UserId are skipped — good defensive filter
- One row per (schedule × caseloadsite) — a schedule on a two-site caseload emits two rows. This is the intended behavior but could surprise consumers expecting one row per schedule

### Schema
- GraphQL schema is Query-only — no Mutations or Subscriptions yet
- Single resolver: `getCaseloadSchedule(startDate, endDate, agencyId)` → `GetCaseloadScheduleOutput`
- `agencyId` is nullable (`ID` without `!`) — allows superusers to pass an explicit agencyId. The resolver should enforce that non-superuser callers cannot spoof another agency's agencyId. Verify this is enforced in `getcaseloadschedule.go`

### Build & Deploy
- `buildspec.yml` compiles with `-ldflags "-X main.Environment=... -X main.DbConnection=..."` — environment and DB DSN injected at compile time. This means the Lambda binary is environment-specific and cannot be promoted between environments without a rebuild. This is a deliberate tradeoff — acceptable for now, but note it increases build pipeline complexity
- `bin/deploy.sh` — manual deploy script in addition to buildspec. Same dual-source-of-truth issue as the TS Lambdas

---

## Cross-Cutting Concerns

### Three Backend Execution Models
| Model | Runtime | Trigger | DB access | Auth | Deploy |
|---|---|---|---|---|---|
| NestJS | Long-running container | HTTP / WebSocket | TypeORM pool (10) | Cognito JWT | Dockerfile / ECS? |
| TS Lambdas (8) | Lambda | Scheduled / IoT events | TypeORM (no pool mgmt) | API key / IoT | buildspec.yml per Lambda |
| Go Lambda | Lambda | AppSync resolver | sql.DB pool (3) | Cognito via AppSync | buildspec.yml |

The three models serve different purposes and are appropriate choices. The risk is **onboarding cost and operational complexity** — a new engineer needs to understand three different deployment pipelines, three different auth flows, and three different DB access patterns.

### Shared Database
NestJS, all TS Lambdas, and the Go Lambda all share the same MySQL database. There is no connection brokering layer (no RDS Proxy). Under Lambda concurrency spikes, this will exhaust MySQL connections before it exhausts Lambda capacity. **RDS Proxy is the recommended mitigation** — it pools connections at the proxy level and presents a stable connection count to MySQL regardless of Lambda instance count.

### Authentication Consistency
- Frontend → NestJS: Cognito `idToken` cookie (validated by `aws-jwt-verify`)
- Frontend → AppSync → Go Lambda: Cognito `userPool` auth mode, `idToken` passed as `authToken`
- TS Lambdas → backend: Internal (no user auth context, Lambda-to-Lambda or IoT-triggered)
- All user-facing paths validate Cognito tokens. Good consistency.

### Environment Coverage
- **dev**: `dev-app.heylo.tech`, `dev-onboard.heylo.tech`
- **qa**: `qa.heylo.tech`
- **staging**: `cd-staging.yml` (CD pipeline present)
- **production**: `app.heylo.tech`, `onboard.heylo.tech`

Four environments with CD pipelines for staging and production — solid. QA is a named environment but unclear if it has its own CD pipeline or is manually deployed.

### Observability
- Segment analytics on the frontend (page tracking in middleware)
- CloudWatch for Lambda logs (Go uses `zap`, TS Lambdas use `console.log`)
- NestJS: no structured logging library visible — `console.log` is used in `websocket.service.ts`. Should be replaced with a proper logger (`winston`, `pino`) before production load increases
- No distributed tracing (X-Ray, Datadog, etc.) visible across the three execution models
- No health check endpoint visible in NestJS beyond the default root route — API Gateway / ALB health checks may be hitting `/` without a proper health route

### Missing Infrastructure Observations
- No API rate limiting visible in NestJS (no Throttler module)
- No request validation middleware (class-validator is used in DTOs but no global `ValidationPipe` visible — check `main.ts`)
- No global exception filter registered (only `multer-exception.filter.ts` for file upload errors)

---

## Priority Action Items

**High — correctness/security:**
1. JWT in WebSocket URL query string — move to a ticket/header auth pattern before scale
2. CORS allowlist in `main.ts` → move to env var or config file
3. Validate required env vars at startup via `ConfigModule` `validationSchema` — prevents silent failures
4. Confirm `agencyId` spoofing protection in Go Lambda `getCaseloadSchedule` resolver
5. Cookie scope audit — confirm `HttpOnly`, `Secure`, `SameSite=Strict` on all auth cookies

**Medium — maintainability:**
6. Remove dead Redux/Jotai dependencies from frontend — bundle size and confusion tax
7. Add `ValidationPipe` globally in NestJS `main.ts` (`app.useGlobalPipes(new ValidationPipe({ whitelist: true }))`)
8. Add global exception filter to NestJS for consistent error response shape
9. Switch `app.module.ts` TypeORM entity list to `autoLoadEntities: true`
10. Add NestJS structured logger (`winston` or `pino`) — replace `console.log` calls
11. Fix `reactStrictMode: false` — re-enable and fix underlying stream cleanup issue properly
12. Re-enable ESLint in Next.js build (`ignoreDuringBuilds: false`)

**Lower — scale/operations:**
13. Add RDS Proxy in front of MySQL — mandatory before Lambda concurrency grows
14. Archive or delete one-time data fix scripts in `backend/scripts/`
15. Add a `scripts/README.md` cataloguing what each script does and when it was last run
16. Add a proper `/health` endpoint to NestJS
17. Consider distributed tracing across all three execution models
18. Standardize Lambda deployment — one source of truth per Lambda (buildspec or script, not both)
19. caseload beta fixture data — track the TODO to move to live GraphQL data; don't let it ship to production as a fixture
20. ffmpeg.wasm — audit whether it's actually used; if not, remove (massive bundle weight)

---

## What's Working Well

- Service layer on frontend is clean and consistent — one service file per domain, shared API client
- NestJS module structure is well-organized and the domain coverage is complete
- Go Lambda pattern is a good architectural choice for the AppSync/caseload read path — correctly isolated, DB-conscious, panic-safe
- Migration discipline is good — `synchronize: false`, explicit migration files, timestamps
- WebSocket keepalive implementation is robust (watchdog + HTTP ping + exponential backoff + visibility handling)
- Auth is consistent across all execution models — Cognito JWT everywhere
- `@Public()` and `@ShareAuth()` decorator pattern in NestJS is the right escape hatch for non-standard auth routes
- Device alert + notification system (Lambda → WebSocket → toast + audio + desktop notification) is end-to-end complete
- Swagger at `/api` is a great internal discoverability tool
- The multi-environment setup (dev/qa/staging/prod) with separate CD pipelines shows operational maturity

---

*Last updated: 2026-04-21 by Mike*
*Next pass: revisit after RDS Proxy decision and after caseload beta goes to GraphQL*
