# Heylo Engineering Vault

This Obsidian vault is the single place where Heylo's **code** and **context** live side-by-side. The code repositories are mirrored in as real folders, and everything else — architecture notes, onboarding docs, standups, device/hardware knowledge — is written as regular Markdown notes that Obsidian can link, search, and graph across.

The intent is simple: when you're reading a note about the backend, you can jump straight into the backend code without leaving Obsidian; when you're reading the code, you can jump straight into the note that explains why it exists.

## How the vault is organized

The vault uses a naming convention to separate "notes" from "code":

- **Folders with a leading underscore** (`_Engineering/`, `_Notes/`, `_Onboarding/`, `_Standups/`) are Obsidian notes. Edit them like any Markdown file — they're meant to be linked, back-linked, and graphed.
- **Folders without an underscore** (`frontend/`, `backend/`, `go/`) are real code repositories. Treat them as read-only from Obsidian's perspective — edit code in your actual editor (VS Code, Cursor, etc.) and let Obsidian index the files for search and linking.

```
vault root
├── README.md                ← you are here
├── _Engineering/            ← architecture, design, per-subsystem deep-dives
├── _Notes/                  ← personal scratch, dev environment notes
├── _Onboarding/             ← first-day notes, points of contact, ramp-up guides
├── _Standups/               ← daily/weekly standup logs
├── frontend/                ← Next.js 15 / React 19 console (real repo)
├── backend/                 ← NestJS 10 / TypeORM API (real repo)
└── go/                      ← Go services (currently: AppSync resolvers)
└── ...etc
```

## What each code repo does

- **`frontend/`** — the operator-facing web console. Next.js 15 App Router, React 19, Tailwind v4, shadcn/ui. Renders caseload, alerts, analytics, video calls, and site/device management. Connects to the backend over HTTPS cookies and a single global WebSocket. Deep-dive: `_Engineering/Frontend/High Level Overview.md`.
- **`backend/`** — the core API. NestJS 10 on Node 22 with TypeORM + MySQL. Serves the frontend, handles auth via AWS Cognito, drives real-time updates through API Gateway WebSockets, and orchestrates device/IoT events, video calls (Daily.co), email, and multi-tenant agency state. Deep-dive: `_Engineering/Backend/High Level Overview.md`.
- **`go/backend/appsync/`** — Go Lambdas behind AWS AppSync (GraphQL) for data-heavy reads like caseload schedule resolution. Separate from the NestJS API on purpose; talks to the same MySQL.

Hardware/device knowledge — hubs, firmware, provisioning, payload samples — lives under `_Engineering/Devices/`.

## Working in Obsidian

A few conventions that make the vault pleasant to use:

- **Follow `[[wikilinks]]`** — notes link to each other and to files inside the code repos. Ctrl/Cmd-click opens the target.
- **Graph view** (Ctrl/Cmd-G) is useful for seeing how a subsystem's notes relate to its code.
- **Search** (Ctrl/Cmd-Shift-F) searches notes *and* code at once — great for "where do we use X?" queries without leaving Obsidian.
- **Don't edit code files from Obsidian.** Obsidian doesn't know about ESLint, Prettier, or build tooling. Open the repo in your real editor.
- **Underscore prefix = note, no prefix = code.** If you're creating a new top-level folder, follow the pattern.

## If you're new here

Start with `_Onboarding/Heylo Onboarding.md` and `_Onboarding/Points of Contanct.md`, then read the two high-level overviews:

- `_Engineering/Frontend/High Level Overview.md`
- `_Engineering/Backend/High Level Overview.md`

After that, `_Engineering/Heylo Prod & Eng.md` gives the wider product + engineering context, and `_Engineering/Devices/` covers the hardware side.

## Keeping this vault healthy

- When you learn something non-obvious about a subsystem, write it into the relevant note under `_Engineering/` rather than leaving it in a PR description or Slack thread.
- Architecture notes should link to the specific files in the code repos they describe — that's the whole point of keeping them in the same vault.
- The overviews under `_Engineering/Frontend/` and `_Engineering/Backend/` are living documents. If you change a foundational piece of either repo, update the overview in the same PR.
