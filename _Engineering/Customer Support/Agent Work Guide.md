---
type: guide
tags: [customer-support, frontend, agents]
owner: Mike
updated: 2026-05-07
status: current
---
# Customer Support - Agent Work Guide

This guide is for agents making changes in `customer-support/`. Use with [[Agent Operating Loop]], [[Agent Verification Matrix]], and [[Backend/Agent Work Guide]] when the change touches a backend support API.

> **Read first**: `customer-support/PARITY_AUDIT.md` is the authoritative status board for what's ported from the main operator console (`done` / `partial` / `todo`), explicitly out-of-scope items, and the table of every backend `@Roles` change required by this app. Open it before adding pages or touching backend role grants.

---

## What this app owns

- Internal-facing customer support console for Heylo's `customerSupport` role (super admins also have access).
- React 19 + TypeScript + Vite SPA (`heylo support` workspace).
- MUI 7 UI, React Router 7 routing, Zustand 5 state.
- Cookie-auth via the same `idToken` cookie the Next operator console uses (set on `.heylo.tech`), so a sibling subdomain shares the session automatically.
- Backend counterpart: `IntercomController`, `AlertController`, `CallController`, `SiteController`, `AgencyController`, `UserController`, `ConnectionController`, `ConversationController` in `backend/src/controllers/`.

Default Vite port: **5175** (already in CORS allow-list). Production subdomains: **`support.heylo.tech`** / **`dev-support.heylo.tech`**.

---

## Auth and role gating

- The login page (`src/pages/Login.tsx`) runs `USER_PASSWORD_AUTH` against Cognito (`@aws-sdk/client-cognito-identity-provider`), then `POST /auth/session` so the backend sets the httpOnly `idToken` cookie. All API requests use `withCredentials: true` — there is no `Authorization` header.
- Allowed roles in this app (see `ALLOWED_ROLE_IDS` in `src/lib/roles.ts`): `customerSupport`, `superAdmin`, `admin`, `supportProfessional`. Other roles get "Access denied" on the login screen. `ROLE_IDS` lists every backend role for label / filter use; **adding a value to `ROLE_IDS` should NOT silently grant sign-in** — update `ALLOWED_ROLE_IDS` explicitly.
- Use the `lib/roles.ts` helpers — `isSuperAdmin(roleId)` and `isAgencyExempt(roleId)` — for client-side role checks. Don't compare role IDs inline.
- The `customerSupport` role is in `AGENCY_EXEMPT_ROLES` (`backend/src/domain/enums/role-id.ts`) — these users have no agency scope and can read across all agencies. Backend endpoints called by this app must include `RoleId.customerSupport` in their `@Roles(...)` decorator.
- Super-admin-only backend endpoints (`/connection/superuser/search`, `/alert/superuser/search`) stay `superAdmin`-only. The corresponding UI is gated client-side via `isSuperAdmin` (sidebar item hidden + page-level "restricted to super admins" notice). Do not loosen those backend grants.

---

## High-signal files to read first

- `customer-support/CLAUDE.md` — app-local conventions and guard rails.
- `customer-support/PARITY_AUDIT.md` — what's ported, what's not, every backend `@Roles` change required.
- `customer-support/src/App.tsx` — routes + `ProtectedRoute` wrapper.
- `customer-support/src/lib/api.ts` — axios client (cookie auth).
- `customer-support/src/lib/cognito.ts` — Cognito client.
- `customer-support/src/lib/roles.ts` — `ROLE_IDS`, `ALLOWED_ROLE_IDS`, `isSuperAdmin`, `isAgencyExempt`.
- `customer-support/src/lib/alerts.ts`, `lib/deviceTypes.ts` — small shared formatters/enums.
- `customer-support/src/components/Loading.tsx` — `LoadingBoundary` / `useLoading` / `SkelRows` / `SkelBlock` (skeleton-loading primitives — see "Loading states" below).
- `customer-support/src/components/Sidebar.tsx` — nav + super-admin-only filter.
- `customer-support/src/store/auth.ts` — auth state + `currentUser`.
- `customer-support/src/services/` — per-domain HTTP service modules.
- `customer-support/src/pages/` — pages own data fetching.
- `customer-support/src/store/` — Zustand stores per domain concern.
- `customer-support/src/types/` — TypeScript types mirroring backend DTOs (`common.ts` mirrors backend enums; do not invent UI-side variants).

---

## Backend contract (the wired endpoints)

| Surface | Endpoint | Notes |
|---|---|---|
| Tickets inbox | `GET /intercom/tickets` | Proxies Intercom's `/tickets/search` (see `IntercomService.listTickets`) |
| Ticket types | `GET /intercom/ticket-types` | For the ticket-create form |
| Create ticket | `POST /intercom/tickets` (multipart) | Forwards files via S3 + Intercom reply |
| Agencies / sites | `POST /agency/search`, `POST /site/search` | Returns all when caller is agency-exempt |
| Agency / site typeahead | `GET /agency/search`, `GET /site/search`, `GET /site/search-with-agency` | Now allow `customerSupport` |
| Site devices | `GET /site/:id/devices`, `GET /device/types` | Per-site device topology + camera filtering |
| Active alerts list | `POST /alert/search` | Cross-agency when caller has no agencyId |
| Alert detail / actions | `GET /alert/:id`, `PATCH /alert/:id/{needs-support,resolved,dismissed}`, `POST /alert/event/log` | |
| Call history | `POST /call/history/search` | Requires `agencyId` filter |
| Per-resident calls/conversations | `GET /call/my/with/resident/:residentId`, `GET /conversation/my/with/resident/:residentId` | |
| User search | `POST /user/search` | Used by Users page + per-site Residents tab |
| Connection health | `POST /connection/superuser/search` | **Super-admin only** on backend; UI gated to super admin |

The full table — including which grants are "+ customerSupport only" vs "+ superAdmin + customerSupport" — lives in `customer-support/PARITY_AUDIT.md`. Update that table whenever you touch a backend `@Roles(...)` decorator on behalf of this app.

---

## Fast change recipes

### Add a new route

1. Create a page component in `customer-support/src/pages/` (named export).
2. Add the route in `App.tsx` inside the `ProtectedRoute` block.
3. Optional: add a nav item in `components/Sidebar.tsx`. Set `superAdminOnly: true` if it should only render for super admins.
4. Create any needed Zustand store in `src/store/` and HTTP service in `src/services/`.
5. Wrap loading state with `LoadingBoundary` + `data-skel` (see "Loading states" below).
6. Verify with `npm run build -w customer-support`.

### Add or change page data

1. If the contract changes, update the backend endpoint/DTO **first** (and add `RoleId.customerSupport` to its `@Roles(...)` if it isn't already there).
2. Update TypeScript types in `customer-support/src/types/` (and `types/common.ts` enums if you're adding a new mirrored backend enum — match exactly).
3. Add or update the service module in `customer-support/src/services/`.
4. Fetch from the page component, write into the appropriate Zustand store (or `useState` for page-local UI state).
5. Defensively guard list state from the API: `setItems(result.items ?? [])` — paged endpoints occasionally return `items: undefined`.
6. Keep components presentational — they read from store/props, never the API.
7. If you added or widened a backend `@Roles(...)` grant, document it in `PARITY_AUDIT.md`.

---

## Loading states (programmatic skeletons)

We do **not** maintain parallel `<XxxSkeleton />` components. Pattern:

- Wrap a section with `<LoadingBoundary loading={loading}>` from `components/Loading.tsx`. It toggles the `is-loading` class on a wrapping `<Box>` and exposes the loading state via `useLoading()`.
- Mark dynamic descendants with `data-skel`. Global CSS in `index.css` (`.is-loading [data-skel]`) masks their text and shows a shimmer block on the same DOM node.
- Provide a placeholder string so the masked element doesn't collapse: `data-skel={loading || undefined}>{site?.name ?? '————————'}`.
- For tables, where rows literally don't exist before data, drop `<SkelRows cols={N} rows={N} />` into `<TableBody>` while loading.
- For non-text placeholders (avatar circles, chart slots), use `<SkelBlock width={...} height={...} />`.

Reserve `<CircularProgress />` for one-shot action loaders (e.g. the Login submit button).

---

## Coding standards

- Use MUI components and the existing theme in `theme.ts`. No Tailwind, Bootstrap, or one-off styling systems.
- Use Zustand for cross-page state. One store per domain concern. Page-local UI state (filter forms, paged list, dialog open) stays in `useState`.
- Network requests originate from page components (or `Login.tsx`). Stores and presentational components do not fetch.
- After mutations, **re-fetch** rather than patching the store optimistically (mirrors the main frontend convention).
- Mirror backend enums exactly in `types/common.ts`; do not invent UI-side enum variants.
- Use `lib/roles.ts` helpers (`isSuperAdmin`, `isAgencyExempt`) for client-side role checks. Do not compare role IDs inline.
- For loading UI, **use `LoadingBoundary` + `data-skel` / `SkelRows` / `SkelBlock`** — do not introduce per-page Skeleton components or new spinners outside one-shot action buttons.
- Use named exports for components, services, and stores. `App.tsx` is the one default-export exception.
- Do not use `any` or `@ts-ignore`.
- Do not add dependencies, env vars, or deployment config changes without explicit approval.
- Do not modify `vite.config.ts`, `tsconfig*.json`, or deploy scripts without explicit approval.
- Do not loosen backend `@Roles(...)` decorators outside what `PARITY_AUDIT.md` documents — every grant is intentional.

---

## Done checklist

- Routes are registered in `App.tsx` inside `ProtectedRoute`.
- Page owns network request and writes to Zustand (or `useState` for page-local state).
- Components remain presentational.
- Types match backend DTO/response shape; new mirrored enums live in `types/common.ts`.
- Backend `@Roles(...)` includes `customerSupport` for any new endpoint this app calls (or, for super-admin-only surfaces, the UI is gated client-side via `isSuperAdmin`).
- Loading state uses `LoadingBoundary` + `data-skel` / `SkelRows` / `SkelBlock`, not a spinner.
- `PARITY_AUDIT.md` is updated if you ported a new feature or changed a backend role grant.
- `npm run build -w customer-support` passes.
- Backend docs/routes are updated if the API contract changed.

---

## Local dev

- From the vault root: `npm run dev:support` (loads `.env.dev` + `.env`).
- Or via the CLI launcher: `npx heylo support`.
- Or directly: `npm run dev -w customer-support`.

App runs at `http://localhost:5175`. Cookie auth across `localhost` ports works out of the box because the API sets the cookie without a `domain` attribute on localhost. In production the cookie is scoped to `.heylo.tech` and shared with `support.heylo.tech` automatically.

Required env vars (see `customer-support/.env.example`):
- `VITE_API_BASE_URL` — full URL to the Nest API (e.g. `https://dev-app-api.heylo.tech`)
- `VITE_AWS_REGION` — `us-east-2`
- `VITE_AWS_COGNITO_CLIENT_ID` — the Cognito user-pool client id

---

## Known gaps / follow-ups

The full status board (`done` / `partial` / `todo` per ported feature, plus explicitly out-of-scope items like caseload, scheduling, resident communication, analytics, and waypoints) lives in `customer-support/PARITY_AUDIT.md`. Highlights still open:

- **Ticket detail view**: no `GET /intercom/tickets/:id` endpoint yet; the inbox shows a summary modal only.
- **Real-time alert updates**: needs WebSocket bus subscription; pages currently poll on filter / page change.
- **Per-call detail / playback**: needs new backend endpoint.
- **Activity Timeline messages**: today the timeline shows alerts and calls only. `POST /conversation/search` is participant-scoped (caseload-driven) and returns nothing for cross-agency callers. A `POST /conversation/superuser/search` (or similar) would be needed before messages can be wired in.
- **Device notifications panel** on the Dashboard: there is no clean read endpoint for device events / battery / connectivity status today. The panel was removed from the live data view; surface them via alerts (`alertType`) or a future device-event read endpoint.
- **Eslint config**: `customer-support/eslint.config.js` referenced by `npm run lint` is not currently on disk; the sibling Vite apps are in the same state. `npm run build` is the source-of-truth verification for now.
- **React types alignment**: `customer-support` uses React 19 to match what MUI is built against in the hoisted workspace. `inventory/` and `customer-onboarding/` still declare React 18 and currently fail `tsc -b` against the hoisted MUI types — bumping them to React 19 fixes it.
