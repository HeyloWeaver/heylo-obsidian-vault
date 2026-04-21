# Frontend - Agent Work Guide

This guide is optimized for agents making changes in `frontend/`.

Use with `_Engineering/Frontend/High Level Overview.md` (deep reference).
Use `_Engineering/Frontend/Domain Playbooks.md` for subsystem-specific entry points.

---

## What this repo owns

- Operator web console (Next.js App Router).
- Role-gated private routes and public auth flows.
- UI and interaction layer for alerts, calls, communication, sites, users, analytics, caseloads.
- Realtime client handling via WebSocket context.

---

## High-signal files to read first

- `frontend/app/(private)/layout.tsx` - private app shell and providers.
- `frontend/middleware.ts` - auth redirects and role route gating.
- `frontend/context/socket-context.tsx` - realtime behavior and event side effects.
- `frontend/hooks/useUser.tsx` - user/config bootstrap and auth-dependent state.
- `frontend/lib/api.ts` - shared axios configuration.
- `frontend/lib/models/common/event.ts` - event and command enums.
- `frontend/services/` - API-facing methods by domain.
- `frontend/components/sidebar/app-sidebar.tsx` and `frontend/lib/utils.ts` - nav visibility by role.

---

## Fast change recipes

### Add a private page

1. Add route under `frontend/app/(private)/...`.
2. Add role handling in `frontend/middleware.ts` if needed.
3. Add sidebar entry if needed, then update filtering logic.
4. Add/extend service call in `frontend/services/*`.

### Add a new API response field to UI

1. Update model under `frontend/lib/models/`.
2. Update service mapping/usage under `frontend/services/*`.
3. Update component props/render path.
4. Verify empty/loading/error states still make sense.

### Add a realtime interaction

1. Confirm event name in `frontend/lib/models/common/event.ts`.
2. Handle in `frontend/context/socket-context.tsx` and/or subscribe via `EventHub`.
3. Check navigation/notification/toast behavior.
4. Ensure duplicate event handling is avoided.

---

## Gotchas and drift risks

- Route access logic exists in multiple places (middleware + nav filtering).
- Caseload beta has active migration work (fixtures and GraphQL transition context).
- Some state/tooling dependencies may be legacy; verify usage before adding more.
- Middleware currently carries both routing and analytics concerns.

---

## Done checklist for frontend tasks

- Route behavior works for each affected role.
- Service contracts still match backend responses.
- Realtime handlers do not break existing toast/audio behavior.
- Lint passes for touched files.
- Update `_Engineering/Frontend/*` notes when behavior changes.

