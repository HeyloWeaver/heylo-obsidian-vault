---
type: guide
tags: [tablet, onboarding, agents]
owner: Mike
updated: 2026-05-06
status: current
---
# Tablet — Onboarding Walkthrough (for JS/TS/React devs)

A ramp-up guide for engineers coming from a JavaScript / TypeScript / React (or Vue) background who are taking on the Flutter tablet app. Companion to [[Tablet/High Level Overview]] and [[Tablet/Agent Work Guide]] — those describe *what's here*; this doc explains *how to think about it* if your mental models are JS-shaped.

Read this once front-to-back. The worked examples trace one full feature (incoming call) end-to-end through every layer of the stack.

---

## 1. Mental model translation

The tablet is **Flutter + Dart**. Three frameworks/idioms map onto JS-world equivalents:

| Tablet | TS / React (primary) | Vue 2 (secondary) |
|---|---|---|
| `StatefulWidget` + `State<T>` | function component + state | `<template>` + Options API `data` |
| `*.view.dart` | the JSX tree | `<template>` |
| `*.view_model.dart` | a custom hook / store class | the `<script>` Options API |
| `initState()` | `useEffect(() => …, [])` mount | `mounted()` |
| `dispose()` | the `useEffect` cleanup return | `beforeDestroy()` |
| `setState(() { … })` | `setX(…)` from `useState` | mutating `this.x` |
| `build(BuildContext)` | the JSX `return` | render function |
| `BehaviorSubject<T>` (rxdart) | tiny external store (Zustand-flavored) | reactive `data` field |
| `StreamBuilder<T>` | `useSyncExternalStore` / Zustand selector | template binding to reactive data |
| `stream.listen((v) => …)` | RxJS `.subscribe(v => …)` | `watch:` handler |
| `.takeUntil(unsub.stream)` | RxJS `takeUntil` / `AbortController` | manual `clearInterval`/`socket.off` |
| `GetIt.instance<X>()` | module-singleton import | likewise |
| Dart `Future<T>` / `async`/`await` | `Promise<T>` / `async`/`await` | likewise |
| Dart records `(a, b)` + destructure | TS tuples | — |
| Dio + `AuthInterceptor` | axios + interceptors | likewise |
| `pubspec.yaml` | `package.json` | likewise |
| `*.g.dart` (build_runner) | generated `.d.ts` (codegen step) | likewise |
| `Theme.of(context)` | `useContext(ThemeContext)` | injected theme |
| `Column` / `Row` / `Expanded` | flexbox; `flex: 1` | likewise |

### Things that have no clean JS analogue

- **Platform channels** (`MethodChannel('com.heylo.app/...')`) — Dart ↔ Java native bridge. Closest analogue is a custom RN bridge module.
- **ANR (Application Not Responding)** — Android force-close prompt if input events queue for ~5s. Doesn't exist in browsers. Solved here via `KioskService.withTouchDisabledTimeoutVoid` wrapping any blocking native call.
- **Lock task / Device Owner mode** — kiosk locking. See [[Tablet/Domain - Kiosk]].
- **`const` constructors** — Flutter's `React.memo` equivalent, but enforced by the compiler. `const SizedBox.shrink()` is statically guaranteed structurally identical and skips rebuild.

---

## 2. Architecture in one screen

```
┌─────────────────────────────────────────────────────────────┐
│                          VIEW (.view.dart)                  │
│   StatefulWidget + State — the JSX equivalent.              │
│   Subscribes to view-model streams via StreamBuilder.       │
└──────────────────────────┬──────────────────────────────────┘
                           │ reads/binds
┌──────────────────────────▼──────────────────────────────────┐
│                  VIEW-MODEL (.view_model.dart)              │
│   Per-screen glue. BehaviorSubject state. init/dispose      │
│   pair. Subscribes to services for events + actions.        │
└──────────────────────────┬──────────────────────────────────┘
                           │ calls
┌──────────────────────────▼──────────────────────────────────┐
│                  SERVICE (services/*.service.dart)          │
│   Singleton. Owns lifecycle, stream pipelines, state        │
│   machines, side-effects. NO ui imports.                    │
└──────────────────────────┬──────────────────────────────────┘
                           │ for HTTP work, calls
┌──────────────────────────▼──────────────────────────────────┐
│       "CONTROLLER" / API CLIENT (controllers/*.dart)        │
│   Singleton. Pure HTTP wrapper. Returns DataState<T>.       │
│   ⚠ Mis-named — these are NOT NestJS-style controllers.    │
└──────────────────────────┬──────────────────────────────────┘
                           │ uses
┌──────────────────────────▼──────────────────────────────────┐
│                       HttpService (Dio)                     │
│   4 interceptors: bootstrap-wait, JWT-attach,               │
│   401-refresh-retry, internet-status logger.                │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP/WS to
┌──────────────────────────▼──────────────────────────────────┐
│                  Backend (NestJS) + AWS API GW              │
└─────────────────────────────────────────────────────────────┘
```

**Naming wart, up front:** in the tablet codebase, **`controllers/*.dart` files are HTTP API clients**, not NestJS-style controllers. They are *clients* of the backend's NestJS controllers. Mentally rebrand them as `*ApiClient`. The genuinely "controller-like" stateful logic (state machines, lifecycle) lives in `services/*.service.dart`. The split is well-implemented, just unfortunately named.

---

## 3. Singleton + DI conventions

Two patterns, applied differently:

### Module-singleton (services + "controllers")

Every `service.dart` and `controller.dart` file uses Dart's factory constructor pattern:

```dart
class CallService {
  static final CallService _instance = CallService._internal();
  factory CallService() => _instance;
  CallService._internal();
}
```

Calling `CallService()` looks like a constructor but always returns the same instance. TS equivalent: `export default new CallService();`. There's **no DI container** for these — they're plain module singletons. Cross-file dependencies happen by direct call.

### `GetIt`-registered singletons (controllers in `controllers/` that *do* hold state — rare)

The few stateful "controllers" are registered in `GetIt` at app startup in [tablet/lib/main.dart](../../tablet/lib/main.dart). Resolved via `GetIt.instance<X>()`. Behaves like a DI container.

In practice: **default to module-singleton**. Reach for `GetIt` only for cross-cutting state that benefits from explicit lifetime management.

---

For deeper rxdart recipes (operators, cleanup idioms, common mistakes), see [[Tablet/Stream Patterns Cookbook]].

## 4. State management cheat sheet

Three tools, three jobs:

| Tool | When to use it | TS/React analogue |
|---|---|---|
| `setState(() { … })` inside a widget | Screen-only ephemeral state (loading flag, local form input) | `useState` |
| `BehaviorSubject<T>` on a view-model | Per-screen state that needs to be shared between view + view-model, or surfaces multiple values over time | A small store, exposed as a hook |
| `BehaviorSubject<T>` on a service | App-wide state with multiple consumers (call lifecycle, WiFi tier, online status) | A Zustand store / Redux slice |

`BehaviorSubject` is rxdart — same name and semantics as RxJS `BehaviorSubject`. Holds last value, emits to subscribers. `.value` reads, `.add(v)` writes, `.stream` subscribes. The `.distinct()` operator (only emit on change) is heavily used to avoid spurious rebuilds.

**Plain instance fields** are used for internal state that nobody outside the class observes — same instinct as `useRef`. See `_activeCall`, `_callClient`, `_hasJoined` in `CallService` for examples.

---

## 5. Worked example — incoming call, end-to-end

The cleanest way to understand the architecture is to trace one real feature. Here is what happens from "backend emits a CallCreated event" to "resident sees video on screen":

```
1. Backend (NestJS)
   backend/src/.../call.gateway.ts emits "CallCreated" over WS
   payload = { event: "CallCreated", data: { id, callerId, ... } }
        │
        ▼
2. RealtimeService (singleton WS connection)
   tablet/lib/services/realtime.service.dart
   _dataStream$.add(parsedMessage)   // broadcasts to ALL listeners
        │
        ▼
3. CallService stream pipeline (rxdart filter/map/filter)
   tablet/lib/services/call.service.dart
   onIncomingCall = onDataReceived
     .where(event === CallCreated)
     .map(data => CallMessageModel)
     .where(id !== activeCall.id)   // dedupe
        │
        ▼
4. HomeViewModel listener (registered in init())
   tablet/lib/ui/screens/home/home.view_model.dart
   CallService().onIncomingCall.listen((data) async {
     await ScreenDimService().wakeUp();
     CallService().setPendingIncomingCall(data);
     _showIncomingCallModal(data);
   });
        │
        ▼
5. Modal shown
   IncomingCall widget mounted with onAccept/onDecline callbacks.
        │
        ▼ (resident taps Accept)
6. CallService.joinCall(callId)
   - calls CallController.getCall + CallController.connectCall in parallel
   - calls CallController.generateCallToken
   - starts the 5s call-ping timer
        │
        ▼
7. Navigation push to /video-call with { token }
        │
        ▼
8. VideoCallViewModel.init(meetingUrl, token)
   tablet/lib/ui/screens/video_call/video_call.view_model.dart
   - up to 3 retries on callClient.join() (touch disabled to prevent ANR)
   - configures Daily subscription profiles
   - forces audio to speakerphone
   - subscribes to WifiQualityTier (debounced 5s) — adaptive bitrate
        │
        ▼
9. Daily SDK renders video tiles. Tablet pings backend every 5s.
   On Daily 'left' event → router.pop() back to home.
```

Every layer in this chain corresponds to a file you can grep. The contract that holds the whole pipeline together is the `Event` enum (Dart, in `tablet/lib/enums/events.enum.dart`) matching the wire string emitted by the backend's `AppEvent` enum (TS, in `backend/src/domain/models/common/event.ts`) — see [[Tablet/WS Contract]] for the full contract surface and [[Tablet/Domain - Calls]] for the call-specific deep dive.

---

## 6. File-by-file digest

Each entry is a short read-this-once summary of a file's job, the gotchas, and the TS analogue.

### `services/realtime.service.dart` — single WebSocket, state machine

- 4-state machine: `disconnected → connecting → connected → reconnecting`.
- JWT auth via **query parameter** (`?jwt=<idToken>`) — AWS API Gateway pattern. Token rotation requires full reconnect; no way to swap a fresh token onto an open WS.
- **Two failure detectors**: OS `onDone`/`onError` callbacks, *and* a watchdog timer (`Timer.periodic` every 20s, declares dead after 40s of silence). Belt-and-suspenders because OS callbacks can lie on flaky networks.
- **Close code 1001** (API Gateway idle timeout) is special-cased — silent reconnect, no UI flag flipped.
- Reconnect = exponential backoff + jitter (`500ms × 2^attempts`, clamped to 30s, plus 0–300ms random) + wait for `InternetStatusService` to confirm connectivity before retrying.
- `_dataStream$.add(...)` is the firehose — every other consumer subscribes through service-level filters.
- **`admin_command` event** is the remote-management surface: `update-flexible`, `update-immediate`, `update-sideload`, `restart`, `reboot`. See [[Tablet/Admin Commands]].

### `services/call.service.dart` — call lifecycle + state, stream pipelines

- Singleton owning the call state machine (`_activeCall`, `_callClient`, `_hasJoined`, `_isCleaningUp`).
- Stream getters (`onIncomingCall`, `onCallEnded`, `onCallRejected`, `onCallMissed`) are derived rxdart pipelines off `RealtimeService.onDataReceived`. Equivalent to RxJS `pipe(filter, map, filter)`.
- `onIncomingCall` includes a dedupe filter (`id !== activeCall.id`) — silently drops events. Prime suspect when "a call event seems to be missed."
- `onCallMissed` deliberately skips the active-call filter — missed events apply globally.
- `_callPingTimer` pings backend every 5s. Backend returns 403/404 = "call dead, clean up." Backend changes to that endpoint can break tablet calls invisibly.
- **Cleanup state machine** (`_cleanUpCallClient`) is critical. Daily SDK's native dispose can block the main thread for 10+ seconds → ANR risk. Solution: re-entry mutex + touch disabled + 30s watchdog timeout. Always go through `leaveCall` / `rejectCall` / `missedCall` — never `_cleanUpCallClient` directly.
- `_pendingIncomingCall$` is the only externally-mutable reactive state — view-model listens for `null` transitions to close the modal (used by voice commands to tear down without WS round-trip).

### `controllers/call.controller.dart` — HTTP wrapper for call endpoints

- **Mis-named — read this as `CallApiClient`.** Pure HTTP, no state.
- Returns `DataState<T>` (Result/Either pattern). No throwing — errors are values. See `models/response/data_state.dart` and [[Tablet/DataState Pattern]] for the full pattern reference.
- Endpoint inventory: `getCall`, `generateCallToken`, `createCall`, `connectCall`, `missCall`, `rejectCall`, `endCall`, `pingCall`, `searchCalls`. Matches NestJS routes 1:1.
- **`createCall` is a `GET`** despite being a creation. Established contract; don't "fix" without coordinating across web frontend + tablet + backend.
- **`searchCalls` checks for HTTP 201** (NestJS POST default), not 200. If the backend "fixes" to 200, the missed-calls list silently goes empty.
- **No retry logic at this layer** — failures bubble up as `DataError` and the *service* decides what to do. Right separation; means you can't add retries by editing this file alone.
- Auth is automatic (handled by `HttpService`'s interceptor pipeline).

### `services/http.service.dart` — Dio + 4 interceptors

Dio ≈ axios. Four interceptors run in order on the way out:

1. **`_bootstrapInterceptor`** — uses `BehaviorSubject<bool>.firstWhere(true)` to **block requests** until config is loaded. Elegant deadlock avoidance; per-request `extra: { ignoreBootstrapCheck: true }` is the escape hatch (used by `ConfigService.initialize()` itself).
2. **`_tokenInterceptor`** — attaches `Authorization: Bearer <idToken>` from `AuthService`. `ignoreAccessToken: true` opt-out for pre-login endpoints.
3. **`_tokenRefreshInterceptor`** — on 401: refresh Cognito session, retry once. Falls back to full re-auth if refresh fails. `_hasRetried` flag in `extra` prevents infinite loops.
4. **`_internetCheckInterceptor`** — logs response, updates `InternetStatusService.lastCalled`. On connection errors triggers `checkInternetConnection()` (5s timeout) which is what flips the home view-model's "Connection lost" modal.

**Three per-request opt-outs to memorize** (`extra` keys): `ignoreBootstrapCheck`, `ignoreAccessToken`, `ignoreInternetCheck`. Default: all checks on.

`baseUrl` is set lazily after `ConfigService.initialize()`. The bootstrap interceptor re-applies it on every request because Dio captures it onto `RequestOptions` at creation time, not send time.

### `services/auth.service.dart` + `services/cognito.service.dart` — auth

**Unusual model: the tablet *is* the user.** No human login. Hardware-derived `deviceId` is the Cognito username; password is generated, stored in cloud-backed SharedPreferences. JWT carries `custom:platformDeviceId` claim. `isCommonAreaDevice` getter checks for that.

`AuthService` is a thin facade — `idToken`/`accessToken` getters delegate to `CognitoService`. It owns: device ID, app version, app config cache, IAM credentials. The actual auth lives in `CognitoService`.

**First-login dance** (`CognitoService.login`):

1. Try stored password (none) → fall through to temp password `${deviceId}0000000000`.
2. Cognito throws `CognitoUserNewPasswordRequiredException`.
3. Generate strong random password (32 random bytes → sha256 → first 24 chars + `Aa1!` to satisfy complexity rules).
4. `sendNewPasswordRequiredAnswer(newPassword)` → real session.
5. **Only after Cognito confirms** (critical ordering), persist password to `StorageService`.
6. Trigger an immediate Android backup so the password is durable.

**Why SharedPreferences, not FlutterSecureStorage**: Android auto-backup includes SharedPreferences but excludes the Keystore. Tablet password must survive device replacement (warehouse swap → restore from backup → same Cognito identity). Slight security tradeoff for ops durability.

**Self-healing on bad password**: clear stored password, recursively retry login (which falls through to first-login path → new-password challenge → new password). Effectively "tablet forgets itself and re-onboards."

**Two refresh paths**, both matter:

- **Proactive** — `Timer` scheduled 5min before token `exp`. Re-schedules on success.
- **Reactive** — `_tokenRefreshInterceptor` in `http.service.dart` catches 401 → refresh → retry.

**IAM credentials** are a separate flow — two-step Cognito Identity Pool exchange (`GetId` then `GetCredentialsForIdentity`). Used for direct AWS calls (CloudWatch logging). Cached, refreshed 5min before expiry.

### `services/device_status.service.dart` — telemetry + WiFi tier

Two parallel loops:

- **Fast (3s)**: sample WiFi RSSI + link speed → classify into `high/medium/low/audioOnly/disconnected` → emit on `_wifiQualityTier$`. Stream is `.distinct()` — only emits on tier change.
- **Slow (15s)**: gather battery + connectivity + WS state + last 5 WiFi readings + version + `updatePending` → POST to `/device/status`. Doubles as WS keepalive.

**Classification thresholds** ([tablet/lib/models/wifi_quality_tier.dart](../../tablet/lib/models/wifi_quality_tier.dart)):

| Tier | RSSI | Link speed |
|---|---|---|
| `high` | ≥ −60 dBm | ≥ 26 Mbps |
| `medium` | ≥ −70 | ≥ 15 |
| `low` | ≥ −78 | ≥ 10 |
| `audioOnly` | below all of the above | |

(RSSI is dBm, closer to 0 = stronger.)

**Low-battery auto-restart** (line ~143): if battery < 10% and not charging *and* no active call, disable wakelock and restart the app into a low-battery charging mode. Why a restart and not a shutdown? Android has no clean shutdown API without root, which Samsung tablets don't grant. **Active call check is critical** — never interrupt mid-call.

The `wifiReadings` array sent to backend is a 5-sample rolling window — backend gets per-second resolution over the past ~15s, useful for diagnosing call drops.

### `ui/screens/video_call/video_call.view_model.dart` — Daily SDK lifecycle + adaptive quality

- **3 join attempts** with 500ms backoff. `callClient.join()` wrapped in `KioskService.withTouchDisabledTimeoutVoid` (30s watchdog) — same ANR-prevention trick as cleanup.
- **Force speakerphone** (`AudioManager.setDevice(speakerPhone)`) — tablets have no earpiece; default routing leaves call audio inaudible.
- **Subscription profiles**: `base = unsubscribed` (don't burn bandwidth on bystanders), `activeRemote = subscribed` (download the focused participant).
- **Adaptive quality** — subscribes to `DeviceStatusService.wifiQualityTier`, **debounced 5s**, retunes Daily SDK on tier change. Three settings groups updated per tier (each with a 5s timeout):
  1. `updatePublishing` — what we send (bitrate, FPS, encoding scale).
  2. `updateInputs` — capture resolution.
  3. `updateSubscriptionProfiles` — receive `maxQuality`.
- **Audio-only mode** for `audioOnly` tier — disable local camera, unsubscribe from remote camera. Re-enables on tier improvement.
- **Daily SDK quirk**: `frameRate` in input settings is silently ignored at the native layer. Frame rate must go in `maxFrameRate` under publishing settings. Don't "fix" the workaround.
- **`_isConnecting$` deliberately stays `true` after all retries fail** — hides the End Call button while the error dialog shows. UX: don't let the resident hit "End" on a never-connected call.

---

## 7. Cross-cutting gotchas (memorize these)

These are the failure modes most likely to bite you as you ramp up.

### Naming + structure

- **`controllers/*.dart` are HTTP API clients**, not NestJS-style controllers. The genuinely stateful logic lives in `services/*.service.dart`.
- **The `Event` enum on the tablet must match the wire-format strings produced by the backend's `AppEvent` enum.** Backend file: `backend/src/domain/models/common/event.ts` (numeric enum, but emitted via TypeScript's reverse-mapping `AppEvent[AppEvent.X]` to produce the string). No compile-time link. A mismatch = tablet silently ignores events. Do **not** confuse with `backend/src/domain/enums/websocket-event.ts` — that's a different (string) enum used only for `DeviceAlertsChanged` to the operator console. See [[Tablet/WS Contract]].

### Reactivity

- **`BehaviorSubject` seeded values are seen by new subscribers immediately.** Default to `.distinct()` on the public stream getter unless you specifically need every emission.
- **`.takeUntil(unsubscriber.stream)` is the standard cleanup idiom.** Never write a `.listen()` without it on a long-lived service or view-model — you'll leak.

### HTTP

- **Three `extra` opt-outs**: `ignoreBootstrapCheck`, `ignoreAccessToken`, `ignoreInternetCheck`. Default all on.
- **`createCall` is a `GET`** that creates. **`searchCalls` checks for 201.** Established quirks; don't "fix" without coordinating.

### Auth

- **Tablet authenticates as itself** (deviceId = Cognito username). No human login.
- **JWT is in the WS query string** (`?jwt=…`). Token rotation = full WS reconnect.
- **Stored Cognito password is in SharedPreferences** (cloud-backed), not FlutterSecureStorage. Intentional, for cross-device restore.

### Native / kiosk

- **ANR prevention via `KioskService.withTouchDisabledTimeoutVoid`** wraps any blocking native call (Daily `join`/`dispose`). Mandatory pattern.
- **Low battery + no active call = app restart** (silent, by design).
- **Admin commands over WS** can restart, reboot, or sideload APKs — see [[Tablet/Admin Commands]].

### Build / release

- **Build number, not semantic version, drives OTA.** Bump the integer after `+` in `pubspec.yaml`'s `version`. See [[Tablet/Update Strategy]] and [[Tablet/Agent Work Guide]].
- **`*.g.dart` files are codegen.** Run `flutter pub run build_runner build --delete-conflicting-outputs` after editing any `@JsonSerializable` model. Forgetting = silent null fields at runtime.
- **Landscape only.** 1280×800. Don't add portrait-mode layouts.
- **No raw hex colors.** Use `Theme.of(context)` or constants in `lib/config/theme.dart`.
- **No hardcoded pixel values.** Use `FlutterScreenUtil` extensions (`.sp`, `.w`, `.h`, `.r`).

---

## 8. Suggested first-week ramp

1. **Day 1 — get it running.** `flutter run --flavor local -t lib/main.dart` against your local backend. Touch login, watch the home cards. Read `tablet/lib/main.dart` to see what gets registered — that's the module graph.
2. **Day 2 — trace one feature end-to-end.** Incoming call is the richest. Files in order: `realtime.service.dart` → `call.service.dart` → `home.view_model.dart` → `home.view.dart` → `video_call.view_model.dart`.
3. **Day 3 — read `http.service.dart` + `auth.service.dart` + `cognito.service.dart`** as a unit. The auth picture only makes sense seen together.
4. **Day 4 — kiosk + native layer.** `kiosk.service.dart` (Dart) and `KioskManager.java` (Java). See [[Tablet/Kiosk Mode Setup]] / [[Tablet/Kiosk Quick Start]].
5. **Day 5 — make a small change.** Add a field to a card, run `build_runner` if you touch a model, ship a build-number bump per [[Tablet/Update Strategy]].

---

## 9. What's NOT in this doc

This doc covers the architectural spine. For specific subsystems, go to:

- [[Tablet/Domain - Calls]] — call domain ownership, change patterns.
- [[Tablet/Domain - Chat]] — conversation/chat.
- [[Tablet/Domain - Kiosk]] — kiosk lockdown specifics.
- [[Tablet/Admin Commands]] — admin command details, payload shapes.
- [[Tablet/Update Strategy]] — OTA strategy, build-number rules.
- [[Tablet/Kiosk Mode Setup]] / [[Tablet/Kiosk Quick Start]] — provisioning a tablet.
- [[Tablet/High Level Overview]] — file-tree-level reference.
- [[Tablet/Agent Work Guide]] — change recipes + done checklist for AI agents.

For commands and tooling: [[Agent Tools]], [[Agent Verification Matrix]], and the `tablet-logs` / `release-build` skills under `tablet/.claude/skills/`.
