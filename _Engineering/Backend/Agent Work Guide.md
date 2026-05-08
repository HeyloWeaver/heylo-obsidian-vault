---
type: guide
tags: [backend, agents]
owner: Mike
updated: 2026-05-08
status: current
---
# Backend - Agent Work Guide

This guide is optimized for agents making changes in `backend/`.

Use with [[Backend/High Level Overview]] (deep reference).
Use [[Backend/Domain Playbooks]] for subsystem-specific entry points.

---

## What this repo owns

- Core NestJS API and business logic.
- Auth/session, role authorization, tenancy rules.
- Realtime fanout through API Gateway WebSockets.
- Device/IoT event ingestion and transformation.
- Integrations (Cognito, Daily, SMTP, Intercom, AWS services).

---

## High-signal files to read first

- `backend/src/main.ts` - app bootstrap, CORS, Swagger, cookie parser.
- `backend/src/app.module.ts` - module graph, TypeORM entities, global guards.
- `backend/src/guards/auth.guard.ts` and `backend/src/guards/roles.guard.ts` - auth model.
- `backend/src/services/context.service.ts` - request identity and claims interpretation.
- `backend/src/controllers/connection.controller.ts` and `backend/src/services/websocket.service.ts` - realtime pipeline.
- `backend/src/services/aws.service.ts` - AWS integration touchpoint.
- `backend/src/services/caseload.service.ts` and `backend/src/controllers/caseload.controller.ts` - active cross-repo domain.

---

## Fast change recipes

### Add a new REST endpoint

1. Add DTO in `backend/src/domain/dto/`.
2. Add controller method with validation + role requirements.
3. Add service logic in the relevant `backend/src/services/*`.
4. Add tests (service + integration where practical).
5. Update frontend service contract if consumed by UI.

### Add a new table/entity

1. Add entity in `backend/src/entities/`.
2. Register in `app.module.ts` and the feature module `TypeOrmModule.forFeature`.
3. Add migration under `backend/src/migrations/`. **Seed inserts and lookup `WHERE` clauses must import the matching enum and bind via `?` placeholders** — no inline `'Live'`/`'Demo'` literals in migration SQL. See [[Code Review Guide]] §"No hardcoded literals where an enum exists".
4. Add service/controller integration as needed. When you validate a DTO field in a service method, **also assign it** to the entity (with `?? existing.x` fallback for optional-on-update fields). Validating without assigning is a recurring review flag.

### Add/change realtime events

1. Define/update event enum in backend domain.
2. Emit via `websocket.service.ts`.
3. Verify target user/device connection resolution.
4. Coordinate matching frontend event handling.

---

## Database conventions

These apply to all TypeORM entities and migrations in `backend/`, including backend inventory code. The top-level `inventory/` app is a Vite frontend and does not own TypeORM entities or migrations.

- **Table names**: all lowercase, no separators (e.g. `customeronboarding`, `devicealerttype`, `hardwaremodel`).
- **Column names**: **camelCase** matching the entity property (`agencyId`, `siteId`, `createdOn`, `isDeleted`, `isMfaEnabled`). A handful of legacy columns are PascalCase (`DeviceAlertEmails`, `AlertTypeId`); do not propagate that pattern — new columns are camelCase.
- **`@Entity({ name: '…' })`**: must match the lowercase table name exactly. `@Entity()` with no name is fine when the class name already lowercases to the right table.
- **Timestamp columns** (`createdOn`, `updatedOn`): use `insert: false, update: false` on the entity property; do **not** include `default: () => 'CURRENT_TIMESTAMP'`. The DB manages these via `DEFAULT CURRENT_TIMESTAMP` / `ON UPDATE CURRENT_TIMESTAMP` in the migration.

---

## Query patterns — prefer raw SQL

TypeORM is not going to help with scale. Service reads should use `repository.manager.query()`, not TypeORM repository methods.

- **New code**: write raw SQL from the start. Use the entity repository only as the entry point to `manager`.
- **Existing code you're touching**: convert it in the same PR — don't leave `findAndCount` / `find` with `relations` / `createQueryBuilder` in place.
- **Avoid**: `findAndCount` (two round trips), `find` with a `relations` array (N+1 or LEFT JOIN soup), `findOne` with `relations`, `createQueryBuilder` for joined reads.
- **Pagination**: use two separate queries — `SELECT …` and `SELECT COUNT(*) AS total FROM <table>`. Avoid `COUNT(*) OVER()` (returns 0 on empty pages and is unfamiliar to most of the team).
- **Joined data**: single `SELECT` with explicit `LEFT JOIN`/`INNER JOIN` and aliased columns; map to nested response objects in TypeScript.
- **Aggregates**: compute with `COUNT()`/`SUM()` + `GROUP BY` in SQL — never load rows and count in code.
- **`COUNT()` returns strings**: always wrap with `parseInt()` before returning.
- **No JS ternaries in SQL strings**: build optional `WHERE` clauses imperatively.
- SQL must use the actual column names created by the migration. The example below uses the current camelCase convention; some legacy tables still have PascalCase columns.

  ```ts
  let whereClause = 'WHERE a.isDeleted = 0';
  const params: Array<string | number | boolean | Date> = [];
  if (agencyId) {
    whereClause += ' AND a.agencyId = ?';
    params.push(agencyId);
  }
  ```

**Allowed TypeORM usage** (already one query, not measurably worse than raw SQL):
- Single-row writes: `save`, `update`, `delete` by ID.
- Single-row PK reads with no relations: `findOne({ where: { id } })`.
- Uniqueness checks: `existsBy`.

---

## Transaction pattern

Wrap any service method that touches multiple tables in a transaction:

```ts
await this.myRepository.manager.transaction(async (manager) => {
  await manager.save(MyEntity, parentRow);
  await manager.save(ChildEntity, childRows);
});
```

Use the transaction's `manager` for **all** operations inside the callback — not the injected repositories. This ensures atomicity: if any step fails, all changes roll back. Required any time a service creates/updates multiple tables or performs multiple writes (especially important in inventory where entities have tight FK relationships).

---

## ORM cascade rules

Never set `onDelete: 'CASCADE'`, `cascade: true`, or similar on `@ManyToOne`/`@OneToMany`/`@OneToOne` relation decorators. Delete dependents **explicitly** in the service transaction before deleting the parent. ORM-level cascades hide writes from code review and silently delete children if someone later adds a new parent-deletion caller.

DB-level FK `ON DELETE CASCADE` in a migration is allowed as a schema integrity net — that's a database constraint, not ORM magic.

---

## ORM eager loading

Never set `eager: true` on relation decorators except for **small static reference tables** (status, type, severity, role-name lookups with a fixed handful of rows that never grow). ORM auto-loading hides queries from the call site, makes it easy to pull more than the caller needs, and chains recursively when loaded entities have their own eager relations.

Even on those tiny lookup tables, prefer requesting the relation explicitly (`relations: ['status']` at the call site, or hand-rolled SQL) so the load is visible in review. See [[Code Review Guide]] §"No `eager: true` on entity relations except for tiny lookup tables".

---

## Contract changes and deploy skew

Heylo doesn't atomically deploy backend and frontend. A new required DTO field 400s the old frontend during the rollout window.

- **Customer-facing endpoints**: new DTO properties land **optional with a server-side default**. The field still appears on the DTO (so new callers can set it); old callers omitting it get the default. Don't rename or repurpose existing fields; don't remove enum values old clients may still send.
- **Super-user / internal-only endpoints**: required is acceptable, but call out the deploy-skew window in the PR description.

This refines "expose new typed fields on the create DTO" — the field always belongs on the DTO; required-vs-optional is the deploy-skew decision. See [[Code Review Guide]] §"Backwards-compatible contract changes (deploy skew)".

---

## List-endpoint ordering

`ORDER BY` the human-meaningful column when the list feeds a UI control — usually `name ASC`, not `id` or insertion order. `id` reflects the seed-migration row order, which isn't a sort anyone wants in a UI. Exceptions: lists with an intrinsic ordering (priority, severity, time) use that column.

---

## Mutation responses

- **Backend**: create and update endpoints return only the new/updated record's ID: `{ id: saved.id }`. Do not return the full object.
- **Frontend**: after a successful create or update, re-fetch the full page data from the backend. Do not do optimistic or targeted client-state patches. This keeps the UI in sync with computed/aggregated fields.

---

## Gotchas and drift risks

- `app.module.ts` is broad; keep module boundaries clean when adding features.
- Access control often depends on both guard behavior and role annotations.
- API surface includes both human-user and device-originated traffic.
- Multiple lambda paths exist (legacy `lambda/` and newer `lambdas/`), so confirm which execution path is authoritative before modifying scripts.
- E2E scaffolding may lag current behavior; trust integration tests closer to active domains.

---

## Claude commands

Backend slash commands for debugging and operations — invoke inside Claude Code when working in `backend/`:

| Command | Purpose |
|---|---|
| `/smoke-events` | Query smoke / CO alarm events from CloudWatch |
| `/device-logs` | Search device ingestion CloudWatch logs |
| `/camera-registry` | Query camera registry events from CloudWatch |
| `/deploy-lambda` | Deploy a lambda to dev or prod |
| `/code-review` | Review a PR or branch for project-specific rules |
| `/weekly-update` | Generate a weekly summary across all repos |

See [[Backend/Commands/Commands]] for full reference.

---

## Done checklist for backend tasks

- Endpoint and DTOs validate as expected.
- Auth/role behavior is explicit and tested for affected routes.
- Realtime and side effects remain backward compatible.
- Migration strategy is included when schema changes.
- Entity table names are lowercase; new column names are camelCase; timestamp columns use `insert: false, update: false`.
- Service reads use raw SQL via `repository.manager.query()` — no `findAndCount`/`find` with relations/`createQueryBuilder` for joined reads.
- Multi-table writes are wrapped in a `manager.transaction(...)` callback.
- No `cascade: true` or `onDelete: 'CASCADE'` on relation decorators.
- No `eager: true` on relation decorators (exception: small static reference tables).
- New required fields on customer-facing DTOs land as **optional with a server-side default**; required-only is reserved for super-user endpoints, and the deploy-skew window is noted in the PR.
- List endpoints feeding UI controls `ORDER BY` the human-meaningful column (usually `name ASC`).
- Create/update endpoints return `{ id }` only; frontend re-fetches page data.
- No hardcoded string literals where an enum exists — including migration seed/lookup SQL (use parameter bindings).
- Every DTO field validated in a service method is also assigned to the entity.
- New typed/configurable fields are exposed on the create DTO, not hardcoded to a default.
- New eager relations on existing entity loads are explained in the PR description.
- Update `_Engineering/Backend/*` notes when architecture or contracts change.

