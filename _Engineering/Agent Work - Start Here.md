---
type: guide
tags: [engineering, agents, backend, frontend, go, tablet, hub]
owner: Mike
updated: 2026-04-23
status: current
---
# Agent Work - Start Here

This is the fast handoff page for future agents working in Heylo.

Use this page first, then jump to the repo-specific guide:

- Frontend: [[Frontend/Agent Work Guide]]
- Backend: [[Backend/Agent Work Guide]]
- Go: [[Go/Agent Work Guide]]
- Tablet: [[Tablet/Agent Work Guide]]
- Hub: [[Hub/Agent Work Guide]]

Reviewing code (or self-reviewing before opening a PR): [[Code Review Guide]]

Then use domain playbooks for targeted work:

- Frontend domains: [[Frontend/Domain Playbooks]]
- Backend domains: [[Backend/Domain Playbooks]]
- Go domains: [[Go/Domain Playbooks]]
- Tablet domains: [[Tablet/Domain Playbooks]]
- Hub domains: [[Hub/Domain Playbooks]]

---

## How to orient quickly

1. Read [[README]] at vault root for the code + docs model.
2. Read the repo-specific high-level overview:
   - [[Frontend/High Level Overview]]
   - [[Backend/High Level Overview]]
   - [[Tablet/High Level Overview]]
   - [[Hub/High Level Overview]]
3. Read the repo-specific agent guide above for "change recipes" and gotchas.
4. Confirm active local run targets before changing behavior:
   - npm workspaces and dev scripts run from the **vault root** (`npm install`, `npm run dev`, or `npx heylo` — see `README.md` *Local development* or [[Dev Environment Setup]])
   - frontend usually on `localhost:3000`
   - backend usually on `localhost:4000`
   - Go/AppSync resolver is separate from the Nest API
   - tablet: `npm run dev:tablet` (Flutter Android — requires Android device or emulator)
5. Optional deeper pass across all three repos: [[04-21-26 - Codebase Audit – Full Stack Architecture Review]] (`_Notes/April/`).

---

## Ground rules for safer changes

- Make the smallest change that fixes the request.
- Keep frontend and backend contracts aligned (DTO fields, enum values, event names).
- If changing auth/roles/routes, update both behavior and docs.
- If changing anything realtime, verify both emitters and consumers.
- Add or update notes in `_Engineering/` when architectural behavior changes.

---

## Cross-repo architecture in one minute

- `frontend/` is Next.js App Router and talks to backend over cookie-authenticated HTTP.
- `backend/` is NestJS + MySQL and handles core API, auth, realtime fanout, and integrations.
- `go/backend/appsync/` is a focused GraphQL resolver Lambda path for heavier reads (currently caseload schedule).
- `tablet/` is a Flutter Android kiosk app for residents — video calls, chat, device management. Talks to the same NestJS backend over REST + WebSocket.
- `hub/` is a Yocto 5.2 embedded Linux build system for the Raspberry Pi 5 Hub device — MQTT, Home Assistant, Zigbee/Z-Wave bridges, camera streaming, AWS IoT/SSM/CloudWatch, Mender OTA.
- The same product surface spans all repos, so changes often need at least a sanity check in two or more.

---

## Common multi-repo tasks

### Add a new screen with data

1. Add/adjust backend endpoint and DTO.
2. Add/adjust frontend service method.
3. Wire page/component UI.
4. Validate role gating in middleware/sidebar.
5. Update docs in the relevant `_Engineering/*` note.

### Add or change a realtime event

1. Backend: emit a clear event shape.
2. Frontend: ensure `SocketProvider` and `EventHub` path handles it.
3. Verify toast/audio/notification behavior does not regress.
4. Document event contract changes in `_Engineering/Backend/` and `_Engineering/Frontend/`.

### Move a read path to GraphQL/AppSync

1. Define/extend GraphQL schema in `go/backend/appsync/schema.graphql`.
2. Implement resolver/query in Go `platformdb` + handler switch.
3. Replace fixture/REST usage in frontend service with the new path.
4. Keep fallback behavior explicit while migrating.

