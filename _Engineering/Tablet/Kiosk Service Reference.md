---
type: reference
tags: [tablet, kiosk, native, platform-channel]
owner: Mike
updated: 2026-05-06
status: current
---
# Tablet — Kiosk Service Reference

Complete surface of `tablet/lib/services/kiosk.service.dart` — the Dart wrapper around the native Android kiosk operations. This is the OS abstraction layer; understanding it is essential SME-level knowledge because it appears in ~10 Dart files plus the bootstrap. Sister doc to [[Tablet/Domain - Kiosk]] (which covers the broader kiosk concept) and [[Tablet/Bootstrap & Module Wiring]] (which calls these methods at startup).

> **Bottom line:** every method here invokes a native Java method via `MethodChannel('com.heylo.app/kiosk')` on `tablet/android/.../KioskManager.java` (and siblings). `static` methods on the Dart class — no instance state. Most return `Future<bool>`, `Future<void>`, `Future<String>`, or `Future<Map<String, dynamic>?>`.

---

## 1. Architecture

```
┌─────────────────────────────────────────┐
│ Dart side                               │
│ KioskService (static methods)           │
│   ├─ MethodChannel('com.heylo.app/kiosk')
│   └─ swallows PlatformException         │
└──────────────┬──────────────────────────┘
               │ invokeMethod('name', args)
               ▼
┌─────────────────────────────────────────┐
│ Android Java side                       │
│ MainActivity.configureFlutterEngine     │
│   └─ MethodChannel handler              │
│       └─ KioskManager.java (Device Admin)
│       └─ KioskWatchdogService.java      │
│       └─ ApkInstallReceiver.java        │
│       └─ BootReceiver.java              │
└─────────────────────────────────────────┘
```

The Dart `KioskService` class is **stateless** — it's a thin wrapper that turns method invocations into `MethodChannel.invokeMethod` calls. State (e.g., "is kiosk mode currently active?") lives on the Android side and is queried via `isInKioskMode()`.

---

## 2. Method surface, grouped by purpose

### Lock-task / kiosk mode

| Method | What it does | Requires Device Owner? |
|---|---|---|
| `isDeviceOwner()` | Check provisioning status | No |
| `enterKioskMode()` | `startLockTask()` | Yes |
| `exitKioskMode()` | `stopLockTask()` | Yes |
| `isInKioskMode()` | Query current state | No |
| `setupFullKioskMode()` | Hide system apps + disable status bar + immersive + lock task — convenience wrapper. Skips redundant calls if `enterLockTaskEarly` already ran in `MainActivity.onCreate`. | Yes |
| `teardownKioskMode()` | Reverse the above | Yes |
| `enableImmersiveMode()` | Hide system UI overlays (works without Device Owner — weaker) | No |
| `hideSystemApps()` / `showSystemApps()` | Hide Settings, Chrome, etc. from the launcher | Yes |
| `disableStatusBar()` / `enableStatusBar()` | Notification panel suppression | Yes |
| `getDeviceOwnerInfo()` | Returns formatted debug string | No |

### Permissions

| Method | What it does |
|---|---|
| `autoGrantRuntimePermissions()` | Auto-grants camera + microphone via Device Owner privilege. Used at bootstrap so first call/voice-command doesn't trigger system prompt. |

### System updates (Android OS, not the Heylo APK)

| Method | What it does |
|---|---|
| `postponeSystemUpdates()` | Block OS updates for up to 30 days |
| `setSystemUpdateWindow(startMin, endMin)` | Allow OS updates only between minutes-from-midnight (e.g., 120, 300 = 2am–5am) |
| `allowAutomaticSystemUpdates()` | Restore default Android auto-update |
| `removeSystemUpdatePolicy()` | Clear all policy |
| `getSystemUpdatePolicyInfo()` | Returns formatted debug string |

These are managed at startup via `services/system_update_policy.service.dart` (called in `_setup()`).

### Battery

| Method | What it does |
|---|---|
| `isBatteryOptimizationDisabled()` | Query Doze Mode exemption |
| `disableBatteryOptimization()` | Exempt Heylo from Doze Mode (called in bootstrap) |
| `getBatteryOptimizationInfo()` | Debug string |
| `enableBatteryProtection()` | Samsung-specific 80% charge cap (extends battery lifespan over years) |

### App lifecycle

| Method | What it does |
|---|---|
| `restartApp()` | Flushes CloudWatch (2s grace), exits kiosk mode briefly, kills + relaunches process. **Logs stack trace** so unintended restarts can be traced. |
| `rebootDevice()` | Full Android reboot. **Requires Device Owner + Android 7.0+.** Used by `admin_command: reboot`. |

### Hardware identifiers

| Method | What it does |
|---|---|
| `getHardwareId()` (called from `auth.service.dart`) | Returns a deterministic hardware-derived ID. Hashed to 11 chars and used as the Cognito username (deviceId). Survives factory resets. |

### Watchdog service

| Method | What it does |
|---|---|
| `startWatchdogService()` | Starts the sticky foreground `KioskWatchdogService` — relaunches the app if it gets killed |
| `stopWatchdogService()` | Stops it (with 2s delay so the stop-intent is fully processed) |

### WiFi

| Method | What it does |
|---|---|
| `getWifiInfo()` | Returns `{ rssi: int, linkSpeed: int, frequency: int? }` or null if not on WiFi. Polled every 3s by `device_status.service.dart` — feeds the `WifiQualityTier` classification used by the video call adaptive quality system. |

### Audio (called from voice commands and video calls)

| Method | What it does |
|---|---|
| `muteBeep()` | Mute `STREAM_NOTIFICATION` to suppress the SpeechRecognizer startup beep when voice command listening starts |
| `unmuteBeep()` | Restore notification stream volume |
| `ensureTtsVolume()` | Bring `STREAM_MUSIC` to audible level so `flutter_tts` playback is hearable |
| `getAudioDiagnostics()` | Snapshot of all stream volumes + routing mode. **Used to debug "can't hear" reports** on video calls. Returns a `Map<String, dynamic>` of stream states. |

### Touch input control (the ANR-prevention surface)

This is the most-consequential pattern in the file. Daily SDK's native `join()` and `dispose()` can block the main thread for 10+ seconds on weak networks. Android triggers an ANR ("Application Not Responding") dialog if input events queue for ~5s. On a kiosk tablet, that ANR dialog is catastrophic.

| Method | What it does |
|---|---|
| `disableWindowTouch()` | Disable touch input. With touch off, no input events queue → no ANR. |
| `enableWindowTouch()` | Re-enable touch. |
| `withTouchDisabledTimeout<T>(operation, {timeout, operationName})` | Run `operation`, return its `T` value. Timeout watchdog + automatic `enableWindowTouch` in `finally`. **Always re-enables touch even if op throws.** |
| `withTouchDisabledTimeoutVoid(operation, {timeout, operationName})` | Same, for `Future<void>`. |

**Use these wrappers any time you call a blocking native operation.** Specifically:

- `CallService._cleanUpCallClient` wraps `callClient.setInputsEnabled` + `callClient.dispose`.
- `VideoCallViewModel.init` wraps `callClient.join`.
- New code that calls into Daily SDK or any other potentially-slow native should wrap similarly.

In TS terms: `Promise.race([op, timeout])` with try/finally guaranteeing cleanup.

### APK install (the OTA / admin-command surface)

| Method | What it does |
|---|---|
| `installApkFromUrl(url)` | Download an APK from S3 and install it. **The most complex method in the file (~130 lines).** |

Flow inside `installApkFromUrl`:

1. Parse the S3 URL — supports `https://bucket.s3.amazonaws.com/key`, `https://bucket.s3.region.amazonaws.com/key`, `https://s3.amazonaws.com/bucket/key`, and `s3://bucket/key`.
2. Get IAM credentials via `AuthService().getIAMCredentials()` (the parallel auth flow that swaps the Cognito JWT for AWS creds).
3. Sign the request with AWS SigV4 (`aws_signature_v4` package).
4. Stream-download the APK to `getTemporaryDirectory()/update.apk` with progress logged every 10%. 10-minute timeout.
5. Verify the file exists and is non-empty.
6. Invoke native `installApkFromFile` via MethodChannel — handed off to `ApkInstallReceiver.java` which uses `PackageInstaller` for silent install.
7. Returns `bool` for success. **App will restart automatically** when install completes (managed by Android, not by this method).

Used by:

- `admin_command: update-sideload` (in `realtime.service.dart`) — emergency hotfix path.
- `update.service.dart` (the polling-based normal-OTA path).

---

## 3. Constants

```dart
static const MethodChannel _channel = MethodChannel("com.heylo.app/kiosk");
static const String kioskExitPin = "2650";
```

The escape PIN is **hardcoded in this file**. Changing it requires:

1. Update `kioskExitPin` here.
2. Update the matching docs ([[Tablet/Kiosk Mode Setup]], [[Tablet/Domain - Kiosk]] gotchas).
3. Notify ops that all deployed tablets need the new PIN known to field staff.
4. Bump the build number for OTA push.

---

## 4. Error handling pattern

Every method follows the same skeleton:

```dart
static Future<bool> someOperation() async {
  try {
    final bool result = await _channel.invokeMethod("someOperation");
    print("KIOSK: someOperation succeeded");
    return result;
  } on PlatformException catch (e) {
    print("KIOSK: Failed: ${e.message}");
    rethrow;     // ← OR return false, depending on the method
  } catch (e) {
    print("KIOSK: Error: $e");
    return false;
  }
}
```

Two patterns coexist:

- **Critical operations** (kiosk mode, system apps, status bar, system updates) `rethrow` `PlatformException`. Callers can distinguish "wrong privilege level" from "actual failure."
- **Best-effort operations** (audio, touch, getters) swallow all errors and return a sensible default. Their failure shouldn't crash the caller.

If you add a new method, mirror the closest existing example — don't pick a third pattern.

---

## 5. Methods that log stack traces

Three methods deliberately print their stack trace at invocation:

```dart
exitKioskMode()      // line 56
restartApp()         // line 318
teardownKioskMode()  // line 433
```

Why: these are "destructive" operations that should be rare. If the tablet exits kiosk or restarts unexpectedly, the stack trace in CloudWatch shows *who* triggered it. Useful for debugging "tablet keeps rebooting" reports.

The pattern is `StackTrace.current` → take first 10 frames → print. If you add a similar destructive method, copy the pattern.

---

## 6. Java-side files invoked

For the Dart-only SME, you don't strictly need to read the Java side — but knowing what's there helps when behavior surprises you. All under `tablet/android/app/src/main/java/com/heylo/app/heylo/`:

| File | Purpose |
|---|---|
| `MainActivity.java` | Flutter `FlutterActivity` subclass. Registers the `MethodChannel` handlers. Implements `enterLockTaskEarly` in `onCreate` to lock down before Flutter even initializes (Samsung deadlock workaround). |
| `KioskManager.java` | Device Admin core. Implements `startLockTask`, `setStatusBarDisabled`, `setKeyguardDisabled`, `setUserRestriction`, system app hiding, etc. Uses `DevicePolicyManager`. |
| `AppDeviceAdminReceiver.java` | `DeviceAdminReceiver` subclass. Handles admin activation/deactivation lifecycle events. |
| `KioskWatchdogService.java` | Sticky foreground `Service`. Posts a delayed runnable that checks if `MainActivity` is in foreground; broadcasts an intent to relaunch if not. Cannot be removed by Android memory pressure. |
| `BootReceiver.java` | `BroadcastReceiver` for `BOOT_COMPLETED`. Starts `MainActivity` after device reboot. Requires `RECEIVE_BOOT_COMPLETED` permission. |
| `ApkInstallReceiver.java` | Handles `MY_PACKAGE_REPLACED` broadcast (and `installApkFromFile` invocation). Uses `PackageInstaller` for silent install. |
| `ShutdownReceiver.java` | Graceful shutdown handling before power-off. |
| `PackageReplacedReceiver.java` | Confirms successful APK install + signals back to Dart via Event Channel. |

If a Dart `KioskService` method behaves wrong, the bug is almost certainly in one of these Java files. The Dart side is too thin to harbor real logic.

---

## 7. SME-worth gotchas

- **`MethodChannel` calls are async even when they look sync** — every method here is `Future<...>`. Don't try to call from a synchronous code path.
- **Some methods require Device Owner; others don't.** If `isDeviceOwner()` is false (development on a non-provisioned device), Device Owner methods throw `PlatformException`. The bootstrap branches on this — see [[Tablet/Bootstrap & Module Wiring]] §3.
- **`enterLockTaskEarly` is a thing** — `MainActivity.onCreate()` calls native lock-task entry **before Flutter initializes**. This prevents a Samsung-specific deadlock where the boot-time kiosk setup race-conditions with the launcher. `setupFullKioskMode` checks for this state to avoid duplicate calls.
- **`restartApp` flushes CloudWatch + 2s delay**. Without that, recent log entries can be lost on the restart. If you call `restartApp` from a code path that just emitted important diagnostics, make sure the flush completes — it's awaited inside the method.
- **`installApkFromUrl` uses IAM creds, not the JWT.** The S3 bucket is locked down to specific IAM policies; the tablet's Cognito Identity Pool exchange (in `auth.service.dart`) provides the temp creds. If S3 access fails, check the Cognito Identity Pool's IAM policy first.
- **`getWifiInfo` returns null on cellular or no-network** — not just "couldn't read." The `device_status.service.dart` consumer treats null as `WifiQualityTier.disconnected`.
- **`getAudioDiagnostics` is your friend on "can't hear" tickets.** Run it during an active call (via a debug build or a remote debug sideload) to see the actual stream volumes + routing mode at the moment audio was supposed to play.
- **`disableWindowTouch` + watchdog timeout pattern is mandatory** for Daily SDK calls. Without it, ANR risk during cleanup or join. `withTouchDisabledTimeoutVoid` is the convenience wrapper — use it.
- **The PIN `2650` is in this file** — and only this file (Dart side). Java doesn't validate it; the Dart `kiosk_exit_dialog/` widget compares against this constant. Trivial to bypass if attacker has the APK + IDE — the kiosk model assumes physical custody, not cryptographic security.

---

## 8. Adding a new platform channel method

Recipe:

1. **Java side** (`MainActivity.java` or split into a helper):
   ```java
   case "myNewMethod":
     // ... do native work ...
     result.success(returnValue);  // or result.error("CODE", "msg", details)
     break;
   ```
2. **Dart side** (`kiosk.service.dart`):
   ```dart
   static Future<T> myNewMethod() async {
     try {
       return await _channel.invokeMethod("myNewMethod");
     } catch (e) {
       print("KIOSK: Error in myNewMethod: $e");
       rethrow;  // or return default
     }
   }
   ```
3. **Method name string must match exactly** between Dart and Java. Renaming requires both sides updated atomically.
4. If the operation is potentially blocking (Daily SDK, slow native I/O, etc.), wrap callers in `withTouchDisabledTimeoutVoid`.
5. Test on a real tablet — emulator behavior often diverges (Device Admin APIs, audio routing, kiosk lock-task all behave differently).

---

## 9. Where this connects

- [[Tablet/Bootstrap & Module Wiring]] §3 — order in which these methods are called at startup.
- [[Tablet/Domain - Kiosk]] — the kiosk concept at the product level.
- [[Tablet/Onboarding Walkthrough]] §6 (VideoCallViewModel) — `withTouchDisabledTimeoutVoid` usage during Daily join/dispose.
- [[Tablet/Admin Commands]] — the `restart`, `reboot`, `update-sideload` commands all eventually call methods here.
- [[Tablet/Kiosk Mode Setup]] / [[Tablet/Kiosk Quick Start]] — provisioning steps that determine `isDeviceOwner()`.
- [[Tablet/Logging Stack]] — `getAudioDiagnostics` output format.
