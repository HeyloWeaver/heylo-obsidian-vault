---
type: reference
tags: [tablet, native, java, android, kiosk]
owner: Mike
updated: 2026-05-07
status: current
---
# Tablet — Native Layer (Java)

The Android Java side of the tablet app. Sister doc to [[Tablet/Kiosk Service Reference]] (which documents the Dart wrapper). This doc explains what each Java file does and the patterns / pitfalls specific to the Android side.

> **Bottom line:** `tablet/android/.../` has 8 Java files. **`KioskManager.java`** (1442 lines) does almost everything substantive. The rest are receivers and one foreground service. If a kiosk-related bug behaves differently from how the Dart layer expected, the answer is almost always in `KioskManager.java`.

---

## 1. File inventory

```
tablet/android/app/src/main/java/com/heylo/app/heylo/
├── MainActivity.java               (378 lines) — Flutter entry, MethodChannel handlers
├── KioskManager.java              (1442 lines) — All kiosk operations + APK install
├── KioskWatchdogService.java       (322 lines) — Foreground service: relaunch app if killed
├── AppDeviceAdminReceiver.java      (45 lines) — Device Admin lifecycle callbacks
├── BootReceiver.java                (40 lines) — Auto-start on boot
├── PackageReplacedReceiver.java     (35 lines) — Auto-start after APK update
├── ApkInstallReceiver.java          (60 lines) — PackageInstaller status callback
└── ShutdownReceiver.java            (60 lines) — Graceful shutdown cleanup
```

The first three are the heavy hitters. The receivers are short and single-purpose.

---

## 2. `MainActivity.java` — the bridge

`FlutterActivity` subclass. Responsibilities:

### `onCreate` — boot ordering (lines 21-42)

Two operations happen before `super.onCreate(savedInstanceState)`:

```java
// 1. Disable PairIP license check — must run before anything else
kioskManager = new KioskManager(this);
kioskManager.disablePairIpLicenseCheck();

super.onCreate(savedInstanceState);

// 2. Enter lock task mode immediately if device owner
if (kioskManager.isDeviceOwner()) {
    kioskManager.enterLockTaskEarly();
}
```

**Why both happen so early:**

- **PairIP** is Google Play's "Automatic integrity protection" license activity, added invisibly to APKs uploaded via Play Console. If it runs before we disable it, it can launch and kill the app. Disabling **must** be the first line of code that runs.
- **`enterLockTaskEarly`** prevents the **Samsung boot deadlock**. On Samsung devices, if the device-owner app doesn't re-enter lock task mode promptly after reboot, Android's boot timeout can hang. Flutter initialization takes seconds; calling `startLockTask()` before Flutter starts breaks the deadlock. The full kiosk setup happens later via Dart `KioskService.setupFullKioskMode()`.

This is one of the few cases where **Java code runs before any Dart code**. Most Java side is invoked *from* Dart via MethodChannel.

### `configureFlutterEngine` — MethodChannel handlers (lines 44-342)

Three channels registered:

| Channel name | Methods |
|---|---|
| `com.heylo.app/config` | `getConfig` — returns `BuildConfig.*` constants (API_BASE_URL, Cognito IDs) |
| `com.heylo.app/device` | `getHardwareId`, `requestBackup` |
| `com.heylo.app/kiosk` | 30+ kiosk operations — see [[Tablet/Kiosk Service Reference]] |

When you add a new platform channel method, **the dispatch happens in this `switch` block** (lines 100-340). Each case calls into `kioskManager` (or other helpers) and translates the result.

### `onResume` — re-applies immersive mode (lines 344-350)

When the app comes back to foreground (after permission dialog, after Daily SDK shows native UI, etc.), reapply the system UI hide flags. Without this, swiping from the top would leave the status bar permanently visible.

### `restartApp` (lines 354-376)

Inline implementation — different from `KioskManager.restartApp` (which doesn't exist; the Dart-side `KioskService.restartApp` calls into this). Steps:

1. Exit kiosk mode (so Android allows the new activity to start).
2. Build a new MainActivity intent with `FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_CLEAR_TASK`.
3. Start the new activity.
4. `finish()` current activity.
5. `Process.killProcess(myPid())` for clean restart.

Subtle: if `killProcess` fails (rare), the old + new activities can both be running briefly. Hence `FLAG_ACTIVITY_CLEAR_TASK` on the new one.

---

## 3. `KioskManager.java` — the operations layer

The bulk of native logic. Everything in [[Tablet/Kiosk Service Reference]] §2 has its implementation here. Key subsystems:

### Device Admin operations

`devicePolicyManager` is the Android `DevicePolicyManager`. `adminComponent` is a `ComponentName` pointing at `AppDeviceAdminReceiver`. Most kiosk methods use these two together:

```java
devicePolicyManager.setLockTaskPackages(adminComponent, packages);
devicePolicyManager.setKeyguardDisabled(adminComponent, true);
devicePolicyManager.setStatusBarDisabled(adminComponent, true);
devicePolicyManager.setApplicationHidden(adminComponent, packageName, true);
devicePolicyManager.setSystemUpdatePolicy(adminComponent, policy);
devicePolicyManager.setPermissionGrantState(adminComponent, packageName, perm, GRANTED);
devicePolicyManager.setSecureSetting(adminComponent, key, value);
devicePolicyManager.setGlobalSetting(adminComponent, key, value);
```

All of these throw `SecurityException` if the app isn't device owner. Hence the `if (!isDeviceOwner())` guards on every method.

### `disablePairIpLicenseCheck` (lines 60-99)

Disables the `com.pairip.licensecheck.LicenseActivity` component so it can't be launched. Three branches:

- Already disabled: log + return true.
- Disabled successfully: log + return true.
- `IllegalArgumentException`: component doesn't exist → no PairIP protection on this build → return true.
- Any other exception: false.

The `IllegalArgumentException` branch is important — debug builds and locally-compiled APKs don't have PairIP. Returning false here would (incorrectly) report a problem.

### `enterLockTaskEarly` vs `enterKioskMode` (lines 122-211)

Two methods that both call `startLockTask()`. Difference:

- **`enterLockTaskEarly`** is a *minimal* version: set lock-task packages, disable keyguard, start lock task. Done.
- **`enterKioskMode`** also enables immersive mode, sets `FLAG_KEEP_SCREEN_ON`, and is intended to run after Flutter is fully up.

`enterLockTaskEarly` runs in `MainActivity.onCreate` to break the Samsung deadlock. `enterKioskMode` runs later via Dart `KioskService.setupFullKioskMode`. The Dart code checks `isInKioskMode()` to avoid double-calling.

### Battery handling (lines 584-849)

Multiple methods, designed to handle Samsung quirks:

- **`disableBatteryOptimization`** — exempts `com.heylo.app` AND `com.android.vending` (Play Store) from Doze Mode. Three methods tried in sequence: application restrictions clearing, package suspension toggle, power manager whitelist check. At least one usually succeeds.
- **`enableBatteryProtection`** — Samsung-specific 80% charge cap via `setGlobalSetting("protect_battery", "1")`. Plus `battery_protection_recharge_level = 79` so the tablet starts charging again at 79%. **Skipped on non-Samsung devices** — checks `Build.MANUFACTURER` first.

The Samsung 80% cap exists because tablets are deployed on chargers 24/7. Holding at 100% for years degrades the battery quickly; capping at 80% extends usable lifespan dramatically.

### Audio control (lines 861-938)

Three small methods invoked by voice commands and video calls:

- **`muteBeep` / `unmuteBeep`** — saves and restores `STREAM_NOTIFICATION` volume. Uses `savedNotificationVolume` instance field as a stash so multiple mute calls don't lose the original level.
- **`ensureTtsVolume`** — bumps `STREAM_MUSIC` to ~50% if it was at 0. TTS plays on STREAM_MUSIC; if the tablet booted with music volume off, voice command responses would be inaudible.
- **`getAudioDiagnostics`** — snapshots all stream volumes plus `audioManager.getMode()` (0=NORMAL, 1=RINGTONE, 2=IN_CALL, 3=IN_COMMUNICATION) plus `isSpeakerphoneOn`. Returned as `Map<String, Object>` to Dart. **The single most useful method for debugging "can't hear" reports** — if you see `mode: 2` (IN_CALL) but `speakerphoneOn: false`, you've found the routing bug.

### Touch input control (lines 940-958)

```java
public void disableWindowTouch() {
    activity.runOnUiThread(() -> {
        activity.getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
            WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
        );
    });
}
```

Sets a single window flag. With it set, all input events are dropped *before they queue*, which is what prevents ANR — Android's input dispatcher only times out on *queued* events that aren't handled, not on events that never enter the queue.

`runOnUiThread` is essential — `setFlags` must run on the UI thread or it throws.

### `installApkSilently` (lines 1273-1440)

The most defensively coded method in the file. Detailed walkthrough in [[Tablet/Update Service]] §3 / Path B.

Key safeguards beyond what's in the Dart caller:

- **Disable `package_verifier_enable` secure setting** before install. Re-enable after. Without this, Play Protect can refuse the install.
- **Add Play Store to lock task packages** temporarily. If PairIP license check fires during install, it tries to open Play Store; lock task mode would block that and crash the install.
- **Stop the watchdog before exiting lock task mode**. Otherwise the watchdog notices "not in lock task mode" and tries to relaunch MainActivity mid-install.
- **10-second `Handler.postDelayed`** before restart. The install needs ~2s to actually replace the APK; 10s is the empirically safe wait.
- **`launchIntent.putExtra("FROM_UPDATE", true)`** — the new MainActivity instance can detect it was launched after an update (currently unused but available).

---

## 4. `KioskWatchdogService.java` — sticky foreground service

Runs continuously while the app is provisioned. Restarts the app + re-enters kiosk mode if either is lost.

### Lifecycle

```
onCreate
   ↓
onStartCommand → check ACTION_STOP_INTENTIONALLY
   ├─ if intentional: stopForeground + stopSelf, return START_NOT_STICKY
   └─ else: startForeground(notif), startWatchdogLoop, return START_STICKY
   ↓
onDestroy
   ├─ if stoppedIntentionally: don't restart
   └─ else: schedule self-restart via startForegroundService
```

`START_STICKY` tells Android to recreate the service if killed. `onTaskRemoved` (when the user/system swipes away the task) also relaunches MainActivity *and* restarts the service.

### The watchdog loop (5s interval)

```java
private void checkAndRestoreKioskMode() {
    if (stoppedIntentionally || !isRunning) return;
    if (!isDeviceOwner()) return;
    if (!isMainActivityRunning()) {
        launchMainActivity("watchdog_check");
        return;
    }
    if (!isInLockTaskMode()) {
        // We can't re-enter lock task mode from a service.
        // Restart the app — main.dart will re-enter on launch.
        launchMainActivity("kiosk_restore");
    }
}
```

Two recovery paths:

- App not running → relaunch.
- App running but not in lock task mode → relaunch (which triggers `enterLockTaskEarly` → `setupFullKioskMode`).

### `LAUNCH_COOLDOWN_MS` (line 44)

15-second cooldown between app launches. Prevents the watchdog from spawning duplicate MainActivity instances if checks fire faster than the app can launch.

`isMainActivityRunning` (line 266) double-checks before relaunching — if the app process is found at any importance level except `IMPORTANCE_GONE`, skip the launch.

### Foreground notification (lines 145-186)

Required by Android 8+ to keep the service alive. Low-importance channel, no sound, ongoing flag set so it's not user-dismissible. `setSmallIcon(android.R.drawable.ic_lock_lock)` — a generic lock icon to communicate "kiosk active" without any branded asset.

### `stoppedIntentionally` flag

When kiosk exit gesture is used (or admin command `restart` runs), `KioskService.stopWatchdogService` sends an intent with `ACTION_STOP_INTENTIONALLY`. The flag prevents the service from restarting itself in `onDestroy` and `onTaskRemoved`. Critical — without it, manually exiting kiosk mode would immediately get fought back by the watchdog.

---

## 5. The receivers

Short single-purpose `BroadcastReceiver` subclasses, registered in `AndroidManifest.xml`.

### `AppDeviceAdminReceiver.java`

`DeviceAdminReceiver` subclass. Required for any app that wants Device Admin / Device Owner status. Methods:

- `onEnabled` — toast "Heylo Device Admin Enabled" (visible during provisioning).
- `onDisabled` — toast "Heylo Device Admin Disabled" (visible if disablement is requested).
- `onLockTaskModeEntering` / `onLockTaskModeExiting` — log only.
- `onDisableRequested` — returns the warning message shown if someone tries to disable device admin via Settings.

This file rarely needs editing. If you ever add Device Admin features that need lifecycle hooks (e.g., DPC password resets), add them here.

### `BootReceiver.java`

Listens for `BOOT_COMPLETED`, `LOCKED_BOOT_COMPLETED`, and Samsung's `QUICKBOOT_POWERON`. On any of these, launches MainActivity with `FLAG_ACTIVITY_NEW_TASK | CLEAR_TOP | SINGLE_TOP`.

Requires `RECEIVE_BOOT_COMPLETED` permission in AndroidManifest.

`LOCKED_BOOT_COMPLETED` (added in Android 7) fires before user unlock — useful for kiosks because the resident isn't unlocking anything.

### `PackageReplacedReceiver.java`

Listens for `ACTION_MY_PACKAGE_REPLACED` (system broadcast after the app is updated). On match, launches MainActivity to restore kiosk mode after a Play Store update. Mirrors `BootReceiver` behavior but for the post-update path.

### `ApkInstallReceiver.java`

Receives `PackageInstaller` status callbacks for self-hosted APK installs. Logs each status code:

- `STATUS_PENDING_USER_ACTION` — shouldn't happen for device owner (silent install). Defensive: launch the confirm intent if it does.
- `STATUS_SUCCESS` — log and return; system handles app restart.
- `STATUS_FAILURE_*` — various failure reasons (`ABORTED`, `BLOCKED`, `CONFLICT`, `INCOMPATIBLE`, `INVALID`, `STORAGE`).

If a sideload install fails, this receiver is where the failure message lands. Filter `HeyloApkInstall` in CloudWatch.

### `ShutdownReceiver.java`

Listens for `ACTION_SHUTDOWN`, `ACTION_REBOOT`, and Samsung's `QUICKBOOT_POWEROFF`. On any:

1. Stop the watchdog (so it doesn't fight the shutdown).
2. Clear lock task packages (forces Android to exit lock task mode cleanly).

**Why this exists** (per the comment): on Samsung devices, an unclean shutdown with lock task mode active can corrupt `/efs/MDM/` and freeze the next boot. This receiver's job is to leave the device in a clean state before power-off.

The `clearLockTaskMode` uses `setLockTaskPackages(admin, new String[]{})` — empty array. That's the canonical "exit lock task mode at the policy level" call.

---

## 6. Common Java-side pitfalls

- **`SecurityException` on every Device Admin call** if the app isn't provisioned as device owner. Always check `isDeviceOwner()` first.
- **Methods that take `ComponentName admin`** as the first argument require it to be a `DeviceAdminReceiver` subclass. The Heylo `adminComponent = new ComponentName(this, AppDeviceAdminReceiver.class)` is correct; if you create a new admin receiver, pass that one to DPC calls instead.
- **`setSecureSetting` and `setGlobalSetting`** are device-owner-only. They allow bypassing some Android user-facing settings (package verification, Samsung battery protection). Use sparingly — surfaces the device owner's surveillance scope.
- **`runOnUiThread` is required** for any window/view manipulation (touch flags, immersive mode listeners). Doing them from a worker thread throws.
- **`Handler.postDelayed` runs on the main thread** by default. Be careful with long-running work scheduled this way; `KioskManager.installApkSilently` uses it for the post-install restart, which is safe because it's a single launch intent.
- **Log levels matter for filtering.** Java side uses `Log.i/w/e/d` with TAG prefixes (`HeyloKioskManager`, `HeyloWatchdog`, etc.). These show up in `adb logcat` filtered by `tag:Heylo*`. `Log.d` (debug) is filtered out in release builds.
- **Static fields between Java and Dart are NOT shared.** If you store something in `KioskManager.savedNotificationVolume`, it's not visible to Dart. Use MethodChannel return values to pass data across.
- **`AndroidManifest.xml`** declares all receivers + the watchdog service. Adding a new receiver requires adding the `<receiver>` block; adding a new service requires `<service>`. Also add intent filters for whatever broadcasts you want to receive.

---

## 7. The shutdown order (worth understanding)

When the tablet is rebooting via the admin-command `reboot`:

```
Dart: KioskService.rebootDevice()
  → MethodChannel 'rebootDevice'
  → KioskManager.rebootDevice()
  → devicePolicyManager.reboot(adminComponent)
       ↓ (Android system fires shutdown sequence)
ShutdownReceiver.onReceive(ACTION_REBOOT)
  → stopWatchdog (with intentional flag)
  → clearLockTaskMode
       ↓
[device reboots]
       ↓
BootReceiver.onReceive(BOOT_COMPLETED)
  → launchMainActivity
       ↓
MainActivity.onCreate
  → kioskManager.disablePairIpLicenseCheck
  → super.onCreate
  → kioskManager.enterLockTaskEarly  ← Samsung deadlock workaround
       ↓
[Flutter initializes]
       ↓
main() → _setup() → kioskManager.setupFullKioskMode (full Dart-side setup)
       ↓
App is back in steady-state kiosk mode
```

If any step in this ladder hangs, the next reboot may freeze (especially on Samsung). `ShutdownReceiver` exists specifically to keep the unmount step clean.

---

## 8. SME-worth gotchas

- **`MainActivity.onCreate` is the earliest Java code.** If you need to do something before Flutter starts, that's where it goes. PairIP and lock-task-early are the only existing examples.
- **The watchdog cannot enter kiosk mode itself** (line 238) — services don't have an Activity context. It can only restart MainActivity, which then calls `enterLockTaskEarly` from its `onCreate`.
- **`stoppedIntentionally` flag is checked in 3 places** (`onStartCommand`, `onDestroy`, `onTaskRemoved`, plus the watchdog loop's `checkAndRestoreKioskMode`). Don't add a fourth check path without understanding why the existing four exist.
- **PairIP-related crashes**: if you see "ClassNotFoundException: com.pairip.licensecheck.*" in CloudWatch, the disable hook didn't fire early enough. Check that `disablePairIpLicenseCheck` is called BEFORE `super.onCreate`.
- **Samsung-specific code paths** are guarded by `Build.MANUFACTURER` checks (battery protection) or behavior assumptions (boot deadlock). Test changes on Samsung hardware specifically.
- **`Build.SERIAL` is deprecated** as of Android 8 — but `KioskManager` still uses it as the primary hardware ID source (line 72 of MainActivity). Falls back to `ANDROID_ID`. Don't remove the `Build.SERIAL` path even though Android Studio warns about it; deployed Samsung tablets have it populated.
- **`setSystemUpdateWindow` validates input** (lines 435-438): minutes must be 0–1440 (24 hours). Anything outside this range silently fails — no exception thrown, just `false` returned.
- **Adding a new MethodChannel handler**: edit BOTH `MainActivity.configureFlutterEngine` (the dispatch) AND `KioskService` (the Dart wrapper). Method name strings must match exactly.

---

## 9. Where this connects

- [[Tablet/Kiosk Service Reference]] — the Dart wrapper for `KioskManager.java` operations.
- [[Tablet/Bootstrap & Module Wiring]] §1, §2 — `MainActivity.onCreate` runs before Dart `main()`.
- [[Tablet/Update Service]] §3 — `installApkSilently` walkthrough; this doc gives the supporting context.
- [[Tablet/Domain - Kiosk]] — the kiosk concept at the product level.
- [[Tablet/Logging Stack]] — Java `Log.*` calls show up in CloudWatch alongside Dart `print` (both go to logcat).
