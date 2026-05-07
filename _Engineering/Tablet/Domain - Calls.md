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

> **Naming note:** in this codebase, `controllers/*.dart` are **HTTP API clients** (no state, return `DataState<T>`), while `services/*.service.dart` own the lifecycle, state, and stream pipelines. See [[Tablet/Onboarding Walkthrough]] §2 and [[Tablet/DataState Pattern]].

- `tablet/lib/services/call.service.dart` — **call lifecycle owner**. Holds `_activeCall`, the Daily `CallClient`, the `_hasJoined`/`_isCleaningUp` state, the 5s call-ping timer, the `_cleanUpCallClient` mutex. Exposes `onIncomingCall`/`onCallEnded`/`onCallRejected`/`onCallMissed` streams (rxdart `.where().map()` pipelines off `RealtimeService`'s broadcast).
- `tablet/lib/controllers/call.controller.dart` — **HTTP wrapper.** `getCall`, `generateCallToken`, `createCall`, `connectCall`, `missCall`, `rejectCall`, `endCall`, `pingCall`, `searchCalls`. No state, no streams.
- `tablet/lib/ui/screens/video_call/video_call.view_model.dart` — Daily SDK join with retries, adaptive video quality (debounced WiFi tier subscription), audio-only fallback, ANR-prevention via `KioskService.withTouchDisabledTimeoutVoid`.
- `tablet/lib/ui/screens/video_call/` — active call UI (local + participant video views).
- `tablet/lib/ui/screens/home/home.view_model.dart` — subscribes to `CallService.onIncomingCall` + sibling streams; shows `IncomingCall` modal; routes to `/video-call` on accept.
- `tablet/lib/ui/screens/home/incoming_call/` — incoming call overlay on the home screen.
- `tablet/lib/ui/screens/home/missed_calls_card/` — missed call badge/list.
- `tablet/lib/ui/common_widgets/call_staff.view.dart` — outbound call trigger.
- `tablet/lib/enums/call_status.enum.dart` — `CallStatus` values.

## Backend relationship

- `CallCreated` WS event → `RealtimeService._dataStream$` broadcasts → `CallService.onIncomingCall` filters by event type + dedupes against `_activeCall.id` → `HomeViewModel` listener → modal. (Not "dispatches to a controller" — `RealtimeService` doesn't know about consumers, it just broadcasts.) See [[Tablet/WS Contract]].
- `GET /call/:id` — fetch call details (room name, participants). Wrapped by `CallController.getCall`.
- `GET /call/:id/token` — fetch Daily meeting token for this tablet's device identity. Wrapped by `CallController.generateCallToken`.
- `GET /call/my/with/support-professional` — **note: `GET` creates a call** (established quirk). Wrapped by `CallController.createCall`.
- `PATCH /call/:id/connected` — tablet joined Daily room successfully. Wrapped by `CallController.connectCall`.
- `PATCH /call/:id/missed` — resident did not answer before timeout. Wrapped by `CallController.missCall`.
- `PATCH /call/:id/rejected` — resident explicitly declined. Wrapped by `CallController.rejectCall`.
- `PATCH /call/:id/ended` — resident or staff ended the call. Wrapped by `CallController.endCall`.
- `PATCH /call/:id/ping` — 5s liveness ping. Backend returns 403/404 = "call dead, clean up." Wrapped by `CallController.pingCall`.
- `POST /call/search` — checks for **HTTP 201** (NestJS POST default), not 200. Used for missed-calls list. Wrapped by `CallController.searchCalls`.

## Related references

- [[Tablet/Onboarding Walkthrough]] §5 — worked example tracing an incoming call end-to-end through these files.
- [[Tablet/WS Contract]] — the `CallCreated` / `CallEnded` / `CallRejected` / `CallMissed` wire format and payload shapes.
- [[Tablet/Stream Patterns Cookbook]] — how `CallService` builds its `onIncomingCall` / `onCallEnded` / etc. streams.
- [[Tablet/DataState Pattern]] — the return type used by every `CallController` HTTP method.
- [[Tablet/Voice Commands]] — `_executeCallStaff` / `_executeAcceptCall` / `_executeDenyCall` invoke `CallService` methods.
- [[Tablet/Kiosk Service Reference]] — `withTouchDisabledTimeoutVoid` wraps Daily SDK join/dispose for ANR prevention.

> Section above re-anchored 2026-05-06 to match actual code: `controllers/*.dart` are HTTP clients, `services/*.service.dart` own state/streams.

## Common change patterns

1. **Call lifecycle changes** → update `CallService` (`startCall`/`joinCall`/`leaveCall`/`rejectCall`/`missedCall`/`_cleanUpCallClient`); verify all terminal paths route through cleanup mutex. Don't put state on `CallController`.
2. UI changes to the incoming call overlay → edit `home/incoming_call/`; ensure it mounts/unmounts via `_incomingCallModalSvc` in `home.view_model.dart` and that `_pendingIncomingCall$` clears on every terminal state.
3. **New call lifecycle PATCH endpoint** → add the HTTP method to `controllers/call.controller.dart` (returning `DataState<T>`); call it from the appropriate `CallService` lifecycle method; never call the controller from a view-model directly.
4. **Adding Daily SDK features** (e.g., mute, camera toggle) → operate on the `CallClient` instance held by `CallService._callClient`; surface state via a new `BehaviorSubject` on `CallService` or `VideoCallViewModel` (see [[Tablet/Stream Patterns Cookbook]]). Do **not** add state to `CallController`.
5. **Adding a new WS event** the tablet should react to → see [[Tablet/WS Contract]] §9 (the 5-step recipe).

## Gotchas

- Daily `CallClient` must be fully destroyed on every terminal state to release WebRTC resources. `CallService._cleanUpCallClient` is the single owner — never null `_callClient` from outside.
- **`_cleanUpCallClient` uses `KioskService.withTouchDisabledTimeoutVoid`** during `dispose()` — Daily's native cleanup can block the main thread for 10+ seconds → ANR risk. The 30s watchdog ensures touch is re-enabled even if the SDK hangs. Don't bypass this wrapper.
- **`onIncomingCall` has a built-in dedupe filter** (`id !== _activeCall?.id`). If a call event seems to be silently dropped, this filter is the first suspect.
- **`pingCall` 403/404 is the "call dead" signal** — the 5s timer self-cleans on those status codes. Backend changes to that endpoint can break tablet calls invisibly.
- `GET /call/:id/token` is authenticated as the device (not the resident user) — the token is scoped to the device's Cognito identity.
- Incoming call timeout: if the resident does not accept within the backend's timeout window, the backend sends `CallMissed`; the tablet should not independently time out and PATCH missed.
- Wakelock must be acquired when the incoming call overlay appears (`ScreenDimService().wakeUp()` in `_setupIncomingCallListener`) and released when the call ends — otherwise a sleeping tablet misses incoming calls.
- If a second `CallCreated` arrives while a call is active, the `CallService.onIncomingCall` dedupe filter drops it. If the new call is for a different ID, the home view-model accepts it.

## Done checklist

- All terminal paths (`ended`, `missed`, `rejected`) route through `CallService._cleanUpCallClient` (mutex + touch-disabled wrapper) — no direct `_callClient = null` assignments outside cleanup.
- Incoming call overlay renders and auto-dismisses correctly on each state. `_pendingIncomingCall$` clears on every terminal path (incl. voice-command rejection).
- Backend receives the correct PATCH for every transition (connected, missed, rejected, ended).
- Wakelock acquired on incoming call, released on all terminal states.
- Missed calls card updates after a missed call without requiring a restart.
- `CallController` methods only added when there's a corresponding backend route; no state introduced there.
- `build_runner` re-run if `CallMessageModel` or any `@JsonSerializable` request DTO was modified.
