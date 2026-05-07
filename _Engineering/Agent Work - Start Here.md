---
type: guide
tags: [engineering, agents, backend, frontend, go, tablet, hub, onboarding, inventory, customer-support]
owner: Mike
updated: 2026-05-07
status: current
---
# Agent Work - Start Here

This is the routing page for agents working in Heylo. Use it to decide which repo-specific context to read, which code areas are likely involved, and which cross-repo checks to make before shipping.

The goal is focused context, not a giant preload. Read this page first, then open only the guides and source files for the region you are touching.

Use [[Agent Operating Loop]] for the standard orient, explore, plan, edit, verify, report workflow. Use [[Agent Verification Matrix]] for repo-specific checks and [[Agent Tools]] for commands, skills, MCP, browser testing, and subagent guidance.

---

## Context Routing

| If the work is about... | Start with | Then read / inspect |
| --- | --- | --- |
| Operator console UI, pages, components, frontend services | [[Frontend/Agent Work Guide]] | [[Frontend/Domain Playbooks]], relevant `frontend/app/**`, `frontend/components/**`, `frontend/services/**` |
| API endpoints, auth, roles, realtime fanout, integrations, DB writes | [[Backend/Agent Work Guide]] | [[Backend/Domain Playbooks]], relevant `backend/src/**`, DTOs, entities, migrations |
| Data-heavy schedule/read paths exposed through AppSync | [[Go/Agent Work Guide]] | [[Go/Domain Playbooks]], `go/backend/appsync/schema.graphql`, resolver and `platformdb` code, matching frontend service |
| Resident-facing tablet behavior | [[Tablet/Agent Work Guide]] | [[Tablet/Domain Playbooks]], Flutter routes/services, matching backend REST/WebSocket contracts |
| Hub OS, provisioning, OTA, systemd services, MQTT/HA/Zigbee/Z-Wave | [[Hub/Agent Work Guide]] | [[Hub/Domain Playbooks]], `hub/README.md`, `_Engineering/Devices/**`, relevant `hub/meta-heylo/**` |
| Customer onboarding app | [[Customer Onboarding/Agent Work Guide]] + [[Backend/Agent Work Guide]] if API changes | `customer-onboarding/**`, backend `CustomerOnboarding*` controller/service/entity paths |
| Inventory tracking app | [[Inventory/Agent Work Guide]] + [[Backend/Agent Work Guide]] if API/DB changes | `inventory/**`, backend inventory controllers/services/entities/migrations |
| Customer support app (boilerplate, scope TBD) | [[Customer Support/Agent Work Guide]] | `customer-support/**` |
| Dev scripts, local orchestration, workspace plumbing | [[CLI/Agent Work Guide]] + `README.md` | `package.json`, `cli/README.md`, `cli/**`, [[Dev Environment Setup]] |
| Terraform / AWS infrastructure | [[Infra/Agent Work Guide]] + relevant plan/spec | `heylo-infra/**`; confirm intent before applying infrastructure changes |

Reviewing code (or self-reviewing before opening a PR): [[Code Review Guide]]

Use domain playbooks once you know the repo:

- Frontend domains: [[Frontend/Domain Playbooks]]
- Backend domains: [[Backend/Domain Playbooks]]
- Go domains: [[Go/Domain Playbooks]]
- Tablet domains: [[Tablet/Domain Playbooks]]
- Hub domains: [[Hub/Domain Playbooks]]

Agent execution references:

- Operating loop: [[Agent Operating Loop]]
- Verification commands: [[Agent Verification Matrix]]
- Tools, commands, skills, MCP: [[Agent Tools]]
- Review posture: [[Code Review Guide]]

---

## How to orient quickly

1. Identify the product surface and repo(s) from **Context Routing** above.
2. Read the repo-specific agent guide for coding conventions, change recipes, and gotchas.
3. If the task is broad or unfamiliar, read the repo-specific high-level overview:
   - [[Frontend/High Level Overview]]
   - [[Backend/High Level Overview]]
   - [[Go/High Level Overview]]
   - [[Tablet/High Level Overview]]
   - [[Hub/High Level Overview]]
4. Open the specific source files in the touched region. Prefer current code over old notes when they disagree.
5. Confirm active local run targets before changing behavior:
   - npm workspaces and dev scripts run from the **vault root** (`npm install`, `npm run dev`, or `npx heylo` — see `README.md` *Local development* or [[Dev Environment Setup]])
   - frontend usually on `localhost:3000`
   - backend usually on `localhost:4000`
   - Go/AppSync resolver is separate from the Nest API; use `npm run dev:go` for the local runner
   - tablet: run Flutter directly from `tablet/` (`flutter run --flavor dev -t lib/main.dart` or `flutter run --flavor local -t lib/main.dart`; requires Android device or emulator)
   - onboarding/inventory/support: `npm run dev:onboarding`, `npm run dev:inventory`, or `npm run dev:support`
6. Use [[Agent Verification Matrix]] to choose checks before declaring the work complete.
7. Optional historical architecture audit for extra context: [[04-21-26 - Codebase Audit – Full Stack Architecture Review]] (`_Notes/April/`). Treat it as supplementary context, not current policy.

---

## Ground rules for safer changes

- Make the smallest change that fixes the request.
- Keep contracts aligned across every consumer you touch (DTO fields, enum values, event names, GraphQL schema, device payloads).
- If changing auth/roles/routes, update both behavior and docs.
- If changing anything realtime, verify both emitters and consumers.
- If changing persisted data, migrations, or query shape, verify local DB safety and backend conventions before running commands.
- Add or update notes in `_Engineering/` when architectural behavior changes.

---

## Cross-repo architecture in one minute

- `frontend/` is Next.js App Router and talks to backend over cookie-authenticated HTTP.
- `backend/` is NestJS + MySQL and handles core API, auth, realtime fanout, and integrations.
- `go/backend/appsync/` is a focused GraphQL resolver Lambda path for heavier reads (currently caseload schedule).
- `tablet/` is a Flutter Android kiosk app for residents — video calls, chat, device management. Talks to the same NestJS backend over REST + WebSocket.
- `hub/` is a Yocto 5.2 embedded Linux build system for the Raspberry Pi 5 Hub device — MQTT, Home Assistant, Zigbee/Z-Wave bridges, camera streaming, AWS IoT/SSM/CloudWatch, Mender OTA.
- `customer-onboarding/` and `inventory/` are separate Vite apps with backend counterparts in Nest.
- `customer-support/` is a new Vite app (boilerplate; scope, contracts, and workspace wiring still TBD).
- The same product surface spans all repos, so changes often need at least a sanity check in two or more.

---

## Common multi-repo tasks

### Add a new screen with data

1. Add/adjust backend endpoint and DTO.
2. Add/adjust frontend service method.
3. Wire page/component UI.
4. Validate role gating in middleware/sidebar.
5. Update docs in the relevant `_Engineering/*` note.

### Change an API contract

1. Find all consumers first: frontend services/components, tablet calls, Go/AppSync schema/resolvers, and any onboarding/inventory clients.
2. Update DTO/model names consistently; prefer enum/constant references over literals.
3. Keep mutation responses small (`{ id }`) unless the existing contract requires otherwise.
4. Re-fetch affected frontend data after mutations instead of adding optimistic client-state patches.
5. Run the narrowest useful typecheck/test on each touched consumer.

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

### Change database shape or migrations

1. Read [[Backend/Agent Work Guide]] database conventions before editing entities or migrations.
2. Use local DB settings for migration commands; do not run migrations/scripts against shared or live databases.
3. Keep timestamp columns DB-managed and avoid ORM cascade behavior.
4. For reads, prefer raw SQL through `repository.manager.query()` and parse `COUNT()` results.
5. Check every code path that writes the changed columns inside the same transaction boundary.

### Change device or hardware behavior

1. Determine whether the behavior lives in backend cloud contracts, tablet app, Hub OS, or `_Engineering/Devices/` docs.
2. Check provisioning/event payload contracts before editing device-facing code.
3. Validate both producer and consumer for MQTT/WebSocket/REST payload changes.
4. Update the relevant device, tablet, hub, backend, or frontend note when the durable contract changes.

