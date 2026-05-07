---
type: reference
tags: [tablet, updates, ota]
owner: Mike
updated: 2026-05-07
status: current
---
# Tablet — Update Service

How tablet APK updates flow end-to-end. Two distinct mechanisms coexist: **Google Play In-App Updates** (primary) and **self-hosted S3 sideload** (emergency hotfix path). Sister doc to [[Tablet/Update Strategy]] (broader product context) and [[Tablet/Admin Commands]] (the wire-level WS commands that trigger updates).

> **Bottom line:** as of 2026-05, the tablet has switched primarily to Google Play's `in_app_update` package — `update.service.dart` is now a wrapper around `InAppUpdate.checkForUpdate()` / `startFlexibleUpdate()` / `performImmediateUpdate()`. The self-hosted "polling APK from S3" path is **only invoked by the `update-sideload` admin command**, used for emergency hotfixes that can't go through Play Store. The existing [[Tablet/Update Strategy]] doc describes both as alternative strategies; in practice they're complementary.

---

## 1. The two paths, side by side

```
┌──────────────────────────────────────────────────────────────────┐
│  PATH A — Google Play In-App Updates (primary)                   │
│                                                                  │
│  Trigger: admin_command 'update-flexible' or 'update-immediate'  │
│           OR (theoretically) periodic check — currently disabled │
│                                                                  │
│  update.service.dart                                             │
│    InAppUpdate.checkForUpdate()                                  │
│    InAppUpdate.performImmediateUpdate()  (priority ≥ 4)          │
│       OR InAppUpdate.startFlexibleUpdate() (background download) │
│       → poll for InstallStatus.downloaded                        │
│       → InAppUpdate.completeFlexibleUpdate()                     │
│       → Play Store restarts the app                              │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  PATH B — Self-hosted S3 APK (emergency hotfix)                  │
│                                                                  │
│  Trigger: admin_command 'update-sideload' with `url` payload     │
│                                                                  │
│  realtime.service.dart::_handleAdminCommand                      │
│    → KioskService.installApkFromUrl(url)                         │
│         Dart side: AWS SigV4 sign + download S3 object           │
│         → MethodChannel 'installApkFromFile' with local path     │
│         Java side: PackageInstaller silent install               │
│         → 10s wait → restart app                                 │
└──────────────────────────────────────────────────────────────────┘
```

The two paths share **nothing** at the code level. They use different download mechanisms, different auth, different install APIs.

---

## 2. Path A — Google Play In-App Updates

### Why Play Store

Earlier strategy was self-hosted only ([[Tablet/Update Strategy]]) — no Google account on devices, full control over update timing. The migration to Play Store happened because:

- Google's CDN is more reliable than the self-hosted S3 path under flaky tablet WiFi.
- Play Protect / PairIP license verification was rejecting self-hosted APKs.
- Background download via `flexibleUpdate` is more battery-friendly than the active polling the older self-hosted path did.

### Two Play Store update modes

| Mode | API | Behavior |
|---|---|---|
| **Immediate** | `InAppUpdate.performImmediateUpdate()` | Full-screen Play Store UI takes over. App is unusable until update completes. Used for `priority >= 4` (critical fixes). |
| **Flexible** | `InAppUpdate.startFlexibleUpdate()` then `completeFlexibleUpdate()` | Downloads in background. App remains usable. UI must explicitly call `completeFlexibleUpdate()` when ready to install (typically via the `update-flexible` admin command). |

The classification is **driven by `updateInfo.updatePriority`** returned by Play Store — set by your release process when uploading to the Play Console (0–5). The threshold for "immediate" is 4 (`_criticalUpdatePriority` constant on line 22 of update.service.dart).

### `checkForUpdate` flow (line 56)

Triggered by an admin command. Steps:

1. Call `InAppUpdate.checkForUpdate()` with 30s timeout.
2. Branch on `updateInfo.updateAvailability`:
   - `developerTriggeredUpdateInProgress` — a previous update is stuck. Special recovery flow (see §3).
   - `updateAvailable` — start either immediate (priority ≥ 4) or flexible flow.
   - Anything else — log and return.

### `_startFlexibleUpdate` (line 200)

Once flexible mode is chosen:

1. **Re-entrancy guard** — `_isUpdateInProgress` boolean. If already running, log elapsed time and skip.
2. Call `_startFlexibleUpdateWithRetries` — up to 3 attempts with 10s between.
3. On `AppUpdateResult.success`: poll for download completion via `_pollForDownloadCompletion`.
4. On `userDeniedUpdate`: clear state, log, return. Will re-prompt on next check.

### `_pollForDownloadCompletion` (line 261)

The most complex method in the file. Polls every 5 seconds for up to 15 minutes (180 polls), with multiple recovery branches:

| Observed status | Action |
|---|---|
| `pending` or `downloading` | Set `_hasSeenDownloadStart = true`. Log progress. Continue polling. |
| `downloaded` AND `_hasSeenDownloadStart` | Download truly complete. Call `onComplete` callback. Done. |
| `downloaded` AND NOT `_hasSeenDownloadStart` | **Stuck-state false positive.** Play Store thinks "downloaded" but we never saw download start. Ignore and continue polling. |
| `failed` | Retry the entire flow (up to 3 download retries with 30s between). |
| Poll itself errors | Increment `_consecutiveTimeouts`. If 5 in a row, retry the download. |

The "stuck-state false positive" is real — Play Store sometimes reports `downloaded` immediately on `checkForUpdate` when an old prior update result is cached. Without this guard, we'd "complete" an update that was never actually downloaded.

### `installUpdate` — final commit (line 388)

Called when the user (or admin command) confirms install. Two-step:

1. `InAppUpdate.completeFlexibleUpdate()` — Play Store auto-restarts the app to apply the downloaded APK.
2. **5s safety timeout** — if Play Store doesn't restart, fall back to `KioskService.restartApp()`.

The fallback exists because Play Store occasionally returns from `completeFlexibleUpdate()` without restarting (Samsung-specific).

### `checkAndInstallUpdate` — fully automated path (line 427)

Used by `admin_command: update-immediate`. Combines check + immediate-mode install into one call. Bypasses any user prompt — performs `InAppUpdate.performImmediateUpdate()` directly if available, falls back to flexible if immediate isn't allowed.

### Stuck-state recovery (line 76)

`UpdateAvailability.developerTriggeredUpdateInProgress` indicates a prior update was started but never finished. The recovery sequence:

1. If `_updateReady$.value == true` (we already know an update is ready), just re-emit to refresh the UI prompt.
2. Otherwise, call `InAppUpdate.completeFlexibleUpdate()` to clear the stuck state. **Expected to fail** — that's why it has its own try/catch and 5s timeout.
3. After 2 seconds, re-check. If state cleared and update is now available, start flexible flow.
4. Otherwise, log and return — will retry on next admin command.

This pattern works around a Play Store bug where stuck states can persist indefinitely without intervention.

---

## 3. Path B — Self-hosted S3 sideload

### When it's used

Only via `admin_command: update-sideload` (with `url` field in payload). Specifically:

- Emergency hotfixes that can't wait for Play Store review (24-48h).
- Versions intentionally not released to Play Store (internal testing, agency-specific builds).
- Recovery if Play Store integration itself is broken.

### Flow

1. Backend sends WS event:
   ```json
   { "event": "admin_command", "data": { "command": "update-sideload", "url": "https://heylo-apks.s3.amazonaws.com/heylo-1.2.3.apk" } }
   ```
2. `RealtimeService._handleAdminCommand` switches on `update-sideload` and calls `KioskService.installApkFromUrl(url)`.
3. **Dart side** ([kiosk.service.dart:633](../../tablet/lib/services/kiosk.service.dart#L633)):
   - Parse the S3 URL into bucket + key (supports multiple URL formats).
   - Get IAM credentials via `AuthService.getIAMCredentials()` (Cognito Identity Pool exchange).
   - AWS SigV4 sign the GET request.
   - Stream-download to `getTemporaryDirectory()/update.apk` with 10-min timeout. Progress logged every 10%.
   - Call native `installApkFromFile` via MethodChannel.
4. **Java side** ([KioskManager.java:1273](../../tablet/android/app/src/main/java/com/heylo/app/heylo/KioskManager.java#L1273) `installApkSilently`):
   - Disable package verification (Play Protect bypass).
   - Add Play Store to lock-task whitelist (so PairIP license check, if it fires, can complete).
   - Create `PackageInstaller.Session` with `MODE_FULL_INSTALL`.
   - Set `setRequireUserAction(USER_ACTION_NOT_REQUIRED)` for Android 12+ (silent install).
   - Stop the kiosk watchdog service (so it doesn't fight the install).
   - Exit lock-task mode (the install needs to replace the running APK).
   - Commit the session.
   - **10-second `Handler.postDelayed`** to restart the app via `MainActivity` launch intent + `Process.killProcess`.
   - Restore lock-task packages and re-enable package verification.

### Why all the safeguards in `installApkSilently`

This method has been tuned through real failure cases:

- **PairIP LicenseActivity** is added by Play's "Automatic integrity protection." If it runs during the install, it can crash the app. `disablePairIpLicenseCheck` (called in `MainActivity.onCreate`) preemptively disables it.
- **Watchdog stop before lock-task exit** — if the watchdog runs while we're not in lock-task mode mid-install, it tries to "restore" by relaunching `MainActivity`, creating duplicate instances.
- **10-second wait** — empirical. Faster restarts can race with Android's package replacement and result in launching the *old* APK.

### Why two paths exist

The Play Store path requires:
- A Google account on the device (added post-provisioning).
- App enrollment in Managed Google Play.
- Play Store cooperation (it can refuse to install).

The S3 sideload path:
- Works on tablets without Google accounts (legacy deployments).
- Bypasses Play Protect.
- Useful when Play Store is itself broken.

Production tablets have both available. The choice of which to use is made by ops at the time of issuing the admin command.

---

## 4. State management in `update.service.dart`

```dart
bool _isUpdateInProgress = false;       // mutex for concurrent update attempts
bool _hasSeenDownloadStart = false;     // distinguish real downloads from cached "downloaded" stuck state
DateTime? _updateStartedAt;             // for elapsed-time logging
int _totalDownloadAttempts = 0;         // retry counter across multiple failure scenarios

final _updateReady$ = BehaviorSubject<bool>.seeded(false);
Stream<bool> get onUpdateReady => _updateReady$.stream.distinct();
```

**`_updateReady$`** is consumed by `UpdateNotificationWrapper` (the global widget set up in `main.dart`'s widget tree). When it emits `true`, the wrapper renders an "Update ready - tap to install" UI overlay. User tapping that calls `installUpdate`.

`_resetUpdateState` (line 159) is the standard "we're done with this attempt" cleanup. Called on success, on user denial, on any retry-exhaustion path.

---

## 5. Timing and retry constants (line 22-35)

```dart
static const int _criticalUpdatePriority = 4;          // priority threshold for immediate
static const Duration retryDelay = Duration(hours: 24); // user-denied retry delay
static const int _maxDownloadRetries = 3;
static const int _maxStartRetries = 3;
static const Duration _startRetryDelay = Duration(seconds: 10);
static const Duration _downloadRetryDelay = Duration(seconds: 30);
static const int _maxConsecutivePollTimeouts = 5;
static const int _maxPollAttempts = 180;               // 15 minutes at 5s intervals
static const Duration _pollInterval = Duration(seconds: 5);
static const Duration _pollCheckTimeout = Duration(seconds: 30);
```

Net behavior:

- **Up to 3 starts × 3 download retries = 9 attempts** before giving up entirely.
- **15-minute total polling window** per download attempt — covers slow APK downloads on weak WiFi.
- **5 consecutive timeouts (~150s of network failure)** triggers a download retry.

If you tweak these, monitor real-world success rates via WaypointService logs (no `LogEventType.updateFailed` exists today — *this would be a worthwhile addition for future ops visibility*).

---

## 6. The end-to-end ladder

```
Backend admin sends WS event:
  { event: "admin_command", data: { command: "update-flexible" } }
       ↓
RealtimeService._handleAdminCommand (switches on data.command)
       ↓
UpdateService.checkForUpdate(trigger: "admin_command_flexible")
       ↓
InAppUpdate.checkForUpdate()
       ↓ (updateAvailable + flexibleUpdateAllowed)
_startFlexibleUpdate
       ↓ (up to 3 retries)
InAppUpdate.startFlexibleUpdate() → AppUpdateResult.success
       ↓
_pollForDownloadCompletion (5s intervals, up to 15min)
       ↓ (InstallStatus.downloaded, _hasSeenDownloadStart = true)
_onDownloadReady → _updateReady$.add(true)
       ↓
UpdateNotificationWrapper renders "Update ready" UI
       ↓ user taps → installUpdate
       ↓
InAppUpdate.completeFlexibleUpdate()
       ↓ (Play Store restarts app — or 5s fallback to KioskService.restartApp)
New version running
```

The `update-immediate` flow is similar but skips `_pollForDownloadCompletion` — Play Store handles the entire UI as a takeover.

The `update-sideload` flow is entirely separate (Path B above).

---

## 7. SME-worth gotchas

- **There is no periodic polling for updates.** The only triggers are admin commands. Existing [[Tablet/Update Strategy]] doc and earlier comments suggest periodic polling, but it's been removed — line 685-686 of `main.dart`: "Updates are checked only on kiosk exit gesture and via WebSocket admin command."
- **`_hasSeenDownloadStart` is the most underrated state field.** Removing it would re-introduce the stuck-state false-positive bug. Don't.
- **Lock-task mode is NOT exited for Play Store updates** — Play Store is whitelisted in lock-task packages, so it can update the app even while the kiosk is locked. Comment on line 395-398 of update.service.dart.
- **`installApkFromUrl` (sideload) DOES exit lock-task mode** — explicit `stopLockTask()` call in the Java side. Restored before the post-install restart.
- **Play Store + Heylo battery-optimization exemption** — both `com.heylo.app` and `com.android.vending` are exempted from Doze Mode in `KioskManager.disableBatteryOptimization`. Without this, Play Store wouldn't run reliably enough to deliver updates on tablets that idle for hours.
- **`AppUpdateResult.userDeniedUpdate`** can theoretically be returned, but on a kiosk tablet there's no user to interact with the prompt — Play Store auto-accepts in Managed Play context. Still handled defensively.
- **The 5-second post-`completeFlexibleUpdate` fallback restart** has been hit in real deployment. If you're investigating a tablet that didn't restart after `completeFlexibleUpdate`, look for `Automatic restart didn't occur, forcing manual restart` in CloudWatch.
- **PairIP license check disabled in `MainActivity.onCreate`** — runs before `super.onCreate()` to prevent the license activity from killing the app. Don't remove without verifying Play Protect doesn't block sideloads.
- **No `LogEventType.updateStarted` / `updateCompleted` waypoints exist today** — update lifecycle is `print`-only (CloudWatch). Worth adding structured waypoints if you want fleet-wide update analytics.

---

## 8. Where this connects

- [[Tablet/Update Strategy]] — broader product-level update strategy doc (older, presents Play Store and self-hosted as alternatives).
- [[Tablet/Admin Commands]] — wire format for `update-flexible`, `update-immediate`, `update-sideload`.
- [[Tablet/Kiosk Service Reference]] §APK install — `installApkFromUrl` Dart-side breakdown.
- [[Tablet/Tablet Native Layer]] — Java-side `installApkSilently` and the install session lifecycle.
- [[Tablet/Bootstrap & Module Wiring]] §3 — `_setup()` does NOT call `UpdateService` at startup.
- [[Tablet/Logging Stack]] — search for `HEYLO:` lines mentioning `Update`, `flexible`, `immediate`, `Download`, or `APK_INSTALL` for update events.
