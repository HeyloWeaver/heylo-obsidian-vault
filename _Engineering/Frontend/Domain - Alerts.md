# Frontend Domain - Alerts

## Primary ownership

- Alert search/list/detail UX.
- Alert status transitions and event-log visibility.
- Real-time alert arrival handling (toast/audio/notification).

## Read these first

- `frontend/app/(private)/alerts/`
- `frontend/components/alert/`
- `frontend/services/alertService.ts`
- `frontend/context/socket-context.tsx`
- `frontend/lib/models/alert/`
- `frontend/lib/models/common/event.ts`

## Common change patterns

1. Add/adjust backend fields -> update alert models.
2. Update service methods in `alertService.ts`.
3. Update list/detail components and filters.
4. Verify realtime event handling still routes users correctly.

## Gotchas

- Alert UX is split across page components and socket side effects.
- Priority/status labels are domain-specific and easy to drift from backend enums.
- Toast duplication can happen if event handling is added in multiple places.

## Done checklist

- Search + detail views still load with current filters.
- Status update flows (`resolved`, `needs-support`, `dismissed`) still work.
- Incoming alert realtime behavior (sound/toast/notification) is intact.
- Role-based route behavior still makes sense for affected pages.

