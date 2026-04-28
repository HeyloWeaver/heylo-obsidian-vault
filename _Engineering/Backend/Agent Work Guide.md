---
type: guide
tags: [backend, agents]
owner: Mike
updated: 2026-04-21
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
3. Add migration under `backend/src/migrations/`.
4. Add service/controller integration as needed.

### Add/change realtime events

1. Define/update event enum in backend domain.
2. Emit via `websocket.service.ts`.
3. Verify target user/device connection resolution.
4. Coordinate matching frontend event handling.

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
- Update `_Engineering/Backend/*` notes when architecture or contracts change.

