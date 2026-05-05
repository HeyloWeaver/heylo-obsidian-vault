---
type: guide
tags: [engineering, agents, tools, mcp, commands, skills]
owner: Mike
updated: 2026-05-05
status: current
---
# Agent Tools

This page indexes the tools, commands, and skills that agents can use while working in the Heylo vault. Use with [[Agent Operating Loop]] and [[Agent Verification Matrix]].

---

## Cursor tools

- Use file read/edit tools for source and Markdown changes.
- Use `rg` for exact search across code and docs.
- Use semantic/codebase exploration for broad "how does this work?" questions.
- Use browser automation for frontend behavior, route, and visual verification.
- Use shell commands for package scripts, tests, builds, Git, and local dev processes.
- Use read-only subagents for broad codebase exploration when the scope is large.

Before running a long-lived dev server, check whether it is already running. Do not start duplicate API/web/watch processes unless the user asked for an isolated run.

---

## Shell and local processes

Use shell commands for:

- package scripts from `package.json`
- tests, builds, formatters, and code generators
- Git status/diff/log operations
- local dev service startup through `npm run dev:*` or `npx heylo`

Avoid shell for reading, writing, or searching files when the agent environment provides dedicated file and search tools.

---

## MCP

The vault can be exposed through Obsidian MCP. Prefer MCP or direct file reads for targeted vault context instead of re-explaining material that already lives in `_Engineering/`.

Good MCP use cases:

- search notes for a subsystem name
- fetch a linked design or runbook
- inspect backlinks for a product area
- pull durable context into the current coding task

If a tool schema is required before calling an MCP tool, read it first.

---

## Claude Code

Backend command index: [[Backend/Commands/Commands]]

| Command | Purpose |
|---|---|
| `/smoke-events` | Query smoke / CO alarm events from CloudWatch |
| `/device-logs` | Search device ingestion CloudWatch logs |
| `/camera-registry` | Query camera registry events from CloudWatch |
| `/deploy-lambda` | Deploy a lambda to dev or prod |
| `/code-review` | Review a PR or branch for project-specific rules |
| `/weekly-update` | Generate a weekly summary across repos |

Hub command index: [[Hub/Commands/Commands]]

| Command | Purpose |
|---|---|
| `/hub-mqtt` | MQTT topic quick reference for Hub debugging |

Treat deploy, cloud, and production-adjacent commands as operations that need explicit user intent.

Hub skills: [[Hub/Skills/Skills]]

| Skill | Purpose |
|---|---|
| `hub-logs` | Fetch and analyze CloudWatch logs for a hub |

Tablet skills: [[Tablet/Skills/Skills]]

| Skill | Purpose |
|---|---|
| `tablet-logs` | Fetch and analyze tablet logs |
| `release-build` | Build a signed tablet release APK |

Skills are useful when the workflow is repeatable and operationally risky enough to deserve a checklist.

---

## Browser verification

Use browser automation when a change affects:

- `frontend/` routes or components
- `customer-onboarding/` pages
- `inventory/` pages
- auth redirects or role-gated navigation
- loading, empty, error, modal, or form behavior

Workflow:

1. Start the required app locally.
2. Navigate directly to the affected route.
3. Inspect the page structure before interacting.
4. Make one deliberate interaction at a time.
5. Re-check the page after navigation, form submission, modal open/close, or lazy-loaded content.

If login, MFA, missing seed data, device hardware, or a destructive confirmation blocks progress, stop and report the blocker.

---

## Tool choice rules

- Exact symbol or literal: use `rg`.
- Known file: read the file directly.
- Unknown subsystem: use semantic search or a read-only explore subagent.
- Multi-file implementation: gather context first, then edit.
- Generated outputs: run the generator/formatter instead of hand-editing generated files.
- Review request: use [[Code Review Guide]] and report findings before summary.
