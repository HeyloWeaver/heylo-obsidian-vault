# CLAUDE.md

> Historical scratch note. This is not the canonical agent guide. For current agent instructions, use `AGENTS.md`, `_Engineering/Agent Work - Start Here.md`, and the relevant `_Engineering/*/Agent Work Guide.md`.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Heylo is a multi-repository platform for residential/care facility monitoring and communication. The workspace contains repositories under `Repos/`:

| Repository | Tech Stack | Purpose |
|------------|------------|---------|
| **backend** | NestJS, TypeORM, MySQL | REST API server |
| **frontend** | Next.js 15, React 19, Zustand + Context, Tailwind | Staff dashboard |
| **customer-onboarding** | Vite, React 18, MUI 7, Zustand 5 | Customer onboarding intake forms |
| **heylo-tablet** | Flutter 3.7, Dart | Resident-facing kiosk app |
| **hub** | Yocto 5.2, Raspberry Pi 5 | IoT hub hardware image |
| **heylo-infra** | Terraform | AWS infrastructure |
| **inventory** | Vite, React 18, MUI 7, Zustand 5 | Inventory tracking app |

## Build & Development Commands

### Backend (backend)
```bash
npm run start:dev          # Dev server with hot reload
npm run build              # Production build
npm run lint               # ESLint with auto-fix
npm run test               # Jest unit tests
npm run test:e2e           # End-to-end tests

# Database
npm run typeorm:migrate:dev    # Run migrations
npm run typeorm:revert:dev     # Revert last migration
npm run db:reset               # Reset DB and create superuser
```

### Web Dashboard (frontend)
```bash
npm run dev      # Dev server with Turbopack
npm run build    # Production build (uses NODE_ENV)
npm run lint     # Next.js lint
```

### Tablet App (heylo-tablet)
```bash
flutter pub get                                    # Install dependencies
flutter run --flavor dev                           # Run dev flavor
flutter build apk --flavor dev --release           # Build dev APK
flutter build apk --flavor prod --release          # Build prod APK
dart run build_runner build                        # Generate code (flutter_gen)
```

### Hub (Yocto build - requires WSL2 + Docker)
```bash
./build.sh       # Full image build via kas
./shell.sh       # Open kas environment shell
./clean.sh       # Clean tmp, keep downloads
./export.sh      # Export artifacts
```

## Architecture

### Backend Structure
- **Controllers**: REST endpoints in `src/controllers/`
- **Services**: Business logic in `src/services/`
- **Entities**: TypeORM models in `src/entities/` (Agency, Site, User, Device, Alert, Call, Caseload, etc.)
- **DTOs**: Request/response types in `src/domain/dto/`
- **Mapping Profiles**: AutoMapper profiles in `src/domain/mapping-profiles/`
- **Guards**: AuthGuard (Cognito JWT) and RolesGuard applied globally
- **Config**: Environment files in `src/config/` (development.env, production.env, etc.)

### Web Structure (Next.js App Router)
- **Private routes**: `app/(private)/` - authenticated pages
  - `/dashboard`, `/agencies`, `/sites`, `/users`, `/alerts`, `/analytics`, `/caseload-management`, `/communication`
- **Public routes**: `app/(public)/` - login, etc.
- **State**: Zustand for new feature state; React Context/providers for legacy and app-wide concerns
- **UI**: Radix UI primitives + custom components in `components/ui/`

### Tablet Structure (Flutter)
- **Screens**: `lib/ui/screens/`
- **Services**: `lib/services/` (API, kiosk, auth)
- **Models**: `lib/models/`
- **Controllers**: `lib/controllers/`
- **Config**: `lib/config/` (API endpoints, environment)

### Hub/IoT Architecture
- Raspberry Pi 5 running custom Yocto Linux
- Dual A/B partitions with Mender OTA updates
- Services: Home Assistant container, Mosquitto MQTT broker, custom Heylo services
- Build uses kas for reproducible Yocto builds

## Key Domain Concepts

- **Agency**: Top-level organization
- **Site**: Physical location/residence within an agency
- **User**: Staff members with roles (Super Admin, Agency Admin, Staff)
- **Device**: IoT devices at sites (cameras, sensors, hub)
- **Alert**: Device-triggered events requiring attention
- **Caseload**: Staff assignment schedules for sites
- **Call**: Video calls between staff and residents (via Daily.co)

## AWS Integrations

Backend uses AWS SDK for:
- **Cognito**: User authentication
- **IoT Core**: Device communication
- **Kinesis Video**: Camera streaming
- **S3**: File storage
- **SSM**: Parameter store for hub configuration
- **Secrets Manager**: Sensitive credentials

## Tablet Kiosk Mode

The tablet app runs in Android kiosk/device-owner mode:
- Exit kiosk: Tap top-right corner 5x, enter PIN **2650**
- Dev flavor package: `com.heylo.app.dev`
- Prod flavor package: `com.heylo.app`

See `KIOSK_QUICK_START.md` and `KIOSK_MODE_SETUP.md` in `heylo-tablet` for setup details.

## Infrastructure (Terraform)

Modules in `heylo-infra/terraform/`:
- `platform/` - Core AWS infrastructure
- `iot/` - IoT Core, Kinesis streams
- `relational_db/` - RDS MySQL
- `modules/` - Reusable Terraform modules

## Database Conventions

- **Table names**: all lowercase, no separators (e.g. `customeronboarding`, `devicealerttype`, `hardwaremodel`)
- **Column names**: camelCase matching the entity property (e.g. `statusId`, `createdOn`, `isDeleted`). A few legacy columns are PascalCase; do not propagate that pattern.
- **Entity `name` option**: must match the lowercase table name (e.g. `@Entity({ name: 'customeronboarding' })`)
- **Timestamp columns** (`createdOn`, `updatedOn`): defaults are managed by the DB (`DEFAULT CURRENT_TIMESTAMP` / `ON UPDATE CURRENT_TIMESTAMP` in the migration). Entity columns must use `insert: false, update: false` and must NOT include `default: () => 'CURRENT_TIMESTAMP'`; the database is the source of truth, not TypeORM.

## Code Style Preferences

- Always use enum or constant references instead of hardcoded string literals when an enum or constant exists for that value (e.g., statuses, types, severities, roles). If no enum/constant exists yet, create one when it makes sense — prefer that over hardcoded strings in most cases.
- If a ternary expression gets too long, break it into multiple lines or use an if statement instead.
- Define functions above where they are used, where possible (e.g., helper functions before the calling function).
- **Linting is handled automatically** by a PostToolUse hook that runs `npx eslint --fix` after every Edit/Write on backend, frontend, and inventory files. No need to lint manually.

## Backend Transactions

Wrap create/update service methods in `repository.manager.transaction(async (manager) => { ... })` when they touch multiple tables or perform multiple writes. Use the transaction's `manager` for all operations inside the callback — not the injected repositories. This ensures atomicity: if any step fails, all changes roll back. This is especially important for inventory services where entities have tight FK relationships (e.g. PO → line items → hardware).

## Backend Query Style (project-wide)

TypeORM is not going to help us handle scale. Backend service reads should be written as raw SQL via `repository.manager.query()`, not via TypeORM repository methods.

- **New service code**: write raw SQL from the start. Use the entity repository only as the entry point to `manager`.
- **Existing code touched in a PR**: convert it as you go. Don't leave a `findAndCount` / `find` with `relations` / `createQueryBuilder` in place when you're already editing the surrounding lines.
- **Avoid**: `findAndCount`, `find` with a `relations` array, `findOne` with `relations`, `createQueryBuilder` for joined reads. These hide query cost — `findAndCount` is two round trips, `relations` arrays generate LEFT JOIN soup or N+1 queries depending on the case, and pagination on joined relations forces TypeORM into subquery gymnastics.
- **Pagination**: use `COUNT(*) OVER()` window function in the same SELECT instead of a separate count query. See [outbound-shipment.service.ts](Repos/backend/src/services/outbound-shipment.service.ts) `getShipments` for the established pattern.
  - **Update**: prefer a separate `SELECT COUNT(*) AS total FROM <table>` query over `COUNT(*) OVER()`. The window function returns 0 on empty pages and is unfamiliar to most of the team. Two simple queries are easier to reason about.
- **Joined data**: single query with explicit `LEFT JOIN`/`INNER JOIN` and aliased columns, then map to nested response objects in TS.
- **Aggregates**: compute in SQL with `COUNT()`/`SUM()` + `GROUP BY`. Never load related rows and count in code.
- **Raw `COUNT()` returns strings** — wrap with `parseInt()` before returning.
- **Allowed TypeORM usage**: single-row writes (`save`, `update`, `delete` by ID), single-row PK reads with no relations (`findOne({ where: { id } })`), and `existsBy` for uniqueness checks. These are already one query and not measurably worse than raw SQL.
- **Migrations**: already use `queryRunner.query()` raw SQL — no change there.
- **No JS ternaries inside SQL template strings.** Build the WHERE clause (or any optional fragment) imperatively with `let whereClause = '...'; if (cond) { whereClause += ' AND col = ?'; params.push(v); }`. Ternaries in raw SQL make the query shape hard to read and let the WHERE and `params` array drift out of sync silently.

## Backend ORM Behavior (project-wide)

- **No TypeORM cascade / soft-delete / other auto-behaviors on relations.** Don't set `onDelete: 'CASCADE'`, `cascade: true`, or similar on `@ManyToOne`/`@OneToMany`/`@OneToOne`. Delete dependents explicitly in the service transaction before deleting the parent. ORM-level cascades hide writes from code review and couple the relation definition to the deletion contract — if someone adds a new caller that deletes the parent, the children vanish without a line of code saying so. DB-level FK `ON DELETE CASCADE` in a migration is allowed as a schema integrity net.

## Mutation Responses & Frontend Re-fetch (project-wide)

- **Backend**: Create and update endpoints should return only the new/updated record's ID (e.g. `{ id: saved.id }`), not the full object.
- **Frontend**: After a successful create or update, re-fetch the full page data from the backend rather than doing optimistic or targeted store updates. This keeps the frontend in sync with computed/aggregated fields and avoids divergence between what the backend returns and what the list query produces.

## Repo-Specific Instructions

@Repos/inventory/CLAUDE.md