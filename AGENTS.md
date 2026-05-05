# Heylo — agent and editor context

This repository root is the **Heylo engineering Obsidian vault**: product and architecture notes live next to real code trees so humans (and tools) can jump between explanation and implementation. Treat this file as the default onboarding for **Cursor**, **Claude Code**, and other coding agents.

---

## Obsidian and vault layout

- **Obsidian** indexes this folder as a vault (see `.obsidian/`). Notes use **`[[wikilinks]]`** to cross-link; in Cursor or the terminal, resolve those to paths under this repo (for example `[[Frontend/Agent Work Guide]]` → `_Engineering/Frontend/Agent Work Guide.md`).
- **Leading underscore = Markdown notes** (safe to edit in Obsidian): `_Engineering/`, `_Onboarding/`, `_Notes/`, `_Standups/`, `_Plans/`, etc.
- **No leading underscore = code** (`frontend/`, `backend/`, `go/`, `tablet/`, `hub/`): edit in your IDE (Cursor, VS Code). Do not rely on Obsidian for lint/format/build; avoid changing application code only inside Obsidian if your workflow does not run the same toolchain as the repo.
- **Search and graph** in Obsidian span both notes and code; use that for discovery, then implement in the IDE.

High-level tree (not exhaustive):

| Path | Role |
|------|------|
| `README.md` | Human-oriented vault README (code + docs model) |
| `_Engineering/` | Architecture, agent guides, domain playbooks, device notes |
| `_Onboarding/` | Team onboarding |
| `_Plans/` | Design / initiative plans (e.g. feature redesigns) |
| `_Notes/`, `_Standups/` | Scratch and standup logs |
| `frontend/` | Next.js operator console (workspace package `heylo-web`) |
| `backend/` | NestJS API (workspace package `heylo-api`) |
| `go/backend/appsync/` | Go Lambda AppSync resolvers (heavy reads, GraphQL) |
| `tablet/` | Flutter Android kiosk app for resident tablets |
| `hub/` | Yocto Hub OS for Raspberry Pi 5 (Mender OTA, kas, `meta-heylo`); not part of root npm dev |
| `customer-onboarding/` | Vite + React 18 + MUI 7 + Zustand 5 — customer onboarding intake forms (`onboard.heylo.tech`) |
| `inventory/` | Vite + React 18 + MUI 7 + Zustand 5 — internal inventory tracking for hardware/shipments |
| `heylo-infra/` | Terraform — AWS infrastructure (`platform/`, `iot/`, `relational_db/`, `modules/`) |
| `package.json` (vault root) | npm workspaces for the code repos/apps; dev scripts; `heylo` bin → `cli/dev-services.mjs` |
| `cli/` | `heylo` CLI — `dev-services.mjs` (service picker), `appsync-local-dev.mjs` (Go local runner), `README.md` |

`frontend/`, `backend/`, `go/`, `tablet/`, and `hub/` may each be their own Git checkout in addition to any parent vault remote—when in doubt, run Git commands from the directory you intend to ship.

---

## Sub-repos and responsibilities

- **`frontend/`** — Next.js App Router, React, Tailwind, operator UI. Cookie-auth HTTP to the API, global WebSocket client. Typical local URL: `http://localhost:3000`.
- **`backend/`** — NestJS + TypeORM + MySQL: core API, auth/session, WebSocket fanout, integrations. Typical local URL: `http://localhost:4000`.
- **`go/backend/appsync/`** — AppSync GraphQL resolvers in Go (e.g. caseload schedule). Separate deploy path from Nest; shares MySQL domain data.
- **`tablet/`** — Flutter (Dart) Android kiosk app for resident-facing tablets. Talks to the same NestJS backend over REST + WebSocket. Runs in two flavors: `dev` (hits `dev-api.heylo.tech`) and `prod`. Local dev: `flutter run --flavor dev -t lib/main.dart`.
- **`hub/`** — Yocto 5.2 build for Heylo Hub hardware: Raspberry Pi 5 images, Mender OTA, kas + Docker (typically WSL2 + Ubuntu 24.04). Application services and recipes live under `hub/meta-heylo/`. Authoritative build/runbook: `hub/README.md`; agent-oriented notes: `_Engineering/Hub/`.
- **`customer-onboarding/`** — Vite + React 18 + MUI 7 + Zustand 5 app serving `onboard.heylo.tech`. Separate from the main operator console; used for site-administrator self-service onboarding. Backend counterpart: `CustomerOnboardingController` / `CustomerOnboardingService` in `backend/`.
- **`inventory/`** — Vite + React 18 + MUI 7 + Zustand 5 app for Heylo's internal ops team to track physical hardware, purchase orders, inbound shipments, manufactured items, and outbound shipments. Backend counterpart: inventory controllers/services in `backend/`.
- **`heylo-infra/`** — Terraform for all AWS infrastructure. Modules: `platform/` (core AWS), `iot/` (IoT Core, Kinesis streams), `relational_db/` (RDS MySQL), `modules/` (reusable). Changes here affect the live environment; confirm with the team before applying.

Cross-cutting features often touch **two or three** of frontend, backend, Go, and tablet; keep DTOs, enums, event names, and role rules aligned. Hub OS work is mostly self-contained under `hub/` but may need backend or `_Engineering/Devices/` context for provisioning and cloud contracts.

---

## Agent work flow (focused context)

Use this sequence before large or ambiguous tasks. Do not preload every guide; route to the region being touched.

1. **`_Engineering/Agent Work - Start Here.md`** — context routing by product surface, repo ownership, ground rules, and common multi-repo recipes.
2. **Repo-specific agent guide** — pick only the area(s) you will touch:
   - `_Engineering/Frontend/Agent Work Guide.md`
   - `_Engineering/Backend/Agent Work Guide.md`
   - `_Engineering/Go/Agent Work Guide.md`
   - `_Engineering/Tablet/Agent Work Guide.md`
   - `_Engineering/Hub/Agent Work Guide.md`
   - `_Engineering/Customer Onboarding/Agent Work Guide.md`
   - `_Engineering/Inventory/Agent Work Guide.md`
   - `_Engineering/Infra/Agent Work Guide.md`
   - `_Engineering/CLI/Agent Work Guide.md`
3. **Agent execution references**:
   - `_Engineering/Agent Operating Loop.md`: orient, explore, plan, edit, verify, report
   - `_Engineering/Agent Verification Matrix.md`: repo-specific checks and commands
   - `_Engineering/Agent Tools.md`: commands, skills, MCP, browser testing, subagent guidance
4. **High-level overview** for depth when the task is broad:
   - `_Engineering/Frontend/High Level Overview.md`
   - `_Engineering/Backend/High Level Overview.md`
   - `_Engineering/Go/High Level Overview.md`
   - `_Engineering/Tablet/High Level Overview.md`
   - `_Engineering/Hub/High Level Overview.md`
5. **Domain playbooks** for subsystem entry points:
   - `_Engineering/Frontend/Domain Playbooks.md`
   - `_Engineering/Backend/Domain Playbooks.md`
   - `_Engineering/Go/Domain Playbooks.md`
   - `_Engineering/Tablet/Domain Playbooks.md`
   - `_Engineering/Hub/Domain Playbooks.md`

**Ground rules** (from the handoff doc): smallest change that solves the problem; align frontend/backend/tablet/Go contracts; auth, realtime, and device changes need explicit consumer/producer checks; document non-obvious architectural shifts in `_Engineering/`.

---

## How humans should add context for agents

When starting a task in Cursor or Claude, **attach or @-mention** the smallest set of:

- `_Engineering/Agent Work - Start Here.md` plus the **one** repo `Agent Work Guide` that matches the work.
- The **specific code files** you care about (controllers, services, routes, components).
- Any **ticket or spec** (Linear, Notion export, or `_Plans/*.md`) that states acceptance criteria.
- If the behavior spans stacks, say so explicitly and link **both** API and UI sides.

After the task, if behavior changed in a durable way, **update the relevant `_Engineering/` note** in the same change set when practical (see vault `README.md`).

---

## Local development (npm at vault root)

The root **`package.json`** (package name **`heylo`**) defines the workspace apps/repos and dev scripts. Run **`npm install`** and scripts from the vault root. Main dev scripts load **`.env.dev` + `.env`**; local DB migration scripts load **`.env.local` + `.env`**.

- **Both services:** `npm run dev`
- **Pick services:** `npm run dev:services` or `npx heylo` — `npx heylo --help` for flags.
- **Other local targets:** `npm run dev:go`, `npm run dev:tablet`, `npm run dev:onboarding`, `npm run dev:inventory`

Ensure the relevant root env files exist (see `README.md` and `_Engineering/Dev Environment Setup.md`). AppSync/Go has a separate local runner and deploy path under `go/backend/appsync/`. The Hub Yocto tree under `hub/` uses kas/Docker and is not started by `npm run dev` (see `hub/README.md`).

---

## Plans and one-off docs

- **`_Plans/`** — initiative and redesign writeups; good attach targets for feature work.
- Vault **`README.md`** — canonical description of the underscore vs non-underscore convention and vault hygiene.

If anything here disagrees with `_Engineering/Agent Work - Start Here.md` or root `README.md`, prefer those sources and then update this file to match.
