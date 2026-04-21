---
type: overview
tags: [frontend, reference]
owner: Mike
updated: 2026-04-21
status: current
---
# Frontend — High Level Overview

The Heylo web app is a Next.js 15 App Router SPA (TypeScript + React 19) that serves as the operations console for Heylo's residential-care platform. It is the primary day-to-day surface for super admins, agency admins, support professionals, and residents themselves — alerts, video calls, chat, devices, caseloads, analytics, and site/user management all live here. Real-time behavior (incoming alerts, calls, chat messages, device online/offline status) is driven by a persistent WebSocket connection to AWS API Gateway, multiplexed through a single `SocketProvider` at the private-area root.

At a glance: pages under `app/(private)/*` live behind a layout that wires up `UserProvider → SocketProvider → VideoCallProvider` plus a global sidebar, alert-details modal, banners, and a top-level `VideoCall` component. Pages under `app/(public)/*` (login, forgot-password, complete-registration) use a separate marketing-style layout. `middleware.ts` does cookie-based auth redirects and role-based route gating, and also fires Segment page-view events in production. HTTP calls go through a shared `axios` instance (`lib/api.ts`) with `withCredentials: true`; authentication is AWS Cognito; video calling is Daily.co; analytics is Segment.

---

## 1. Concise architectural overview

### Stack

- **Framework:** Next.js 15 App Router, React 19, TypeScript, Turbopack dev server.
- **Styling:** Tailwind CSS v4 + shadcn/ui primitives (see `components/ui/*`), lucide-react icons, sonner toasts.
- **State:** React Context per concern (user, socket, video-call, caseload) plus local component state. No Redux / Zustand / React Query.
- **HTTP:** axios singleton with cookie credentials (`lib/api.ts`).
- **Auth:** AWS Cognito (`@aws-sdk/client-cognito-identity-provider`), idToken/accessToken/refreshToken/roleId stored as HttpOnly cookies set by the backend.
- **Realtime:** Raw WebSocket to `wss://{appConfig.webSocketApiEndpoint}?jwt={idToken}`, with an HTTP ping + watchdog reconnect scheme.
- **Video calling:** Daily.co (`@daily-co/daily-js`, `@daily-co/daily-react`) via a room/token created on the backend.
- **Analytics:** Segment — both client-side (`AnalyticsBrowser` in `app/analytics.ts`) and edge-middleware (`@segment/analytics-node` in `middleware.ts`). Disabled unless `NEXT_PUBLIC_ENV === "production"` and opted-out for super admins.
- **Deploy:** Vercel (per `cd-production.yml`, `cd-qa.yml`, `cd-staging.yml` — Azure DevOps pipelines that drive `vercel build/deploy`).

### Folder structure

```
frontend/
├── app/                    # Next.js App Router
│   ├── (public)/           # login, forgot-password, change-password, complete-registration
│   ├── (private)/          # everything behind auth: dashboard, agencies, users, sites,
│   │                       # alerts, communication, caseload, analytics, my-schedule,
│   │                       # heylo-support, timeline, waypoints, connections, calls
│   ├── layout.tsx          # Root — <html>, Toaster, installs router-ref singleton
│   ├── page.tsx            # / → redirect('/login')
│   └── analytics.ts        # Segment browser wrapper (identify/track)
├── components/             # Feature components, keyed by domain
│   ├── ui/                 # shadcn/ui primitives + a few custom ones (disconnect-banner, etc.)
│   ├── sidebar/            # App sidebar + nav filtering by role
│   ├── communication/      # Chat, video-call, active calls
│   ├── alert/, agency/, analytics/, caseload-management/, connection/,
│   │ dashboard/, devices/, heylo-support/, my-schedule/, resident-profile/,
│   │ site/, users/
│   └── RouteListener.tsx   # Central imperative router side-effect listener
├── context/                # React contexts
│   ├── socket-context.tsx  # THE real-time hub — WS connection, alert sound, toast routing
│   ├── video-call-context.tsx
│   └── caseload-context.tsx
├── hooks/                  # useUser, useAuth, useApi, use-mobile, use-ringtone
├── lib/
│   ├── api.ts              # axios instance (NEXT_PUBLIC_API_BASE_URL, withCredentials)
│   ├── cognito.ts          # Cognito client factory
│   ├── event-hub.ts        # In-process pub/sub bridging WS events → components
│   ├── router-ref.ts       # Global handle to next/navigation router (set at root layout)
│   ├── utils.ts            # cn(), formatting, role filtering, CSV export, etc.
│   ├── constants/          # devices, ui-strings
│   ├── models/             # Domain DTOs mirroring backend (agency, alert, call, caseload, ...)
│   └── utils/              # device-permissions, time-conversion
├── services/               # Thin axios wrappers, one file per backend resource
│   └── (agency, alert, analytics, appconfig, call, caseload, connection,
│        conversation, device, intercom, site, user, waypointLogger)
├── middleware.ts           # Edge middleware: role-based route guard + Segment page-view
├── next.config.ts          # Image remotePatterns for S3 avatars/home pictures
├── bin/deploy.{js,sh}      # Deploy helpers (used by Vercel pipelines)
└── cd-{production,qa,staging}.yml  # Azure DevOps → Vercel deploys
```

### Key concepts

1. **Two layout groups** (`(public)`, `(private)`) give Next's route-group segmentation: public has a marketing-card layout with a sidebar image; private wraps every page in `UserProvider → SocketProvider → VideoCallProvider` plus global overlays.
2. **Cookie-based auth with edge-enforced role gating.** `middleware.ts` reads `idToken`, `roleId`, `config` cookies (all set by the backend on `/auth/session`) and redirects based on a hard-coded matrix of role → allowed private route. The `UserProvider` then calls `/user/my` on mount to hydrate the client state.
3. **Single WebSocket as realtime backbone.** `SocketProvider` owns the only WS connection for the whole app. It dispatches every incoming message through `EventHub.emit(event, data)` so that any component can `EventHub.on(Event.callCreated, ...)` without prop-drilling. It *also* locally handles a hard-coded set of side effects (alert sound + desktop notification + toast for `AlertCreated`, battery/device status toasts, conversation-message toast with inline route-dedupe).
4. **Service layer** is thin — `services/*.ts` files are just typed axios wrappers keyed to REST endpoints (`/user/search`, `/call/:id`, `/alert/search`, …). No caching layer; components call services in `useEffect`.
5. **Role-based UI filtering** is implemented in two places: `middleware.ts` (redirect) and `lib/utils.ts` `filterNavigationLinks()` (sidebar items). Four `RoleId` enum values exist: `superAdmin`, `admin`, `supportProfessional`, `resident`.

### Main entry points

- **Server:** `app/layout.tsx` (client component despite name — uses `"use client"` and installs the `next/navigation` router into `lib/router-ref.ts` so non-React code like WS toast handlers can navigate).
- **Unauthenticated:** `app/(public)/login/page.tsx` → Cognito `InitiateAuth` → backend `/auth/session` which sets cookies.
- **Authenticated:** `app/(private)/layout.tsx` → `UserProvider` fetches `/user/my` and `/app/config`, then renders nested providers + sidebar + the `<children>` of whatever page.

### Data flow

1. User logs in → backend sets HttpOnly cookies → client reloads.
2. `middleware.ts` sees `idToken` + `roleId`, allows/redirects based on role + path.
3. `UserProvider` hits `/user/my` (returns user + fresh tokens) and `/app/config` (websocket endpoint, Segment key, AWS region). Tokens live in memory; cookies remain as the transport for API requests.
4. `SocketProvider` opens a WS using `idToken`. Every inbound frame is `EventHub.emit`'d. The HTTP ping (4s) and watchdog (15s since-last-message) keep the connection healthy.
5. Pages mount, call `services/*` (which call backend over axios+cookies), and subscribe to `EventHub` for live updates (e.g. `Event.conversationMessageCreated`, `Event.alertCreated`, `Event.callCreated`, `Event.deviceOnline|Offline|StandBy`, `Event.batteryLow|Recovered`).

---

## 2. Detailed technical deep-dive

### Authentication & session

The frontend does **not** hold auth state in localStorage or Redux. The source of truth is cookies set by the backend (`idToken`, `accessToken`, `refreshToken`, `roleId`, `userId`, `config`, all HttpOnly except what the middleware needs to read). `lib/api.ts` is just:

```ts
axios.create({ baseURL: process.env.NEXT_PUBLIC_API_BASE_URL, withCredentials: true });
```

Login flow:

1. `app/(public)/login/page.tsx` calls Cognito directly (`InitiateAuthCommand` with `USER_PASSWORD_AUTH`) using the browser-side client in `lib/cognito.ts`.
2. On success, the returned Cognito tokens are POSTed to `/auth/session` on the backend, which verifies the JWT, syncs platform claims, and sets the HttpOnly cookies.
3. The browser is redirected to a role-appropriate landing page (super admin → `/analytics`, everyone else → `/dashboard`).

Logout (`hooks/useAuth.ts`) → `POST /auth/logout` (clears cookies) → `router.push('/login')` + `clearUser()`.

Edge middleware (`middleware.ts`) runs before every route. Its logic:

- Redirect authenticated users away from public routes.
- Redirect unauthenticated users away from private routes.
- Role-specific redirects: super admins are pinned to `/analytics`; admins/support-professionals can't hit `/agencies`; `/caseload-management` is admin-only; support professionals can't hit `/users`; etc. The matrix is expressed as a sequence of `if` checks — if you add a role or a route, add branches here *and* in `filterNavigationLinks()`.

### Realtime: `SocketProvider`

`context/socket-context.tsx` is the single most important file in the app. It:

- Waits for `user`, `idToken`, and `appConfig` (from `UserProvider`), then opens `wss://{webSocketApiEndpoint}?jwt={idToken}`.
- Exposes `{ socket, isConnected, connectionAttempted, troubleConnecting }` via context but most consumers don't use the socket directly — they use `EventHub`.
- Maintains connection health via two timers:
  - **HTTP ping** every 4s (`connectionService.ping()`), which is a REST call that the backend routes back through WS as a `pong` — a useful trick because API Gateway WS doesn't expose browser→server pings.
  - **Watchdog** every 15s — if `lastMessageTimestamp` is older than 15s, close the socket and let `onclose` trigger the reconnect path.
- Reconnect on `onclose` uses exponential backoff (1s, 2s, 4s, … max 30s), except tab-switches (code 1001) which reconnect after 1s.
- On `visibilitychange → visible`, reconnects if the socket is closed/closing.
- Unlocks audio on first user interaction (click/keydown/touchstart) to satisfy browser autoplay policy, because `AlertCreated` events need to play `/alert.mp3`.
- Requests `Notification.requestPermission()` on mount.
- Updates `document.title` with a `🔴` prefix whenever disconnected after a prior connection attempt.
- Has inline UI for several event types (battery low/recovered, device online/standby/offline, incoming alert with CRITICAL/MEDIUM/LOW tag + site/device/resident chips, incoming chat message with dedupe against the currently-open conversation path).

### Event bus (`lib/event-hub.ts`)

A tiny `Map<Event|Command, Listener[]>` singleton. Two enums in `lib/models/common/event.ts`:

- `Event` — things that happened (server-originated): `ConversationMessageCreated`, `CallCreated`, `CallConnected`, `AlertCreated`, `DeviceOnline|StandBy|Offline`, `BatteryLow|Recovered`, `RouteChanged`, `DeviceAlertsChanged`, etc.
- `Command` — things the UI wants to do (intra-app): `OnStartCall`, `OnJoinCall`, `OnCallCreated`, `OnViewAlertDetails`, `OnAlertStatusUpdated`.

This decoupling is what lets the "new message" toast in `SocketProvider` link to a chat page via `getRouter()?.push(...)` without knowing anything about chat components, and lets the video-call widget start a call from a button anywhere in the tree.

### Video calling

Daily.co is integrated via `components/communication/video-call/VideoCall.tsx`, rendered globally inside the private layout so it can pop up regardless of which page the user is on. The flow:

1. User triggers a call (e.g. from a resident row) → `EventHub.emit(Command.onStartCall, ...)`.
2. `VideoCall` catches it, calls `callService.getMyWithResidentId(...)` (backend creates a Daily room and `Call` record) then `callService.getToken(callId)`.
3. Joins the Daily room with the token and manages connected/missed/rejected/ended state via `PATCH /call/:id/{connected|missed|rejected|ended}`.
4. `VideoCallContext` exposes `{ inCall, setInCall }` so other parts of the UI can hide/show appropriate affordances.

### Analytics

Two flavors:

- **Browser** (`app/analytics.ts`): `AnalyticsBrowser` from `@segment/analytics-next`, wrapped in an `Analytics` class that no-ops unless `NEXT_PUBLIC_ENV === "production"` and the caller isn't a super admin. `UserProvider` calls `analytics.identify(...)` after login.
- **Edge** (`middleware.ts`): `Analytics` from `@segment/analytics-node`, reading the Segment write key from the `config` cookie (base64 JSON). Fires `analytics.page(...)` on every private-route navigation for non-super-admin users.

There's also a Waypoint logging pipeline — `services/waypointLoggerService.ts` persists browser-tagged events (`user_login`, `websocket_connected`, `call_received`, `audio_playback_failed`, etc.) through `connectionService.logWaypoint → POST /connection/waypoint`, which the backend forwards to DynamoDB. Browser detection is a manual UA-string parser.

### Conventions & quirks to be aware of

- **`"use client"` everywhere.** The layout itself is a client component so that `next/navigation`'s `useRouter` can be plumbed into `router-ref.ts`. Server components are essentially unused.
- **`reactStrictMode: false`** in `next.config.ts` — disabled to avoid double-mounting on video streams. Double-mount bugs will not be caught locally.
- **`eslint.ignoreDuringBuilds: true`** in next config — lint runs separately; build won't fail on ESLint errors. (TypeScript errors still fail builds.)
- **Import alias is `@/*` → project root** (see `tsconfig.json`). So `@/lib/api`, `@/services/userService`, `@/context/socket-context`.
- **Directory group naming.** `(private)` and `(public)` are Next route groups — they don't appear in URLs, they just scope `layout.tsx`.
- **Imperative router handle.** `lib/router-ref.ts` holds a module-level `AppRouterInstance`, set by the root layout and read by non-React callbacks (e.g. toast onClick handlers in `SocketProvider`). Treat writing new non-React navigation paths with this same pattern.
- **Services are stateless.** Don't put caches or side effects in `services/*`; add them at the page/component level.
- **Role IDs are hard-coded UUIDs** in `lib/models/common/role-id.ts`. These must stay in sync with the backend `roles` table.
- **Desktop notifications and alert sound** are started inside the WS `onmessage` handler — don't move that logic elsewhere, the audio-unlock and permission-request state is colocated there deliberately.

---

## 3. Exhaustive reference

### `app/` — routes

```
app/
├── layout.tsx              # Client root — installs router-ref, <Toaster />
├── page.tsx                # redirect('/login')
├── globals.css             # Tailwind v4 entry, theme tokens
├── favicon.ico
├── analytics.ts            # Segment AnalyticsBrowser wrapper
├── (public)/
│   ├── layout.tsx          # Logo + image sidebar + ToS/privacy links
│   ├── login/
│   ├── forgot-password/
│   ├── change-password/
│   └── complete-registration/
└── (private)/
    ├── layout.tsx          # UserProvider → SocketProvider → VideoCallProvider,
    │                       # AppSidebar, DisconnectBanner, DeviceAlertBanner,
    │                       # AlertDetails, VideoCall, RouteListener
    ├── agencies/           # super-admin only
    ├── alerts/
    │   └── superuser/      # super-admin view of all alerts across agencies
    ├── analytics/          # super-admin only
    │   └── superuser/
    ├── calls/
    ├── caseload/
    ├── caseload-management/# admin only
    ├── communication/
    │   ├── page.tsx        # conversation list
    │   ├── call/[id]/      # call detail
    │   └── chat/[id]/      # conversation detail
    ├── connections/        # WS connection debug (super-admin)
    ├── dashboard/          # default landing for admins/SPs
    ├── heylo-support/      # Intercom ticket submission
    ├── my-schedule/        # SP shift view
    ├── sites/
    │   └── [id]/           # per-site devices, common areas, etc.
    ├── timeline/
    ├── users/
    │   └── [id]/           # per-user profile
    └── waypoints/          # user/device waypoint audit log (super-admin)
```

### `components/`

- `ui/` — shadcn primitives (`button`, `input`, `dialog`, `dropdown-menu`, `sidebar`, `tabs`, `table`, `form`, `sheet`, `tooltip`, …) plus custom:
  - `connection-indicator.tsx`, `disconnect-banner.tsx`, `device-alert-banner.tsx` — surface socket/device health.
  - `sonner.tsx` wraps the toast provider.
  - `timer-picker.tsx`, `custom-date-input.tsx` — domain-tuned inputs.
- `sidebar/app-sidebar.tsx` — main nav, filtered by `filterNavigationLinks(data, roleId)`.
- `communication/` — `active-chats.tsx`, `missed-calls.tsx`, `chat-message-error.tsx`, `options-modal.tsx`, `section-cards.tsx`, `tablet-connection-indicator.tsx`, and `video-call/VideoCall.tsx`.
- `alert/alert-details.tsx` — modal triggered by `EventHub.on(Command.onViewAlertDetails, ...)`.
- Feature-scoped folders: `agency/`, `analytics/`, `caseload-management/`, `connection/`, `dashboard/`, `devices/`, `heylo-support/`, `my-schedule/`, `resident-profile/`, `site/`, `users/`.
- `RouteListener.tsx` — subscribes to `Event.routeChanged` and `useRouter` hooks for cross-cutting route concerns.

### `context/`

- `socket-context.tsx` — see §2 deep-dive.
- `video-call-context.tsx` — `{ inCall, setInCall }`; simple boolean around the active-call state.
- `caseload-context.tsx` — wraps paged caseload lists with `searchCaseloads`, `updateCaseload`, `deleteCaseload`. Used by caseload-management pages to share state without refetching.

### `hooks/`

- `useUser` — the `UserProvider` + `useUser()` pair. Returns `{ user, analytics, appConfig, clearUser, loading, idToken, accessToken, refreshToken }`. Hits `/user/my` and `/app/config` on mount.
- `useAuth` — logout helper.
- `useApi` — generic `{ data, loading, error }` GET hook. Minimal; most services aren't wrapped in it.
- `use-mobile` — viewport width breakpoint.
- `use-ringtone` — ringing audio for incoming calls.

### `lib/`

- `api.ts` — axios instance.
- `cognito.ts` — Cognito client + `clientId`, `region` from `NEXT_PUBLIC_*` env.
- `event-hub.ts` — `EventHub` singleton (`on`, `off`, `emit`).
- `router-ref.ts` — module-level Next router handle.
- `utils.ts` — 300+ lines of helpers: `cn` (class merge), `userInitials`, `generateAlertFormattedAlertId`, `generateAlertTitle` (device-type → human-readable alert title), `roles` (hard-coded role list), `getRoleName`, `getRoles`, `filterNavigationLinks`, `getPriorityLabel`, `formatPhoneNumber`, `usStates`, `timezones`, `toKebabCase`, `timeToMinutes`, `getNextDayDate`, `isUserRegistrationLinkExpired`, `exportCSV`, `getBatteryStyle`, `isUploadedFileSizeInvalid`, `groupConflictsByWeekday`, `isValidUrl`, `isBlankStr`, `isEmptyArr`.
- `constants/devices.ts`, `constants/ui-strings.ts` — string tables.
- `utils/device-permissions.ts`, `utils/time-conversion.ts`.
- `models/` — DTO TypeScript mirrors of the backend `domain/` folder. Grouped by entity: `agency/`, `alert/` (with `alertSetting.ts` including `AlertPriority`), `analytics/`, `call/`, `caseload/`, `common/` (`event.ts`, `role-id.ts`, `device-capability.ts`, `device-type-name.ts`), `connection/`, `conversation/`, `device/`, `intercom/`, `logged_in_user/`, `site/`, `users/`, `waypoint/`, plus `app-config.ts`, `error-model.ts`, `exceptions-model.ts`, `pages-list-model.ts`, `sort-order-model.ts`.

### `services/`

All files follow the shape `export const xService = { method(req): Promise<T> { await api.verb(path); } }`. One file per backend resource:

- `agencyService.ts`, `alertService.ts`, `analyticsService.ts`, `appconfigService.ts`, `callService.ts`, `caseloadService.ts`, `connectionService.ts`, `conversationService.ts`, `deviceService.ts`, `intercomService.ts`, `siteService.ts`, `userService.ts`, `waypointLoggerService.ts`.

Representative endpoints they hit:

- `userService`: `GET /user/my`, `POST /user/search`, `POST /user/assign-site`, `POST|PUT|DELETE /user`, `GET /user/:id`.
- `callService`: `GET /call/:id`, `GET /call/:id/token`, `GET /call/my/with/resident/:id`, `POST /call/search`, `POST /call/history/search`, `POST /call/:id/event-log/:event`, `PATCH /call/:id/{connected|missed|rejected|ended|ping}`.
- `alertService`: `POST /alert/search`, `POST /alert/superuser/search`, `GET /alert/:id`, `POST /alert/event/log`, `PATCH /alert/:id/{resolved|needs-support|dismissed}`, device-alert endpoints.
- `connectionService`: `POST /connection/superuser/search`, `POST /connection/ws/ping`, `POST /connection/waypoint`, `POST /connection/waypoint/search`, `POST /connection/device-waypoint/search`.
- `conversationService`, `intercomService`, `deviceService`, `siteService`, `agencyService`, `analyticsService`, `caseloadService`, `appconfigService` — one-to-one with backend controllers.

### `middleware.ts`

Runs on every request. Keys off `idToken`, `roleId`, `userId`, `config` cookies. Two responsibilities:

1. **Route guard.** Hard-coded `privateRoutes` and `publicRoutes` arrays + role-specific redirects (see §2).
2. **Page-view tracking.** In production and for non-super-admin users, decodes the `config` cookie, instantiates a fresh `@segment/analytics-node` client, and fires `analytics.page({ name, userId, properties })` for the longest-prefix match against `privateRoutes`.

### `public/`

Static assets — `logo.svg`, `alert.mp3` (triggered in `SocketProvider`), images referenced from the public layout.

### Config & deployment

- `next.config.ts` — `remotePatterns` for all dev/qa/prod S3 buckets (`*-heylo-user-profile-picture`, `*-heylo-home-picture`); `reactStrictMode: false`; ESLint ignored at build; TS errors not ignored.
- `tsconfig.json` — path alias `@/* → ./*`.
- `eslint.config.mjs`, `postcss.config.mjs`, `components.json` (shadcn/ui config).
- `package.json` scripts: `next dev --turbopack` / `next build` / `next start --port 3000`.
- `cd-production.yml`, `cd-qa.yml`, `cd-staging.yml` — Azure DevOps pipelines that install deps (`npm install --force`), rebuild native modules, then `vercel link / build / deploy --prod --prebuilt`.

### Env vars

The frontend reads only `NEXT_PUBLIC_*` client-side:

- `NEXT_PUBLIC_API_BASE_URL` — backend origin for axios.
- `NEXT_PUBLIC_AWS_REGION`, `NEXT_PUBLIC_AWS_COGNITO_USER_AUTH_CLIENT_ID` — Cognito.
- `NEXT_PUBLIC_ENV` — `"production"` gates all analytics.

Every other secret (Daily.co API key, Segment write key, WebSocket endpoint) is served to the client through `GET /app/config` after authentication.

### Where to start when changing things

- Adding a route → add to `middleware.ts` `privateRoutes`/`publicRoutes`, add role redirects if needed, add a folder under `app/(private)/` or `app/(public)/`, and if it should appear in the sidebar, edit `components/sidebar/app-sidebar.tsx` and the allow-list in `filterNavigationLinks`.
- Adding a backend endpoint to call → create/extend a file in `services/`; import via `@/services/xService`.
- Adding a realtime event → add to `Event` or `Command` enum in `lib/models/common/event.ts`, then `EventHub.on(...)` in whichever component cares; if the backend already emits the event, `SocketProvider.onmessage` will dispatch it for free.
- Adding a role → update `lib/models/common/role-id.ts`, `lib/utils.ts` `getRoleName`/`getRoles`/`filterNavigationLinks`, and the redirect matrix in `middleware.ts`.
