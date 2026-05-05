---
type: guide
tags: [cli, dev-environment, agents]
owner: Mike
updated: 2026-05-05
status: current
---
# CLI - Agent Work Guide

This guide is optimized for agents making changes in `cli/`, especially the `heylo` local dev launcher.

Use with [[Agent Verification Matrix]] and root `README.md`.

---

## What the CLI owns

- `npx heylo` local service picker.
- Local/cloud routing for API, web, and AppSync Go services.
- Environment overlay behavior for `.env`, `.env.dev`, and `.env.local`.
- AppSync local runner orchestration.

---

## High-signal files to read first

- `cli/README.md` - human-facing CLI behavior and examples.
- `cli/dev-services.mjs` - service picker, flags, environment overlays, and routing table.
- `cli/appsync-local-dev.mjs` - local AppSync Go runner.
- `package.json` at the vault root - npm scripts and `heylo` bin mapping.
- `.env.example`, `.env.dev.example`, `.env.local.example` - documented env shape, if relevant.

---

## Fast change recipes

### Add or change a service option

1. Update service definitions in `cli/dev-services.mjs`.
2. Update routing output so humans can see what is local vs cloud.
3. Update `cli/README.md` usage examples.
4. Update root `README.md` if the public command changes.
5. Verify help output with `node cli/dev-services.mjs --help`.

### Change environment behavior

1. Confirm whether the change affects `.env`, `.env.dev`, `.env.local`, or generated overrides.
2. Keep cloud-vs-local routing explicit in printed output.
3. Do not add environment variables without documenting them.
4. Avoid hidden defaults that make dev, local, and cloud targets ambiguous.

### Change AppSync local runner

1. Read `go/backend/appsync/schema.graphql` and resolver entrypoints if behavior changes.
2. Update `cli/appsync-local-dev.mjs`.
3. Verify with `npm run dev:go:once` when practical.
4. Coordinate frontend GraphQL endpoint behavior if routing changes.

---

## Guard rails

- Do not start duplicate long-running dev servers if they are already running.
- Do not print secrets or full credentials in routing/debug output.
- Do not change env file precedence without updating docs.
- Do not make interactive-only behavior mandatory for CI/non-interactive shells.
- Keep `--help` accurate whenever flags or service IDs change.

---

## Done checklist

- `cli/README.md` matches implemented flags and service IDs.
- Root `package.json` scripts still point to the right CLI entrypoints.
- Help output was checked with `node cli/dev-services.mjs --help`.
- Non-interactive usage still works for CI or scripted flows.
- AppSync runner changes were checked with `npm run dev:go:once` when possible.
- No secrets are printed in CLI output.
