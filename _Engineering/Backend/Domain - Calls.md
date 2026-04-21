---
type: domain
tags: [backend, calls]
owner: Mike
updated: 2026-04-21
status: current
---
# Backend Domain - Calls

## Primary ownership

- Call creation, participant/state lifecycle, and history.
- Daily room/token orchestration.
- Realtime call notifications to participants/devices.

## Read these first

- `backend/src/controllers/call.controller.ts`
- `backend/src/controllers/call-event-log.controller.ts`
- `backend/src/services/call.service.ts`
- `backend/src/services/calleventlog.service.ts`
- `backend/src/services/daily.service.ts`
- `backend/src/entities/call.entity.ts`
- `backend/src/entities/callparticipant.entity.ts`

## Common change patterns

1. Update call DTOs and enums for lifecycle/state changes.
2. Extend service logic for room/token creation or transitions.
3. Ensure controller methods enforce role and participant access.
4. Verify websocket fanout for `created/connected/missed/rejected/ended`.
5. Sync frontend call service/model expectations.

## Gotchas

- Call flows involve both REST writes and websocket pushes.
- State transition ordering is important for UI correctness.
- Room/token TTL behavior can surface edge cases in long sessions.

## Done checklist

- Start/join/update/end endpoints behave correctly.
- Call event log entries still capture meaningful lifecycle events.
- Participant authorization is preserved.
- Realtime notifications are consistent with state changes.