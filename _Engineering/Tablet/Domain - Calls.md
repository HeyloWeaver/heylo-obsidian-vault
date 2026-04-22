---
type: domain
tags: [tablet, calls]
owner: Mike
updated: 2026-04-22
status: current
---
# Tablet Domain - Calls

## Primary ownership

- Incoming call detection and accept/reject UX on the resident tablet.
- Outbound call initiation (resident-to-staff "call staff" flow).
- Daily.co WebRTC session lifecycle: join, connect, end.
- Call state machine: idle → incoming → connecting → active → ended/missed/rejected.
- Call event reporting to backend (connected, ended, missed, rejected).

## Read these first

- `tablet/lib/controllers/call.controller.dart` — `CallState` stream, state machine, Daily SDK lifecycle.
- `tablet/lib/services/call.service.dart` — REST: get call, get token, PATCH lifecycle transitions.
- `tablet/lib/ui/screens/video_call/` — active call screen (local + participant video views).
- `tablet/lib/ui/screens/home/incoming_call/` — incoming call overlay on the home screen.
- `tablet/lib/ui/screens/home/missed_calls_card/` — missed call badge/list.
- `tablet/lib/ui/common_widgets/call_staff.view.dart` — outbound call trigger.
- `tablet/lib/enums/call_status.enum.dart` — `CallStatus` values.

## Backend relationship

- `CallCreated` WS event → `RealtimeService` dispatches to `CallController`.
- `GET /call/:id` — fetch call details (room name, participants).
- `GET /call/:id/token` — fetch Daily meeting token for this tablet's device identity.
- `PATCH /call/:id/connected` — tablet joined Daily room successfully.
- `PATCH /call/:id/missed` — resident did not answer before timeout.
- `PATCH /call/:id/rejected` — resident explicitly declined.
- `PATCH /call/:id/ended` — resident or staff ended the call.

## Common change patterns

1. Call state machine changes → update `CallController` state enum and transition logic; verify all terminal states (`ended`, `missed`, `rejected`) clean up the Daily `CallClient`.
2. UI changes to the incoming call overlay → edit `home/incoming_call/`; ensure it mounts/unmounts correctly when `CallState` transitions.
3. New call lifecycle PATCH endpoint → add to `call.service.dart` and call it from the correct `CallController` transition.
4. Adding Daily SDK features (e.g., mute, camera toggle) → operate on the `CallClient` instance held by `CallController`; expose state changes as streams.

## Gotchas

- Daily `CallClient` must be fully destroyed on every terminal state to release WebRTC resources. A leaked `CallClient` causes audio/camera to remain active.
- `GET /call/:id/token` is authenticated as the device (not the resident user) — the token is scoped to the device's Cognito identity.
- Incoming call timeout: if the resident does not accept within the backend's timeout window, the backend sends `CallMissed`; the tablet should not independently time out and PATCH missed.
- Wakelock must be acquired when the incoming call overlay appears and released when the call ends (or is declined) — otherwise a sleeping tablet misses incoming calls.
- If a second `CallCreated` arrives while a call is active, `CallController` should handle it gracefully (queue or reject) rather than crashing.

## Done checklist

- All `CallState` terminal paths (`ended`, `missed`, `rejected`) destroy the Daily `CallClient`.
- Incoming call overlay renders and auto-dismisses correctly on each state.
- Backend receives the correct PATCH for every transition (connected, missed, rejected, ended).
- Wakelock acquired on incoming call, released on all terminal states.
- Missed calls card updates after a missed call without requiring a restart.
