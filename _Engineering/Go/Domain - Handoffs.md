# Go Domain - Handoffs

Go/AppSync currently focuses on caseload schedule reads. For other domains, use these ownership boundaries:

## Alerts

- Primary implementation: `backend/src/controllers/alert.controller.ts` + `backend/src/services/alert.service.ts`
- Frontend consumer: `frontend/services/alertService.ts` + alert UI components
- Go role today: none (unless explicitly introducing an AppSync read/query)

## Calls

- Primary implementation: `backend/src/controllers/call.controller.ts` + `backend/src/services/call.service.ts`
- Frontend consumer: `frontend/services/callService.ts` + communication/call UI
- Go role today: none

## Devices

- Primary implementation: backend device and event controllers/services
- Frontend consumer: site/device views + socket-driven indicators
- Go role today: none

## If adding a new Go/AppSync domain

1. Define contract in `schema.graphql`.
2. Add resolver branch in `main.go`.
3. Add query logic in `platformdb/`.
4. Add tests for auth + shape.
5. Document ownership split here and in `_Engineering/Go/Agent Work Guide.md`.

---

**Related:** [[Go/Agent Work Guide]] | [[Go/Domain Playbooks]] | [[Backend/Agent Work Guide]]
