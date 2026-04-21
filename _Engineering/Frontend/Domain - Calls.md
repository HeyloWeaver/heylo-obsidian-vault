# Frontend Domain - Calls

## Primary ownership

- Call initiation, in-call UI, and call history surfaces.
- Superuser call views and communication entry points.
- Realtime call state transitions.

## Read these first

- `frontend/app/(private)/calls/`
- `frontend/app/(private)/calls/superuser/page.tsx`
- `frontend/components/communication/video-call/`
- `frontend/context/video-call-context.tsx`
- `frontend/services/callService.ts`
- `frontend/lib/models/call/`
- `frontend/lib/models/common/event.ts`

## Common change patterns

1. Add/adjust call metadata from backend -> update call models.
2. Extend `callService.ts` for endpoint changes.
3. Update call list/detail/in-call UI.
4. Verify event-driven transitions (`created`, `connected`, `ended`, etc.).

## Gotchas

- Calls are tightly coupled to realtime events and routing behavior.
- UI state often spans page + global call widget/context.
- Small API shape changes can break token/join/update flows.

## Done checklist

- Start/join/end call paths work for impacted roles.
- Call state updates are reflected in UI without manual refresh.
- Missed/rejected/connected handling remains consistent.
- No duplicate toasts/events for the same call action.