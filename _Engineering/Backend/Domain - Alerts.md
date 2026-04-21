# Backend Domain - Alerts

## Primary ownership

- Alert ingestion, lifecycle updates, and retrieval/search.
- Alert event logging and websocket fanout.
- Priority/severity/status logic used by operators.

## Read these first

- `backend/src/controllers/alert.controller.ts`
- `backend/src/services/alert.service.ts`
- `backend/src/entities/alert.entity.ts`
- `backend/src/entities/alerteventlog.entity.ts`
- `backend/src/domain/enums/alert-*`
- `backend/src/services/websocket.service.ts`

## Common change patterns

1. Add DTO/update shape in `domain/dto`.
2. Add service logic and status transition rules.
3. Expose through controller with role constraints.
4. Emit/update websocket messages when operator UI needs realtime updates.
5. Sync frontend models/event handling if contract changed.

## Gotchas

- Alert state transitions often have side effects (logs, notifications, fanout).
- Enum naming must stay aligned with frontend display mappings.
- Device-originated alerts and user-facing alert actions are different paths.

## Done checklist

- Search/list/detail endpoints still return expected shape.
- Status transitions enforce authorization and audit/event logs.
- Realtime updates still fire where expected.
- Integration/service tests cover touched behaviors.

