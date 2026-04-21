# Backend Domain - Devices

## Primary ownership

- Device identity/state in the platform database.
- Ingestion of hub/device/camera status from event pipelines.
- Device alerts and operational metadata updates.

## Read these first

- `backend/src/controllers/device.controller.ts`
- `backend/src/controllers/device-event.controller.ts`
- `backend/src/controllers/device-status.controller.ts`
- `backend/src/controllers/camera-event.controller.ts`
- `backend/src/controllers/hub-event.controller.ts`
- `backend/src/services/device.service.ts`
- `backend/src/entities/device.entity.ts`
- `backend/src/domain/enums/device-*`

## Common change patterns

1. Update ingress DTO/payload mapping for new telemetry fields.
2. Update `device.service.ts` update logic and status transitions.
3. Preserve API-key guarded ingress paths for machine traffic.
4. Emit websocket/device-alert updates where operator UX depends on them.
5. Keep frontend device models and labels aligned.

## Gotchas

- Device events can arrive from multiple protocols and payload shapes.
- Hub status, camera status, and per-device status are separate update paths.
- Common-area vs resident-linked device logic affects authorization behavior.

## Done checklist

- Ingress endpoints accept and validate expected event payloads.
- Device status/battery/lifecycle updates persist correctly.
- Alert/banner side effects still trigger correctly.
- Tests or fixtures cover changed payload mapping.

