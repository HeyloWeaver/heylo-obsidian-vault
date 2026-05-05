---
type: guide
tags: [engineering, agents, verification]
owner: Mike
updated: 2026-05-05
status: current
---
# Agent Verification Matrix

Use this matrix to pick the narrowest useful checks after a code change. Run commands from the vault root unless the row says otherwise.

Do not run destructive, deploy, migration, or hardware commands against shared/live environments unless the user explicitly asks.

---

## Root workspace

| Surface | Common command | Use when |
|---|---|---|
| Start API + web | `npm run dev` | Manual full-stack browser verification |
| Pick local services | `npx heylo` or `npm run dev:services` | You need API, web, or Go local in a specific combination |
| Local DB migration | `npm run db:migrate:local` | Applying new backend migrations to local Docker MySQL |
| Show local migrations | `npm run db:migrate:show:local` | Checking migration state without changing schema |
| Revert local migration | `npm run db:revert:local` | Reverting only a local migration you just applied |

The `:dev` migration scripts target cloud dev. Treat them as shared-environment operations and ask before running.

---

## Frontend - `frontend/`

| Check | Command | Notes |
|---|---|---|
| Lint | `npm run lint -w heylo-web` | Use after component, hook, service, model, or route changes |
| Production build | `npm run build -w heylo-web` | Use for route, data contract, App Router, or shared provider changes |
| Dev server | `npm run dev:web` | Use for manual browser checks at `localhost:3000` |

If `next lint` is unavailable or broken for the installed Next.js version, report that clearly and use `npm run build -w heylo-web` plus IDE diagnostics as the fallback static check.

For UI changes, inspect the actual page state in browser when possible. Check loading, empty, error, and role-gated states for affected routes.

---

## Backend - `backend/`

| Check | Command | Notes |
|---|---|---|
| Lint | `npm run lint -w heylo-api` | Use after service, controller, DTO, entity, or migration changes |
| Unit/integration tests | `npm run test -w heylo-api` | Broad Jest run |
| Targeted Jest | `npm run test -w heylo-api -- <pattern>` | Prefer for focused service/domain changes |
| Build | `npm run build -w heylo-api` | Use after module graph, decorator, DTO, or entity changes |
| Local migration show | `npm run db:migrate:show:local` | Confirm pending migrations before applying |
| Local migration run | `npm run db:migrate:local` | Only against local Docker MySQL |

For auth, role, tenancy, realtime, and DB changes, verify producer and consumer behavior, not just compilation.

---

## Go/AppSync - `go/backend/appsync/`

| Check | Command | Notes |
|---|---|---|
| Local runner once | `npm run dev:go:once` | Compiles/runs the local AppSync resolver once |
| Local runner watch | `npm run dev:go` | Use during manual frontend/AppSync testing |
| Go tests | `go test ./...` from `go/backend/appsync/` | Use after resolver, schema, auth, or platformdb changes |

When changing GraphQL schema or resolver output, verify the frontend service/model consuming the field.

---

## Customer Onboarding - `customer-onboarding/`

| Check | Command | Notes |
|---|---|---|
| Lint | `npm run lint -w customer-onboarding` | Use after any app source change |
| Build | `npm run build -w customer-onboarding` | Type-checks and builds production output |
| Dev server | `npm run dev:onboarding` | Manual browser verification |

Pages own network requests. Components and Zustand stores should not fetch directly.

---

## Inventory - `inventory/`

| Check | Command | Notes |
|---|---|---|
| Lint | `npm run lint -w inventory` | Use after any app source change |
| Build | `npm run build -w inventory` | Type-checks and builds production output |
| Dev server | `npm run dev:inventory` | Manual browser verification |

For inventory backend changes, also run the relevant backend check. Favor one joined backend query over frontend waterfalls.

---

## Tablet - `tablet/`

Run Flutter commands from `tablet/`.

| Check | Command | Notes |
|---|---|---|
| Analyze | `flutter analyze` | Use after Dart changes |
| Tests | `flutter test` | Use when tests exist for changed behavior |
| Codegen | `flutter pub run build_runner build --delete-conflicting-outputs` | Required after `@JsonSerializable` model changes |
| Dev run | `npm run dev:tablet` from root | Uses the dev flavor |

Kiosk, native Android, install, and OTA behavior should be verified on a real device when possible.

---

## Hub - `hub/`

Run commands from `hub/`.

| Check | Command | Notes |
|---|---|---|
| Full build | `./build.sh` | Expensive Yocto build; run when recipe/image changes require it |
| Export artifacts | `./export.sh` | After successful build |
| Release artifact upload | `./upload-hub-update.sh` | Deployment operation; ask before running |

For Hub work, prefer static inspection and targeted script checks first. Full builds can take hours and require large disk/cache setup.

---

## CLI - `cli/`

| Check | Command | Notes |
|---|---|---|
| Help output | `node cli/dev-services.mjs --help` | Use after CLI flag/help changes |
| Non-interactive start smoke | `node cli/dev-services.mjs --help` plus targeted argument parsing review | Avoid starting duplicate dev servers unless needed |
| AppSync local runner | `npm run dev:go:once` | Use after `cli/appsync-local-dev.mjs` changes |

Before starting dev servers, check whether one is already running in the IDE terminal state.

---

## Infrastructure - `heylo-infra/`

Only run Terraform commands from the relevant infra directory and only after confirming the target workspace/account.

| Check | Command | Notes |
|---|---|---|
| Format | `terraform fmt -recursive` | Safe formatting check/edit for touched Terraform |
| Validate | `terraform validate` | Requires initialized providers |
| Plan | `terraform plan` | Shared-environment operation; confirm target first |
| Apply | `terraform apply` | Never run unless explicitly requested |
