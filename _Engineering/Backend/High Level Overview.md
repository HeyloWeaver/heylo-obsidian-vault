# Backend — High Level Overview
> **Related:** [[Backend/Agent Work Guide]] | [[Backend/Domain Playbooks]] | [[Agent Work - Start Here]] | [[Frontend/High Level Overview]]

The Heylo backend is a NestJS 10 monolith (TypeScript, Node 22) fronted by a Docker/PM2 container, with a fleet of AWS Lambda functions ringing the edges to handle IoT traffic, scheduled jobs, and event transforms. It owns domain data in MySQL (via TypeORM), session auth via AWS Cognito, realtime fan-out via API Gateway WebSockets, video-call orchestration via Daily.co, transactional email via nodemailer (SMTP), support ticketing via Intercom, device telemetry via AWS IoT Core → Kinesis → Lambda → HTTP, and secrets/streams/params across a healthy slice of AWS (S3, SSM, SecretsManager, DynamoDB, KinesisVideo, IAM, CloudWatch Logs). The NestJS process is the system of record; Lambdas mostly translate external events into REST calls back into it.

At a glance: `src/main.ts` bootstraps Nest with CORS for the known heylo.tech origins, installs `cookie-parser`, and listens on `PORT` (default 3000, `4000` in local dev). `src/app.module.ts` wires TypeORM (mysql, no synchronize, migrations in `src/migrations/`), AutoMapper with Automapper classes strategy, and every feature module. Two global guards run on every request: `AuthGuard` (validates Cognito JWT and populates `ContextService`, unless `@Public()`) and `RolesGuard` (checks required roles from `@Roles(...)`). Controllers follow the Nest HTTP convention; services hold the business logic; entities live in `src/entities/`; cross-cutting DTOs and enums live in `src/domain/`.

---

## 1. Concise architectural overview

### Stack

- **Runtime:** Node 22.14 (alpine in Docker), TypeScript 5.
- **Framework:** NestJS 10 — decorator-driven controllers, DI via modules, `@nestjs/swagger` exposing `/api`.
- **ORM:** TypeORM with `mysql` driver, `synchronize: false`, hand-written migrations (`src/migrations/*.ts`).
- **Auth:** AWS Cognito — `@aws-sdk/client-cognito-identity-provider` for user admin; JWT verification via `aws-jwt-verify`. Custom attributes `custom:platformUserId`, `custom:platformRoleId`, `custom:platformAgencyId`, `custom:platformDeviceId` carry platform identity in the ID token.
- **Realtime:** AWS API Gateway WebSockets. Lifecycle (`$connect`/`$disconnect`) is proxied by an API Gateway integration into this backend's `/connection/ws/on/connect` and `/connection/ws/on/disconnect`. Outbound messages go out via `ApiGatewayManagementApiClient.PostToConnection`.
- **Video:** Daily.co REST API (`DailyService` → `https://api.daily.co/v1/rooms`, `/v1/meeting-tokens`).
- **Email:** nodemailer over SMTP, HTML templates in `templates/`.
- **Ticketing:** Intercom REST.
- **Infra-adjacent:** `@aws-sdk/client-s3` (presigned URLs + uploads), `@aws-sdk/client-ssm` (per-agency secrets), `@aws-sdk/client-secrets-manager`, `@aws-sdk/client-kinesis-video` (camera streams), `@aws-sdk/client-iot` (role aliases / policies per agency hub), `@aws-sdk/client-dynamodb` (waypoints), `@aws-sdk/client-cloudwatch-logs` (device/camera registry logs).
- **Mapping:** `@automapper/classes` + `@automapper/nestjs` — entity ↔ model mapping profiles under `src/domain/mapping-profiles/`.
- **Testing:** Jest; `.spec.ts` colocated with services in `src/services/`.
- **Deploy:** Docker image (multi-stage, alpine, ffmpeg installed, PM2 supervising `main.js`). Lambdas deploy via per-lambda shell scripts under `scripts/` using inlined env vars.

### Folder structure

```
backend/
├── src/
│   ├── main.ts                 # Nest bootstrap (CORS, cookie-parser, Swagger)
│   ├── app.module.ts           # TypeORM config, all modules, global guards
│   ├── config/                 # development.env, qa.env, test.env.example
│   ├── controllers/            # 28 REST controllers, one per resource / event source
│   ├── services/               # ~25 business-logic services + .spec.ts files
│   ├── modules/                # 19 Nest feature modules, each wiring controllers+services+entities
│   ├── entities/               # 43 TypeORM entities
│   ├── domain/
│   │   ├── dto/                # Request DTOs (validated with class-validator)
│   │   ├── enums/              # RoleId, AlertStatus, CallStatus, DeviceStatus, ...
│   │   ├── models/             # Response models used by mapping profiles
│   │   ├── mapping-profiles/   # Automapper entity→model profiles
│   │   ├── exceptions/         # Custom NotFound/Unauthorized/etc. exceptions
│   │   ├── constants/
│   │   └── utils/
│   ├── guards/                 # AuthGuard, RolesGuard, ApiKeyGuard, XApiKeyGuard
│   ├── decorators/             # @Public, @Roles, @ShareAuth
│   ├── filters/                # multer-exception.filter.ts
│   ├── migrations/             # TypeORM migrations (numeric timestamp prefix)
│   ├── test/
│   └── utils/                  # alert-time-checker, merge-adjacent-shifts, mimetype, password
├── lambda/                     # Older lambdas (ES modules, .mjs) — Kinesis/SQS/scheduled
│   ├── eventProcessor.mjs      # The big one — Kinesis → REST fan-out
│   ├── cameraChecker.mjs, cameraPinger.mjs, dailyCameraRegistry.mjs,
│   │ getApiUrlByAppVersion.mjs, hubChecker2.mjs, lowBatteryNotifier.mjs,
│   │ scheduledEmailer.mjs, sensorChecker.mjs, summaryEmailer.mjs,
│   │ tabletChecker.mjs, tabletChecker2.mjs, tabletUpdater.mjs
│   └── shared/                 # alertEmail, date, emailHelpers, websocket, db/
├── lambdas/                    # Newer TS-based lambdas (device-checker, alert notifier, ...)
│   ├── camera-checker/, device-alert-notifier/, device-alert-summary/,
│   │ hub-checker-2/, sensor-checker/, tablet-checker-2/, tablet-updater/
│   └── device-checker.ts
├── scripts/                    # Deploy / ops shell+node scripts (one per lambda + ad-hoc)
├── templates/                  # HTML email templates (reset-password, complete-registration,
│                               #  device-offline-alert, device-low-battery, device-checker-*)
├── fixtures/                   # seed data
├── bin/                        # create-superuser, deploy, seed-alert-demo, migrate-*, test-*
├── test/                       # e2e jest config
├── data-source.ts              # Standalone TypeORM DataSource for CLI migrations
├── nest-cli.json, tsconfig.{json,build,lambda}.json, eslint.config.mjs
├── Dockerfile, run-tests.js, package.json
└── README.md                   # Setup + lambda deploy notes
```

### Key concepts

1. **Global guards, public by exception.** `AuthGuard` and `RolesGuard` are registered in `app.module.ts` via `APP_GUARD`. Every route requires a valid Cognito JWT *unless* annotated with `@Public()`. Role-restricted endpoints add `@Roles(RoleId.superAdmin, ...)`.
2. **Two auth transports.** Web clients send the idToken as an HttpOnly cookie (`request.cookies['idToken']`); API consumers (and the webapp fall-through path) use `Authorization: Bearer <idToken>`. Device/IoT lambdas call event-intake endpoints with `x-api-key` (see `XApiKeyGuard`, `ApiKeyGuard`).
3. **`ContextService` is the request-scoped identity.** After JWT validation it exposes `userId`, `roleId`, `agencyId`, `userType: 'device' | 'person'`, and for devices, `deviceId` + `isCommonAreaDevice`. Services inject it to scope queries and authorize actions.
4. **Three kinds of principal.** The backend treats *people*, *resident tablets*, and *common-area tablets* as authenticated entities — all three come through Cognito, distinguished by which custom claim is present in the ID token.
5. **Event-source controllers are public + api-key'd.** `device-event`, `camera-event`, `hub-event` controllers are `@Public()` but guarded by `XApiKeyGuard` — they're the HTTP sinks that the Kinesis/SQS event processor lambdas call.
6. **WebSocket send-only from the backend.** The backend does not host a WS server; it calls `ApiGatewayManagementApiClient.PostToConnection(ConnectionId, Data)` against the connections it recorded in `WebSocketConnection` rows during `$connect`. Stale sockets (HTTP 410) are pruned in batch.

### Main entry points

- **HTTP:** `src/main.ts` → NestFactory → listens on `PORT` (3000 prod container, 4000 local).
- **WebSocket lifecycle (proxied from API Gateway):** `POST /connection/ws/on/connect`, `POST /connection/ws/on/disconnect` (`connection.controller.ts`).
- **Device telemetry ingress:** `POST /device-events/:hubPhysicalDeviceId/:devicePhysicalDeviceId`, `POST /hub-events/:hubPhysicalDeviceId/status`, `POST /hub-events/:hubPhysicalDeviceId/ssm`, `POST /camera-status/:hubPhysicalDeviceId`, `POST /device-status/:hubPhysicalDeviceId` — all guarded by `XApiKeyGuard`, hit by `lambda/eventProcessor.mjs`.
- **Migrations:** `npm run typeorm:migrate:dev|show` against `data-source.ts`.
- **Lambdas:** each has a `scripts/deploy-*.sh|.js`.

### Data flow (typical scenarios)

- **Login:** Web calls Cognito directly, then POSTs tokens to `/auth/session`; `AuthService.createSession` verifies the JWT via `aws-jwt-verify`, syncs platform claims onto the Cognito user, and returns tokens + `roleId` which the controller puts in HttpOnly cookies.
- **Incoming alert:** Hub publishes via IoT Core → Kinesis stream → `eventProcessor` Lambda → `POST /device-events/:hub/:device` (`AlertService.createFromLambdaEvent`) → row in `Alert` + `AlertEventLog`, then `WebSocketService.sendMessage(userIds, { event: 'AlertCreated', data: ... })` fans out to operator WebSockets.
- **Video call:** Operator clicks a resident → `GET /call/my/with/resident/:id` → `CallService` creates Daily room (`DailyService.createRoom`), inserts `Call` + `CallParticipant` rows, WS-pings the resident tablet with `CallCreated`. Both sides fetch `GET /call/:id/token` (`DailyService.createToken`) and join. Lifecycle transitions go through `PATCH /call/:id/{connected|missed|rejected|ended}`.
- **Scheduled job:** EventBridge rule fires → `tabletChecker2`/`sensorChecker`/`lowBatteryNotifier`/`device-checker` lambda runs → either queries RDS directly (via lambda `shared/db`) or calls back into the REST API → sends SES/SMTP email and/or posts a WebSocket alert.

---

## 2. Detailed technical deep-dive

### Bootstrap (`main.ts` + `app.module.ts`)

`main.ts`:

- CORS origins are a hard-coded list (localhost dev ports + `dev-app.heylo.tech`, `app.heylo.tech`, `qa.heylo.tech`, `onboard.heylo.tech`, `dev-onboard.heylo.tech`, CloudFront distro). Credentials enabled; all methods + standard headers.
- Swagger at `/api` titled "Heylo Apis".
- `cookieParser(process.env.JWT_SECRET)` — note the JWT secret is reused as the cookie-parser secret for signed cookies even though JWT verification itself is Cognito-based.
- Listens on `process.env.PORT ?? 3000` on `0.0.0.0`.

`app.module.ts`:

- Resolves env file path based on `__dirname` (different paths for source vs `dist/` vs Docker) and loads `src/config/${NODE_ENV}.env`.
- `TypeOrmModule.forRootAsync` builds mysql config from `DB_HOST/PORT/USER/NAME/PASS` (password optional for local), registers all 43 entities, pool `connectionLimit: 10`, `keepAliveInitialDelay: 10s`, `timezone: 'Z'`. `synchronize: false` always.
- `AutomapperModule.forRoot({ strategyInitializer: classes() })`.
- 19 feature modules listed.
- Global guards registered: `AuthGuard` and `RolesGuard` with `Scope.REQUEST`.

### Auth & identity

`AuthGuard` (`src/guards/auth.guard.ts`):

- Checks `@Public()` metadata → skip.
- Checks `@ShareAuth()` metadata → use `ShareContextService.validateToken` (bearer-only; for externally-shared links).
- Otherwise `validateStaffAuth`: token from `request.cookies['idToken']` OR `Authorization: Bearer <token>` → `ContextService.validateJwtToken(token)`.

`ContextService.validateJwtToken`:

- Calls `AwsService.verifyCognitoJwt(token)` which uses `aws-jwt-verify`'s `CognitoJwtVerifier` (expected caching verifier; configured in `AwsService`).
- Reads custom claims: if `custom:platformUserId` is set → it's a person, populate `userId / roleId / agencyId`.
- Else if `custom:platformDeviceId` is set → it's a device: look up `Device` by id, set `userType='device'`, `deviceId`, `agencyId`; if the device has a `residentId`, adopt that user (`roleId=RoleId.resident`), otherwise it's a common-area tablet (`roleId=null`, `isCommonAreaDevice=true`).
- Anything else → `UnauthorizedException`.

`RolesGuard`:

- Reads `@Roles(...)` metadata. If none set, allow. If `ContextService.roleId` is null (i.e. common-area device), deny role-gated endpoints. Otherwise check inclusion.

Other guards:

- `ApiKeyGuard` — checks `DEVICE_EVENT_API_KEY` env against the `Authorization` header (accepts raw or `Bearer …`). Used on some older endpoints.
- `XApiKeyGuard` — used by the lambda-to-backend ingress (`device-events`, `camera-status`, `hub-events`, `device-status`). Paired with `@Public()` to skip `AuthGuard`.

`AuthService`:

- `forgotPassword(emailAddress)`: looks up user, enforces `isEmailVerified`, calls `AwsService.touchCognitoUser` (which effectively resets to a generated temp password) and emails `templates/reset-password.html` with a `{Name}` + `{ResetPasswordUrl}` substitution — the URL contains `id` + temp password as query params.
- `createSession(idToken, accessToken, refreshToken)`: verifies ID token, finds user + role, backfills `custom:platformRoleId`/`custom:platformAgencyId`/`email_verified` on the Cognito user if they drifted, and if any update happened, refreshes Cognito tokens so the client gets a token with correct claims. Returns `{ idToken, accessToken, refreshToken, roleId }`.
- `sendInvitation(user, role, agency, tempPassword)`: emails `templates/complete-registration.html` with registration URL (id + temp password), updates `lastInviteCreatedOn`.

`AuthController`:

- `POST /auth/forgot-password` (`@Public`), `POST /auth/session` (`@Public`, sets HttpOnly cookies with `domain: '.heylo.tech'` unless host is localhost; `sameSite: 'none'`, `secure: true`), `POST /auth/logout` (`@Public`, clears cookies).

### Realtime (`WebSocketService` + `ConnectionController`)

- API Gateway WebSocket routes `$connect` / `$disconnect` are proxied into the NestJS backend via a Lambda integration that calls `POST /connection/ws/on/connect` / `/on/disconnect` (both `@Public` + `@UsePipes(ValidationPipe)`).
- On connect, `ConnectionService.WsOnConnect` validates the passed JWT via `ContextService.validateJwtToken`, then inserts a `WebSocketConnection` row keyed by `socketId`, `createdById` (user) or `deviceId` (tablet), `agencyId`.
- On disconnect, mark the row deleted.
- `WebSocketService.sendMessage(userIds, message)` looks up active `WebSocketConnection`s for those users *and* devices (it unions `createdById` and `deviceId` lookups), POSTs via `ApiGatewayManagementApiClient`, and on HTTP 410 (stale connection) batch-removes the rows.
- `WebSocketService.sendMessageToOneUser(userId, message)` returns `{ success, failure }` counts and throws `NO_WEBSOCKET_CONNECTION` / `FAILED_TO_SEND_MESSAGE` for the caller to decide how to respond.
- `POST /connection/ws/ping` (authenticated): the client calls it over HTTP and the backend pushes a `{ event: 'pong' }` back through the socket — this is the trick the frontend `SocketProvider` uses to keep the socket warm since browsers can't send WS pings.
- `POST /connection/waypoint` (user) and `/connection/tablet/logs` (device-only) write to DynamoDB via `AwsService.logUserWaypoint` / `logDeviceWaypoint`. Super admins can query them back via `/connection/waypoint/search` and `/connection/device-waypoint/search`.

### Device telemetry pipeline

Hubs publish MQTT to AWS IoT Core. A rule writes everything to a Kinesis data stream. `lambda/eventProcessor.mjs` consumes that stream and translates topics into REST calls against the NestJS backend:

- `heylo/10/up/{hub}/zigbee/{device}` → `POST /device-events/:hub/:device` with `{ action | contact | occupancy, battery, batteryLow, timestamp }` (Zigbee battery-only frames are intentionally dropped at the lambda).
- `heylo/10/up/{hub}/zwave/notification/Smoke_Alarm|CO_Alarm|System/*` → same endpoint but keyed by `nodeId`, body includes `{ smoke_sensor | smoke_alarm | co_sensor | co_alarm | hardware, battery, timestamp }`.
- `heylo/10/up/{hub}/zwave/.../lastActive` → `/device-events/:hub/:nodeID`.
- `heylo/10/up/{hub}/onvif/{device}/*visitor*` → doorbell press mapped to `action: 'doorbell_button_press'`.
- `heylo/10/up/{hub}/cameras/list/resp` → `POST /camera-status/:hub` with the full camera registry (`rtspUrl`, `model`, `hw`, `sw`, `batteryLevel`, `foundByReolink`, `reolinkOnline`).
- `heylo/10/up/{hub}/devices/list/resp` → `POST /device-status/:hub` with the full device registry, with a `mergeNodeDevices` step that pairs `nodeID_X` Z-Wave entries with their matching Smoke/CO Alarm device.
- `heylo/10/up/{hub}/ssm/resp` → `POST /hub-events/:hub/ssm` with `ManagedInstanceID`/`Region`.
- `$aws/events/presence/{connected|disconnected}/{hubId}` → `POST /hub-events/:hub/status` with online/offline + `versionNumber` for race handling.
- Unrecognized messages are logged and skipped. Failures go to an SQS DLQ via `DLQ_URL`. Camera and device registry payloads are also mirrored to CloudWatch logs (`camera-registry-logs`, `hub-device-registry-logs`) for forensic use.

On the backend side, `AlertService.createFromLambdaEvent` and `DeviceService.updateHubStatusFromLambdaEvent / updateCameraStatusFromHub / updateHubSSMFromLambdaEvent` translate these into domain state changes (alerts, device status, battery thresholds, SSM instance wiring for remote shell access) and fan the interesting ones out over WebSockets.

### Video-call flow

- `DailyService.createRoom()` → `POST https://api.daily.co/v1/rooms` with `privacy: 'private'` and `exp: now + 12h` (epoch seconds).
- `DailyService.createToken(roomName)` → `POST https://api.daily.co/v1/meeting-tokens` with the same 12h expiry.
- `CallController` orchestrates: `GET /call/my/with/resident/:id` provisions a room + `Call` + `CallParticipant`, pings the recipient over WS (`CallCreated`); both sides fetch `GET /call/:id/token` to join.
- `POST /call/:id/event-log/:event` (`CallEvent` enum values) records fine-grained lifecycle events.
- `PATCH /call/:id/{connected|missed|rejected|ended|ping}` transition and re-broadcast the status.

### Email, tickets, sharing

- `EmailService` — a single nodemailer `createTransport` using `SMTP_HOST/PORT/USER/PASSWORD`. Templates in `templates/` (`reset-password`, `complete-registration`, `device-offline-alert`, `device-online-alert`, `device-low-battery`, `device-battery-replaced`, `device-checker-site-admin`, `device-checker-summary`) use `{Name}`-style placeholders.
- `IntercomService` / `IntercomController` — wraps Intercom's `/ticket_types` and `/tickets` APIs, used by the Heylo Support page to surface ticket forms (multipart file upload via multer).
- `ShareContextService` / `@ShareAuth()` / `ShareController` — signed bearer tokens for time-boxed public-share links (e.g. sharing alert details outside the app).

### Hardware/inventory stack

A whole side of the backend tracks physical hardware manufacturing and shipping: `hardware*`, `purchase-order*`, `inbound-shipment*`, `manufactured-item*`, `outbound-shipment*`. These have controllers, services, entities, and their own migrations. They're orthogonal to the live-operations flow (alerts/calls/devices) — they're for Heylo's ops team to track inventory and ship devices to agencies.

### Customer onboarding

`CustomerOnboardingController` + `CustomerOnboardingService` + `customer-onboarding.entity.ts` — separate flow for site-administrator self-service onboarding via `onboard.heylo.tech` (hence CORS origins). Lives alongside the main system but has its own lifecycle states (`OnboardingStatus` enum).

### Agency tenancy

Everything is multi-tenant by `agencyId` on most entities (`Device`, `Site`, `User`, `Alert`, `Call`, …). Super admins see across agencies; admins/SPs are scoped by `ContextService.agencyId`. `AgencyCameraPermission` is an explicit allow-list for cross-agency camera-viewing cases. IAM/IoT policies, SSM parameter hierarchies, and Kinesis Video streams are provisioned *per agency* in `AwsService` — that's why the `scripts/` folder has so many `sync-agency-*` and `update-*agency-*-policy` helpers.

### Conventions & quirks

- **Controllers and services are paired** — `src/controllers/foo.controller.ts` + `src/services/foo.service.ts` + `src/modules/foo.module.ts`. Don't grow a service with logic from multiple controllers unless the module imports are updated.
- **DTOs are validated with `class-validator`** — controllers use `new ValidationPipe({ whitelist: true, transform: true })` (either at method or controller level). Unknown properties are stripped.
- **`synchronize: false`** — every schema change must ship a TypeORM migration under `src/migrations/`. Filename convention is `{timestamp}-{kebab-name}.ts` (newer ones) or `{timestamp}.ts` (older bulk-generated ones from 2025-07-23 when the initial tree was imported).
- **Automapper profiles are opt-in** — if you add an entity with a corresponding response model, write a `*.mapping-profile.ts` and register it in `app.module.ts` providers.
- **Scoped request guards.** `AuthGuard`/`RolesGuard` are `Scope.REQUEST` because `ContextService` is request-scoped. Injecting `ContextService` into a non-request-scoped singleton breaks silently — always match scopes.
- **Env per NODE_ENV.** `src/config/{development,qa,test}.env` files; production secrets come from the container environment (not committed). `data-source.ts` uses the same convention for CLI migrations.
- **Cookie-based frontend, header-based everything else.** The `AuthGuard` tries cookie first then `Authorization: Bearer`. Don't rely on one only.
- **Most "send an email" paths read the HTML template from disk synchronously on each call** — acceptable because they're low-frequency.
- **Daily room TTL is 12h hard-coded.** If a call spans a calendar day boundary, it's fine; if it spans a second day it isn't.
- **Common-area devices have `roleId: null`.** Any new role-gated endpoint silently excludes them — if you need to include them, check `contextSvc.userType === 'device'` explicitly.

---

## 3. Exhaustive reference

### `src/controllers/` (28 files)

Grouped by theme (all `@UseGuards(AuthGuard)` unless noted):

- **Auth/session:** `auth.controller.ts` (`@Public` — forgot-password, session, logout).
- **Identity:** `user.controller.ts`, `role.controller.ts`, `agency.controller.ts`.
- **Org:** `site.controller.ts`, `site-common-area.controller.ts`.
- **Communication:** `conversation.controller.ts`, `read-receipt.controller.ts`, `call.controller.ts`, `call-event-log.controller.ts`.
- **Alerts & devices:** `alert.controller.ts`, `device.controller.ts`.
- **Realtime/observability:** `connection.controller.ts` (WS lifecycle proxy + waypoints), `analytics.controller.ts`.
- **Event ingress (`@Public` + `XApiKeyGuard`):** `device-event.controller.ts`, `device-status.controller.ts`, `camera-event.controller.ts`, `hub-event.controller.ts`.
- **Ops/inventory:** `hardware.controller.ts`, `purchase-order.controller.ts`, `inbound-shipment.controller.ts`, `manufactured-item.controller.ts`, `outbound-shipment.controller.ts`.
- **Integrations:** `intercom.controller.ts`, `app-config.controller.ts` (`/app/config` returns Segment key + WS endpoint + region — read by frontend on login), `share.controller.ts`, `customer-onboarding.controller.ts`, `caseload.controller.ts`.

### `src/services/` (~25 files, plus `.spec.ts` siblings)

- **Core domain:** `user.service`, `role.service`, `agency.service`, `site.service`, `site-common-area.service`, `conversation.service`, `read-receipt.service`, `call.service`, `calleventlog.service`, `alert.service`, `caseload.service`, `device.service`, `analytics.service`, `customer-onboarding.service`.
- **Cross-cutting:** `auth.service`, `context.service` (request-scoped identity), `share-context.service`, `email.service`, `daily.service`, `websocket.service`, `connection.service`, `intercom.service`.
- **AWS adapter:** `aws.service` — single class wrapping every AWS SDK we use (Cognito, S3, SSM, SecretsManager, DynamoDB, KinesisVideo, IoT, IAM, CloudWatchLogs). New AWS calls should go in here.
- **Inventory:** `hardware.service`, `purchase-order.service`, `inbound-shipment.service`, `manufactured-item.service`, `outbound-shipment.service`.

### `src/modules/` (19 files)

`AgencyModule`, `AlertModule`, `AnalyticsModule`, `AppConfigModule`, `AuthModule`, `CallEventLogModule`, `CallModule`, `CaseloadModule`, `ConnectionModule`, `ContextModule`, `ConversationModule`, `CustomerOnboardingModule`, `DeviceModule`, `IntercomModule`, `InventoryModule`, `ReadReceiptModule`, `RoleModule`, `SiteCommonAreaModule`, `SiteModule`, `UserModule`. Each follows `TypeOrmModule.forFeature([...]) + providers + controllers + exports`.

### `src/entities/` (43 files)

Live-ops: `user`, `userrole`, `usersite`, `role`, `agency`, `site`, `site-common-area`, `conversation`, `conversationuser`, `message`, `read-receipt`, `call`, `callparticipant`, `calleventlog`, `device`, `device-type`, `alert`, `alert-type`, `alerteventlog`, `caseload`, `caseload-schedule`, `caseload-site`, `webSocketConnection`, `device-alert`, `device-alert-type`, `device-alert-severity`, `device-alert-banner-dismissal`, `agency-camera-permission`.

Hardware/inventory: `hardware`, `hardware-model`, `hardware-model-status`, `hardware-status`, `hardware-condition-type`, `purchase-order`, `purchase-order-line-item`, `purchase-order-receipt`, `inbound-shipment`, `inbound-shipment-po-line-item`, `manufactured-item`, `manufactured-item-component`, `manufactured-item-type`, `outbound-shipment`, `outbound-shipment-item`.

Other: `customer-onboarding`.

### `src/domain/`

- `enums/` — `role-id`, `alert-event`, `alert-priority`, `alert-status`, `alert-type`, `battery-thresholds`, `call-event`, `call-status`, `conversation-status`, `day-of-week`, `destination-type`, `device-alert-severity`, `device-alert-type`, `device-capability`, `device-event`, `device-lifecycle`, `device-status`, `device-type-name`, `gender`, `jwt-type`, `onboarding-status`, `outbound-shipment-status`, `purchase-order-status`, `site-status`, `sort-order`, `websocket-event`. These mirror the frontend `lib/models/common/*` — keep them in sync.
- `dto/` — ~70 request DTOs, all `class-validator`-decorated.
- `models/` — response models used by Automapper profiles.
- `mapping-profiles/` — per-entity Automapper profile classes, registered in `AppModule.providers`.
- `exceptions/` — custom exceptions (`UserNotFoundException`, `EmailNotFoundException`, `UnverifiedEmailException`, etc.) that Nest will serialize into appropriate HTTP responses.
- `constants/`, `utils/` — shared helpers.

### `src/guards/` & `src/decorators/`

- Guards: `auth.guard.ts`, `roles.guard.ts`, `api-key.guard.ts`, `x-api-key.guard.ts`.
- Decorators: `public.decorator.ts` (`IS_PUBLIC_KEY`), `role.decorator.ts` (`ROLES_KEY`), `share-auth.decorator.ts` (`IS_SHARE_AUTH_KEY`).

### `src/migrations/`

Run with `npm run typeorm:migrate:dev` against `data-source.ts`. The initial bulk set is 2025-07-23 timestamped; everything since is one migration per schema change with a descriptive suffix. Recent work: inventory tables, device-alert severity/type split, device `isActive`/`isCharging`/`lifecycle`/`lastSeen`/`metadata`, MFA columns on agency+user, customer-onboarding table, agency camera permissions, device-type additions (camera-hub, zigbee-extender, video-doorbell, hub, camera), common-area rework, Cognito migration (removed `password` from user, added SSM column to agency).

### `src/utils/`

- `alert-time-checker.ts` — business-hours / acceptable-alert-time helpers.
- `merge-adjacent-shifts.ts` — caseload schedule normalization.
- `mimetype.util.ts` — file-upload mimetype whitelist.
- `password.util.ts` — temp password generation.

### `lambda/` (older ESM lambdas)

- `eventProcessor.mjs` — the big Kinesis → REST translator; see §2.
- `cameraChecker.mjs`, `cameraPinger.mjs`, `dailyCameraRegistry.mjs` — camera health loops.
- `hubChecker2.mjs`, `sensorChecker.mjs`, `tabletChecker.mjs`, `tabletChecker2.mjs`, `tabletUpdater.mjs` — scheduled health / update checks.
- `lowBatteryNotifier.mjs`, `scheduledEmailer.mjs`, `summaryEmailer.mjs` — periodic emails.
- `getApiUrlByAppVersion.mjs` — returns the correct API URL to the mobile/tablet client based on its app version (version-pinning for phased rollouts).
- `shared/` — `alertEmail.mjs`, `date.mjs`, `emailHelpers.mjs`, `websocket.mjs`, `db/` — common helpers used across lambdas, including a minimal mysql client.

### `lambdas/` (newer TS lambdas)

- `device-checker.ts` + `camera-checker/`, `device-alert-notifier/`, `device-alert-summary/`, `hub-checker-2/`, `sensor-checker/`, `tablet-checker-2/`, `tablet-updater/` — per-folder TypeScript sources; built via the `scripts/build-*-*.js` scripts. Each has its own `package.json` in the group. `tsconfig.lambda.json` compiles these.

### `scripts/`

Per-lambda deploy scripts (Bash + Node): `deploy-camera-checker.js`, `deploy-camera-pinger.sh`, `deploy-daily-camera-registry.sh`, `deploy-event-processor.sh` / `-prod.sh`, `deploy-hub-checker-2.js`, `deploy-lambda-standalone.sh` (parametric), `deploy-low-battery-notifier.sh`, `deploy-sensor-checker.js`, `deploy-tablet-checker-2.js`, `deploy-tablet-checker.js` / `.sh`, `deploy-tablet-updater.js`.

Provisioning scripts: `create-ssm-activation.ts`, `create-ssm-parameter.ts`, `update-all-ssm-parameters.ts`, `sync-agency-hub-resources.ts`, `sync-all-agency-hub-resources.ts`, `update-agency-hub-policy.ts`, `update-agency-iot-hub-policy.ts`, `update-all-agency-*-policies.ts`, `tag-kinesis-streams-with-agency.ts`, `set-reolink-auth.ts`, `add-missing-reolink-auth.ts`, `create-camera-pinger-lambda.sh`.

Ad-hoc: `check-contract.js`, `publish-smoke-detector-test.mjs`, `publish-zigbee-event.mjs`, `send-command-to-tablet.ts`, `send-reset-password.ts`, `send-tablet-message.ts`, `nullify-super-admin-agency.js`, `remove-device-numbers.js`, `test-device-event.ts`, `toggle-agency-mfa.ts`, `toggle-user-mfa.ts`, `trigger-mqtt-alarm.js`, `build-lambda-enums.sh`.

### `bin/`

- `create-superuser.js` — seeds an `admin` superuser: `node bin/create-superuser.js admin@heylo.tech admin123 [First] [Last]`.
- `deploy.js`, `deploy.sh`, `prod-deploy.sh` — Docker build/push wrappers.
- `migrate-common-areas.ts`, `migrate-to-cognito.ts` — one-off data migrations (the Cognito migration converted legacy password-auth users).
- `seed-alert-demo.ts` — demo data for alert UI.
- `test-alert-websocket.js` — standalone WS test harness.

### `templates/`

HTML email templates. `{FieldName}`-style placeholders are substituted in-memory by whichever service reads the file. Files: `reset-password.html`, `complete-registration.html`, `device-battery-replaced.html`, `device-low-battery.html`, `device-offline-alert.html`, `device-online-alert.html`, `device-checker-site-admin.html`, `device-checker-summary.html`.

### `src/config/`

- `development.env` — local dev (MySQL on localhost, SMTP via Mailtrap/similar, etc.).
- `qa.env` — QA cluster.
- `test.env.example` — template for CI/local test runs (copy to `test.env`).

Production env is injected at container runtime, not committed.

### Build/deploy

- **API container:** `Dockerfile` — stage 1 Node 22 alpine, `npm install --force && npm run build`. Stage 2 copies `dist/src/**`, `src/config/**`, `templates/**`, `node_modules`, installs `ffmpeg` + `pm2` + `cross-env`. Runs `pm2 start main.js --name 'nestjs-app' --no-daemon` on port 3000. `NODE_ENV` is an `ARG` defaulting to `production`.
- **Lambdas:** each has its own deploy script. `deploy-lambda-standalone.sh` inlines env vars at build time — the README spells out the full `DB_HOST= DB_USER= …` form. Lambda names are prefixed `dev-`/`prod-` based on the `AWS_PROFILE`.

### Env vars (non-exhaustive)

Database: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`, `DB_LOGGING`.
AWS: `AWS_REGION`, plus SDK-standard credentials (profile in dev, instance role in prod).
Cognito (via `AwsService`): user-pool ID, client ID, custom attribute names — check `AwsService` / `src/config/*.env` for the exact keys.
WebSocket: `WEBSOCKET_API_ENDPOINT` (hostname of the API Gateway WS stage).
Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`.
Daily.co: `DAILY_API_KEY`.
App: `PORT`, `JWT_SECRET` (cookie-parser secret), `WEB_APP_URL`, `RESET_PASSWORD_URL`, `COMPLETE_REGISTRATION_URL`, `DEVICE_EVENT_API_KEY`.

### Where to start when changing things

- **Adding a REST endpoint:** add a method to the relevant controller, pipe through an existing service (or create one), add a DTO under `src/domain/dto/`, annotate with `@Roles(...)` if it's restricted, and if it returns a new shape, add a model + Automapper profile.
- **Adding a table:** entity in `src/entities/`, register it in the `entities` array in `app.module.ts` *and* in the relevant module's `TypeOrmModule.forFeature`, write a migration under `src/migrations/`, then expose it through service methods.
- **Adding a WS event type:** add to `src/domain/enums/websocket-event.ts`, emit via `WebSocketService.sendMessage(userIds, { event: ..., data: ... })`, and coordinate with the frontend `Event` enum in `lib/models/common/event.ts` — frontend handling lives in `context/socket-context.tsx`.
- **Adding a lambda:** add source to `lambdas/<name>/` (TS) or `lambda/<name>.mjs` (legacy), add a deploy script to `scripts/deploy-<name>.{sh,js}`, and if it calls into the API, use `XApiKeyGuard`-protected endpoints (`device-events`, `hub-events`, `camera-status`, `device-status`) or add a new `@Public()` + `@UseGuards(XApiKeyGuard)` controller method.
- **Adding a role:** update `src/domain/enums/role-id.ts` (and the frontend twin), seed the `Role` row via a migration, and audit every `@Roles(...)` usage to decide whether the new role should be included.
