# Heylo — agent and editor context

This repository root is the **Heylo engineering Obsidian vault**: product and architecture notes live next to real code trees so humans (and tools) can jump between explanation and implementation. Treat this file as the default onboarding for **Cursor**, **Claude Code**, and other coding agents.

---

## Obsidian and vault layout

- **Obsidian** indexes this folder as a vault (see `.obsidian/`). Notes use **`[[wikilinks]]`** to cross-link; in Cursor or the terminal, resolve those to paths under this repo (for example `[[Frontend/Agent Work Guide]]` → `_Engineering/Frontend/Agent Work Guide.md`).
- **Leading underscore = Markdown notes** (safe to edit in Obsidian): `_Engineering/`, `_Onboarding/`, `_Notes/`, `_Standups/`, `_Plans/`, etc.
- **No leading underscore = code** (`frontend/`, `backend/`, `go/`): edit in your IDE (Cursor, VS Code). Do not rely on Obsidian for lint/format/build; avoid changing application code only inside Obsidian if your workflow does not run the same toolchain as the repo.
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
| `package.json` (vault root) | npm workspaces `frontend` + `backend`; dev scripts; `heylo` bin → `dev-services.mjs` |
| `dev-services.mjs` | Local dev service picker (`npx heylo`) |

`frontend/`, `backend/`, and `go/` may each be their own Git checkout in addition to any parent vault remote—when in doubt, run Git commands from the directory you intend to ship.

---

## Sub-repos and responsibilities

- **`frontend/`** — Next.js App Router, React, Tailwind, operator UI. Cookie-auth HTTP to the API, global WebSocket client. Typical local URL: `http://localhost:3000`.
- **`backend/`** — NestJS + TypeORM + MySQL: core API, auth/session, WebSocket fanout, integrations. Typical local URL: `http://localhost:4000`.
- **`go/backend/appsync/`** — AppSync GraphQL resolvers in Go (e.g. caseload schedule). Separate deploy path from Nest; shares MySQL domain data.
- **`tablet/`** — Flutter (Dart) Android kiosk app for resident-facing tablets. Talks to the same NestJS backend over REST + WebSocket. Runs in two flavors: `dev` (hits `dev-api.heylo.tech`) and `prod`. Local dev: `flutter run --flavor dev -t lib/main.dart`.

Cross-cutting features often touch **two or three** of these; keep DTOs, enums, event names, and role rules aligned.

---

## Agent work flow (what to read, in order)

Use this sequence before large or ambiguous tasks:

1. **`_Engineering/Agent Work - Start Here.md`** — handoff hub, ground rules, common multi-repo recipes.
2. **Repo-specific agent guide** (pick one or more by area):
   - `_Engineering/Frontend/Agent Work Guide.md`
   - `_Engineering/Backend/Agent Work Guide.md`
   - `_Engineering/Go/Agent Work Guide.md`
   - `_Engineering/Tablet/Agent Work Guide.md`
3. **High-level overview** for depth when the task is broad:
   - `_Engineering/Frontend/High Level Overview.md`
   - `_Engineering/Backend/High Level Overview.md`
   - `_Engineering/Tablet/High Level Overview.md`
4. **Domain playbooks** for subsystem entry points:
   - `_Engineering/Frontend/Domain Playbooks.md`
   - `_Engineering/Backend/Domain Playbooks.md`
   - `_Engineering/Go/Domain Playbooks.md`
   - `_Engineering/Tablet/Domain Playbooks.md`

**Ground rules** (from the handoff doc): smallest change that solves the problem; align frontend/backend contracts; auth and realtime changes need explicit consumer/producer checks; document non-obvious architectural shifts in `_Engineering/`.

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

The root **`package.json`** (package name **`heylo`**) workspaces **`frontend`** and **`backend`**. Run **`npm install`** and scripts from the vault root; local **`.env`** lives next to **`package.json`** (see **`.env.example`**) and scripts load it with `dotenv -e .env`.

- **Both services:** `npm run dev`
- **Pick services:** `npm run dev:services` or `npx heylo` — `npx heylo --help` for flags.

Ensure **`.env`** exists (copy from **`.env.example`**). AppSync/Go has its own build and deploy path under `go/backend/appsync/`.

---

## Plans and one-off docs

- **`_Plans/`** — initiative and redesign writeups; good attach targets for feature work.
- Vault **`README.md`** — canonical description of the underscore vs non-underscore convention and vault hygiene.

If anything here disagrees with `_Engineering/Agent Work - Start Here.md` or root `README.md`, prefer those sources and then update this file to match.
