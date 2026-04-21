# Heylo Engineering Vault

This repository is Heylo’s **Obsidian vault** — the single place where **code** and **context** live side by side. It is **also** the **git workspace** (multiple real repos and Markdown in one tree on disk) so **docs, AI coding agents, and code stay aligned**. Architecture notes, onboarding, standups, and device knowledge sit next to `frontend/`, `backend/`, and `go/` as first-class paths — agents and humans get **clear instructions, stable links, and direct visibility into the same files the repo uses**, not a parallel copy of the truth.

**Obsidian** gives the vault search, `[[wikilinks]]`, and graphing on top of that layout; editors and agents use the **same paths**. The broader goal is **one vault/workspace where documentation and code evolve together**, with agent-facing entry points so tools always know where to look and what to run.

We also use **Obsidian as an MCP** ([Model Context Protocol](https://modelcontextprotocol.io/)) server so agents can **pull live vault context** (notes, links, structure) while they work on the repos. That closes a **feedback loop**: agents ground themselves in durable docs, changes ship in the codebase, and new reasoning gets written back into the vault — each pass makes the next one better. Together, the vault and the codebase act as a **recursively learning brain**: each cycle of agent work, commits, and note updates tightens the map between intent and implementation, with git keeping the whole thing auditable.

**Coding agents (Cursor, Claude Code, etc.):** use **`AGENTS.md`** at the **vault root** (same folder as the git workspace root) for layout, sub-repo map, agent handoff order, and how to attach context. **`CLAUDE.md`** is a shorter Claude-oriented summary that points back to `AGENTS.md`.

## How the vault is organized

The vault is the git workspace: one tree on disk. It uses a naming convention to separate **documentation** from **code** (works the same in git, Obsidian, and agent context):

- **Folders with a leading underscore** (`_Engineering/`, `_Notes/`, `_Onboarding/`, `_Standups/`) are Obsidian notes. Edit them like any Markdown file — they're meant to be linked, back-linked, and graphed.
- **Folders without an underscore** (`frontend/`, `backend/`, `go/`) are real code repositories. Edit them in your editor or via agents; use Obsidian for **read/search/link** on notes and code paths — the vault (git workspace) stays the single source of truth on disk.

```
vault root (= git workspace root)
├── README.md                ← you are here
├── _Engineering/            ← architecture, design, per-subsystem deep-dives
├── _Plans/                  ← initiative / redesign plans
├── _Notes/                  ← personal scratch, dev environment notes
├── _Onboarding/             ← first-day notes, points of contact, ramp-up guides
├── _Standups/               ← daily/weekly standup logs
├── frontend/                ← Next.js 15 / React 19 console (real repo)
├── backend/                 ← NestJS 11 / TypeORM API (real repo)
├── go/                      ← Go services (currently: AppSync resolvers)
├── package.json             ← npm workspaces (`frontend`, `backend`) + dev scripts
├── dev-services.mjs         ← `heylo` CLI (service picker)
```

## What each code repo does

- **`frontend/`** — the operator-facing web console. Next.js 15 App Router, React 19, Tailwind v4, shadcn/ui. Renders caseload, alerts, analytics, video calls, and site/device management. Connects to the backend over HTTPS cookies and a single global WebSocket. Deep-dive: `_Engineering/Frontend/High Level Overview.md`.
- **`backend/`** — the core API. NestJS 11 on Node 22 with TypeORM + MySQL. Serves the frontend, handles auth via AWS Cognito, drives real-time updates through API Gateway WebSockets, and orchestrates device/IoT events, video calls (Daily.co), email, and multi-tenant agency state. Deep-dive: `_Engineering/Backend/High Level Overview.md`.
- **`go/backend/appsync/`** — Go Lambdas behind AWS AppSync (GraphQL) for data-heavy reads like caseload schedule resolution. Separate from the NestJS API on purpose; talks to the same MySQL.

Hardware/device knowledge — hubs, firmware, provisioning, payload samples — lives under `_Engineering/Devices/`.

## Local development (terminal)

npm workspaces and dev scripts live at the **vault root** — the same directory as the **git workspace root** (`package.json` lists `frontend` and `backend`). The **`heylo`** CLI there is the supported way to **orchestrate** which Node services to run without juggling one-off commands.

1. Ensure **`.env`** exists at the vault root (copy from **`.env.example`**).
2. Run **`npm install`** once from the vault root. That links **`heylo-web`** and **`heylo-api`** and installs shared tooling (`concurrently`, `dotenv-cli`, `prompts`, …).

**npm scripts** (from the vault root)

| Command | What it runs |
|--------|----------------|
| `npm run dev` | API and web together (loads **`.env`** via `dotenv-cli`) |
| `npm run dev:api` | Nest API only (`heylo-api`) |
| `npm run dev:web` | Next console only (`heylo-web`) |

**`heylo` CLI** (`dev-services.mjs`, exposed as the `heylo` npm bin in `package.json`) — pick which Node services to start without memorizing script names. It wraps the same `dev:api` / `dev:web` behavior.

| Command | What it does |
|--------|----------------|
| `npx heylo` | Interactive multiselect when stdin is a TTY |
| `npx heylo api` / `web` | Start one service |
| `npx heylo web api` | Start both (any order) |
| `npx heylo --all` | Start every configured service |
| `npm run dev:services` | Same as `node dev-services.mjs` (pass extra args after `--`, e.g. `npm run dev:services -- api`) |

Run **`npx heylo --help`** for the full flag list. In CI or other non-interactive shells, pass **`api`**, **`web`**, or **`--all`** explicitly.

**Note:** the Go AppSync resolver under `go/backend/appsync/` has its own build and deploy flow; it is not started by `npm run dev` or `heylo` today.

AWS profiles, backend `development.env`, and copy-paste frontend env for Cognito are documented in **`_Engineering/Dev Environment Setup.md`**.

## Working in Obsidian

A few conventions that make the vault pleasant to use — the same paths apply in git and in agents:

- **MCP** — if your agent stack has the Obsidian MCP server enabled, prefer it for **targeted vault reads** (search, file content, backlinks) instead of re-explaining context that already lives in `_Engineering/` and friends. What you capture in notes becomes what the next session can fetch first.
- **Follow `[[wikilinks]]`** — notes link to each other and to files inside the code repos. Ctrl/Cmd-click opens the target.
- **Graph view** (Ctrl/Cmd-G) is useful for seeing how a subsystem's notes relate to its code.
- **Search** (Ctrl/Cmd-Shift-F) searches notes *and* code at once — great for "where do we use X?" without switching roots.
- **Don't edit code files from Obsidian** if you rely on formatters and language servers — use Cursor/VS Code (or agents) for code; keep Obsidian for notes and navigation.
- **Underscore prefix = note, no prefix = code.** If you're creating a new top-level folder, follow the pattern.

## If you're new here

Start with `_Onboarding/Heylo Onboarding.md` and `_Onboarding/Points of Contact.md`, then set up your machine using `_Engineering/Dev Environment Setup.md`, then read the two high-level overviews:

- `_Engineering/Frontend/High Level Overview.md`
- `_Engineering/Backend/High Level Overview.md`

After that, `_Engineering/Heylo Prod & Eng.md` gives the wider product + engineering context, and `_Engineering/Devices/` covers the hardware side.

## Keeping this vault healthy

- When you learn something non-obvious about a subsystem, write it into the relevant note under `_Engineering/` rather than leaving it in a PR description or Slack thread.
- Architecture notes should link to the specific files in the code repos they describe — that keeps agents and humans pointed at the same paths as git.
- The overviews under `_Engineering/Frontend/` and `_Engineering/Backend/` are living documents. If you change a foundational piece of either repo, update the overview in the same PR.
