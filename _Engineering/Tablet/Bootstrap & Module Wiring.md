---
type: reference
tags: [tablet, bootstrap, lifecycle]
owner: Mike
updated: 2026-05-06
status: current
---
# Tablet — Bootstrap & Module Wiring

What happens between the tablet powering on and the home screen rendering. Sister doc to [[Tablet/Onboarding Walkthrough]].

> **Bottom line:** [tablet/lib/main.dart](../../tablet/lib/main.dart) is the entire bootstrap. There is no `GetIt` registration block — every service is a module-singleton instantiated lazily on first call. `main.dart`'s job is to *kick off* services in the right order, not register them.

---

## 1. Entry point — `main()`

```dart
void main() {
  CloudWatchService.captureOutput(() async {
    // ... everything happens inside the captureOutput zone
  });
}
```

The very first thing that happens: **everything inside `captureOutput`'s callback runs inside a Dart `Zone` that intercepts every `print()` and queues it to CloudWatch.** This means literally all `print(...)` calls in the app become structured CloudWatch log entries (subject to the queue/batching in `cloudwatch.service.dart`). See [[Tablet/Logging Stack]] for the queue mechanics.

Implication for SME: if you grep CloudWatch logs and see a `print` line, *every* file's `print(...)` is a candidate source. You can use the line prefix (e.g., `HEYLO:`, `KIOSK:`, `CALL_SERVICE:`) to narrow it.

---

## 2. Bootstrap sequence

In order, top-to-bottom of `main()`:

| Step | What happens | Why |
|---|---|---|
| 1 | `WidgetsFlutterBinding.ensureInitialized()` | Required before any platform channel calls. |
| 2 | `Firebase.initializeApp()` + `FlutterError.onError` + `PlatformDispatcher.instance.onError` | Crashlytics setup. Must be first so crashes during the rest of bootstrap are captured. Wrapped in try/catch — if Firebase fails, app continues without crash reporting. |
| 3 | **Battery gate** — read `Battery().batteryLevel`. If under `DeviceStatusService.lowBatteryThreshold` (10%), show `_ChargingScreen` and *block* the rest of bootstrap until battery recovers. | Prevents a boot loop where the kiosk drains faster than the charger supplies on a near-dead tablet. Critical for resident UX. |
| 4 | `_setup()` — the main initialization function | Returns the `MyApp` widget. |
| 5 | Set fatal-error handlers (`FlutterError.onError`, `PlatformDispatcher.instance.onError`) for **post-startup** errors → show `_ErrorScreen` | After this, fatal errors put the resident on a "Restart App" screen rather than crashing silently. |
| 6 | `runApp(myApp)` | First widget tree mounted. |

The battery gate (step 3) is especially worth understanding — see §6.

---

## 3. `_setup()` — the heavy lift

This is where the bulk of initialization happens. Approximate order:

```
_setup() {
  SystemChrome.setEnabledSystemUIMode(manual, overlays: [])
       └─ hides system nav/status bar at the framework level

  KioskService.isDeviceOwner()              ← platform channel, retried 2x with 10s timeout
  
  if (isDeviceOwner) {
    KioskService.setupFullKioskMode()
    KioskService.disableBatteryOptimization()
    KioskService.enableBatteryProtection()           ← Samsung 80% cap
    SystemUpdatePolicyService.initialize()           ← block OS updates during work hours
    KioskService.autoGrantRuntimePermissions()       ← camera/mic granted via Device Owner
    KioskService.startWatchdogService()              ← native foreground service
  } else {
    KioskService.enableImmersiveMode()               ← weaker, no Device Admin needed
  }

  AuthService.getVersionInfo()              ← reads pubspec.yaml's "X.Y.Z+N" via PackageInfo

  InternetStatusService.checkInternetConnection()

  if (isInternetAvailable) {
    AuthService.authenticate()              ← Cognito login as deviceId, retried 2x
    if (isLoggedIn) {
      UserService.getUserProfile()
      CloudWatchService.initialize()        ← log stream named "{agencyId}/{deviceId}"
      WaypointService.log(appStarted)
      FirebaseCrashlytics.setUserIdentifier(deviceId)
      _initializeWebSocket()                ← retried 3x w/ 5s delay; falls back to 30s background timer
    }
  }

  ScreenUtil.ensureScreenSize()             ← FlutterScreenUtil for 1280×800 landscape
  WakelockPlus.enable()                     ← screen-on for active engagement
  ScreenDimService.initialize()             ← 5-min idle dim wrapper

  if (isLoggedIn) {
    VoiceCommandService.initialize()        ← STT + TTS (initially DISABLED until 4-tap gesture)
  }

  return MyApp(initialRoute: home/login/connectivity);
}
```

**Critical ordering** (don't reorder without understanding why):

- Kiosk setup **before** auth — the Device Owner privileges are needed to auto-grant camera/mic permissions which Cognito flows depend on.
- Internet check **before** auth — auth would hang otherwise.
- `UserService.getUserProfile()` **after** authenticate — needs the JWT.
- `CloudWatchService.initialize()` **after** `getUserProfile` — needs the agencyId from the JWT to construct the log stream name.
- `_initializeWebSocket()` **after** CloudWatch — so any WS errors during init are captured.
- `VoiceCommandService.initialize()` **only if logged in** — voice commands are a logged-in-user feature.

---

## 4. `_initWithRetry` — the universal hardening wrapper

Almost every platform channel call in `_setup()` is wrapped in `_initWithRetry`:

```dart
await _initWithRetry(
  name: "KioskService.setupFullKioskMode",
  action: () async => await KioskService.setupFullKioskMode(),
  maxRetries: 2,
  timeout: const Duration(seconds: 10),
);
```

What it does:

- Runs the action with a configurable timeout (default 5s, often 10–15s in practice).
- On `TimeoutException` or any `catch (e)`: brief 500ms delay, retry up to `maxRetries`.
- On final failure: prints "failed after N attempts - continuing anyway" and **does not throw**.

The "continuing anyway" behavior is deliberate. Native plugin calls can hang during boot if Android services aren't ready yet — and a hung bootstrap = bricked tablet. Better to start the app with degraded capability (e.g., kiosk mode not enabled) than not start at all.

In TS terms: it's an `await Promise.race([action(), timeout(N)])` with retry semantics, swallowing the final error.

If you add a new platform channel call in `_setup()`, **wrap it in `_initWithRetry`**. Direct `await` of a native call is a foot-gun.

---

## 5. WebSocket initialization (`_initializeWebSocket`)

Special-cased — not wrapped in `_initWithRetry` because it has its own retry strategy:

1. Up to 3 attempts at `RealtimeService().init()` → `establishWebsocketConnection()` with 10s timeout each, 5s between.
2. If all 3 fail, **don't block bootstrap** — start a 30s `Timer.periodic` that keeps trying in the background.
3. The timer cancels itself once WebSocket succeeds.

So WS connectivity isn't a startup blocker. The home screen loads even if WS is broken — the resident just won't receive realtime events until the background retry succeeds. Defensive design for sites with flaky WiFi at startup.

See [[Tablet/Onboarding Walkthrough]] §6 (RealtimeService digest) for the in-session reconnect logic that takes over once initial connection succeeds.

---

## 6. The battery gate (`_ChargingScreen` flow)

Worth understanding deeply because it can confuse SMEs debugging "tablet won't start."

### Trigger

Any time `main()` runs (cold boot or app restart), if `Battery().batteryLevel < 10` AND the tablet is not already charging.

### What happens

1. Kiosk mode is still set up (so the device is locked even on the charging screen — prevents tampering with a near-dead unit).
2. `WakelockPlus` is toggled based on charging state: enabled if charging (so resident can see "battery: 8%" updating), disabled otherwise (preserve every milliwatt).
3. `runApp(_ChargingScreen)` mounts a black screen with a battery icon and percentage.
4. A `Battery.onBatteryStateChanged` listener watches for level recovery to ≥ 10%.
5. **When the listener triggers screen-on for the charging case, it forces brightness to 1.0** (`ScreenBrightness().setScreenBrightness(1.0)`) because `WakelockPlus` only prevents sleep — it doesn't *wake* a dimmed screen.
6. Once recovered, the gate's `Completer` resolves and the rest of `main()` proceeds normally.

### Why this exists

Without the gate, on a 5% battery, the kiosk's screen-on + WiFi + Cognito polling would drain faster than a 1A wall charger could fill, even if plugged in. App would reboot, drain, reboot, drain, ad infinitum. The gate breaks that loop.

### SME debug tips

- If you see a tablet stuck on "Battery Too Low" when it's plugged in: check the charger amperage (cheap chargers don't deliver enough). Battery percentage should be visibly increasing.
- If you see a tablet stuck on the gate but it's actually charging: there's a known Samsung bug where `BatteryState.charging` doesn't fire reliably. Force-restart usually clears it.

---

## 7. `MyApp` — the widget tree

After `_setup()` returns, `runApp(MyApp(initialRoute))` mounts:

```dart
MaterialApp
  └─ navigatorObservers: [RouterService()]
  └─ navigatorKey: RouterService().navigatorKey
  └─ onGenerateRoute: RouterService.routes
  └─ builder: ScreenDimWrapper > KioskExitGestureWrapper > Stack(child, VoiceCommandIndicator)
```

Three globally-mounted wrappers, in this order:

1. **`ScreenDimWrapper`** — outermost. Tracks taps; dims the screen after 5min idle. Tap anywhere to wake.
2. **`KioskExitGestureWrapper`** — listens for the 5-tap escape gesture on the top-right corner; opens PIN dialog (`2650`).
3. **`UpdateNotificationWrapper`** — wraps the entire `MaterialApp`; surfaces APK update progress UI when applicable.
4. **`VoiceCommandIndicator`** in a `Stack` overlay — small mic indicator, listens to `VoiceCommandService.onStateChanged`.

The initial route is decided at the bottom of `_setup()`:

```
isInternetAvailable
  ? isLoggedIn ? Routes.home : Routes.login
  : Routes.connectivity
```

Three legitimate startup destinations. The connectivity route is shown when no internet — a different screen with a "retry" button, distinct from the main login.

---

## 8. The "no DI container" reality

A common React/TS-flavored question is "where's the dependency injection?" Short answer: **there isn't one**. Heylo's Flutter codebase uses module-singleton pattern across the board:

```dart
class CallService {
  static final CallService _instance = CallService._internal();
  factory CallService() => _instance;
  CallService._internal();
}
```

`CallService()` looks like a constructor but always returns the same instance. Every consumer just calls `CallService()` — no provider, no `GetIt.instance<>`, no React Context.

The High Level Overview mentions `GetIt` — **that is aspirational/legacy from an older architectural plan**. The current codebase uses `get_it` only as a transitive dependency, not as a DI container. If you read older docs that talk about `GetIt.instance<X>()`, mentally replace it with `X()`.

### Why no DI?

Pragmatic reasons:

- Singletons are stateful by design (call lifecycle, WebSocket connection, Cognito session). A DI container with scoped lifetimes adds complexity without payoff.
- Testing — Flutter integration tests run against the real services. Unit tests are sparse. So mock-injection isn't a felt need.
- The module-singleton pattern is well-understood by every Dart dev; `GetIt` would be a learning-curve tax for new engineers.

If you ever want testability that requires mocking a service: replace the `factory` with a setter that allows swapping the singleton in tests. Don't add a DI container.

---

## 9. Bootstrap timing — where things slow down

If a tablet takes >10s from power-on to home screen, the suspects in order of likelihood:

1. **`AuthService.authenticate()`** — Cognito network round trip + token storage; can be 3–5s on slow WiFi.
2. **`KioskService.setupFullKioskMode()`** — Samsung devices in particular can take 2–3s to apply Device Owner policies.
3. **`Firebase.initializeApp()`** — initializes Crashlytics; 1–2s typically.
4. **`_initializeWebSocket()`** — 1s if happy, up to 15s if all 3 retries hit timeouts before falling back to background retry.
5. **`UserService.getUserProfile()`** — same network round trip as authenticate.

Total happy-path bootstrap is ~5–8s on a good network. Anything >15s suggests a real problem.

If you're optimizing bootstrap: parallelizing `authenticate` and the post-kiosk-setup steps would save ~2s, but is risky because `disableBatteryOptimization` and `setupFullKioskMode` can affect network stack timing on Samsung. Don't refactor lightly.

---

## 10. SME-worth gotchas

- **`captureOutput` zone interception**: every `print` becomes a CloudWatch event. If you add noisy diagnostic logging, it ships to AWS by default. Use selective filtering (the `tablet-status` request log is filtered in `http.service.dart` for this reason).
- **Crashlytics device context** is set inside `_setup()` (line ~632) using `deviceId` and `agencyId` from `AuthService` and `UserService`. New crash dimensions should be added there.
- **`isLoggedIn = false` if profile fetch fails** — even if `authenticate()` succeeded (line ~610). The login screen is shown when the profile call fails after auth. This is an SME-relevant edge case for "I logged in but it kicked me back to login."
- **The watchdog timer for WebSocket retry has a guard** (`if (_webSocketRetryTimer != null) return;`) — prevents stacking duplicate timers if `_initializeWebSocket` is called twice during a weird re-entry path.
- **`runZonedGuarded` swallows uncaught async exceptions** — they're printed (and thus shipped to CloudWatch) but the app does *not* crash to the error screen for those. The error screen only fires for `FlutterError.onError` and `PlatformDispatcher.onError` after `runApp` is called.
- **Clock drift can break Cognito on first-boot tablets** — if the Android clock is wildly wrong (unset on a fresh device), Cognito JWT validation fails. The bootstrap doesn't currently sync time before auth; a manual time-set step is part of [[Tablet/Kiosk Mode Setup]].

---

## How this connects to other docs

- [[Tablet/Onboarding Walkthrough]] §5 — the in-session feature trace (incoming call) picks up where bootstrap leaves off.
- [[Tablet/Kiosk Service Reference]] — the platform channel surface invoked from `_setup()`.
- [[Tablet/Logging Stack]] — what `CloudWatchService.captureOutput` actually does inside.
- [[Tablet/Voice Commands]] — what `VoiceCommandService.initialize()` does once the resident triggers the activation gesture.
- [[Tablet/Domain - Kiosk]] — the broader provisioning context that determines whether `isDeviceOwner()` returns true.
