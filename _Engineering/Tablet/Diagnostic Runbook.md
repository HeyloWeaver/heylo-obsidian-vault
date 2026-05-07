---
type: runbook
tags: [tablet, diagnostics, troubleshooting]
owner: Mike
updated: 2026-05-07
status: current
---
# Tablet — Diagnostic Runbook

Symptom → likely cause → how to confirm → how to fix. Entries are organized by subsystem.

> **Caveat:** entries below are **derived from code analysis and the gotchas catalogued across Tablet docs**, not from a real incident-retrospective archive. Treat them as "things that *can* go wrong based on how the code is shaped" rather than "things that have actually been seen in prod." When a real incident is resolved, add it here with the actual symptom, the actual root cause, and the fix that worked. Update entries that turned out to be wrong.

> **First step for any incident:** filter [[Tablet/Logging Stack]] for the affected device's CloudWatch stream (`heylo-tablet-logs/{agencyId}/{deviceId}`). Most issues are diagnosable from CloudWatch alone.

---

## How to use this runbook

1. **Identify subsystem** — calls, chat, auth, WebSocket, updates, kiosk, bootstrap, voice commands.
2. **Match symptom** — read the symptoms in that section's entries.
3. **Diagnose** — run the suggested filters / grep / inspect.
4. **Fix or escalate** — entries note when escalation is the right answer.

---

## Calls

### Incoming call not received on tablet

**Symptom:** Staff places a call, tablet shows nothing. No incoming-call modal, no ringtone.

**Likely causes:**
1. WebSocket disconnected. Tablet isn't receiving the `CallCreated` event.
2. `Event` enum mismatch — backend changed the wire string but tablet's `events.enum.dart` wasn't updated.
3. `CallService.onIncomingCall` dedupe filter dropped the event (`id == _activeCall?.id`).

**Diagnose:**
- CloudWatch filter `REALTIME_SERVICE: WebSocket connected` — should be near-recent. If watchdog timeout messages appear, WS is broken. See [[Tablet/Onboarding Walkthrough]] §6 (RealtimeService digest).
- Filter `REALTIME_SERVICE: WebSocket event:` — does `CallCreated` appear at the time staff placed the call?
- If `CallCreated` is logged but tablet didn't show modal: filter `CALL_SERVICE: Filtering call` — check `Will pass: false` lines (dedupe rejected it).

**Fix:**
- WS broken: tablet should auto-reconnect (40s watchdog). If not, send admin command `restart`.
- Enum mismatch: see [[Tablet/WS Contract]] §9 — fix tablet enum, deploy.
- Dedupe filter: this means there was already an active call; backend may have stale state. Send admin command `restart` to clear `_activeCall`.

### Call connects but no audio (resident can't hear)

**Symptom:** Daily room joins, video shows, but no audio.

**Likely causes:**
1. Audio routed to earpiece (default Android), and tablets have no earpiece.
2. STREAM_VOICE_CALL or STREAM_MUSIC at 0.
3. `audioManager.getMode()` not `IN_COMMUNICATION`.

**Diagnose:**
- Use `KioskService.getAudioDiagnostics()` during the call. Returns: `{voiceCall, music, notification, ring, mode, speakerphoneOn}`. The most useful single tool for this class of bug.
- Filter `VIDEO_CALL_VM: Audio diagnostics:` — logged in `init` after `setDevice(speakerPhone)`.
- Inspect `mode` — should be `2` (IN_CALL) or `3` (IN_COMMUNICATION). If `0` (NORMAL), Daily SDK didn't acquire audio focus.
- Inspect `speakerphoneOn` — should be `true`.

**Fix:**
- If `speakerphoneOn: false`: `AudioManager.setDevice(speakerPhone)` in `VideoCallViewModel.init` failed silently. Check for errors logged around line 121 of `video_call.view_model.dart`.
- If volumes at 0: tablet booted with hardware volume buttons all the way down. `KioskService.ensureTtsVolume()` only fixes STREAM_MUSIC; STREAM_VOICE_CALL needs a different fix (currently nothing forces it).

### Call drops after 30 seconds with "If participant doesn't join in M:SS"

**Symptom:** Resident accepts call, video tile appears briefly, then call ends with the timeout message.

**Likely causes:**
1. Remote participant disconnected (network blip on staff side).
2. The `_callEndtimer` fires at 0 because no remote ever joined.
3. The `_noParticipantTimer` (60s) fires after a remote drop.

**Diagnose:**
- Filter `VIDEO_CALL: participantLeft event fired` — was the remote ever there and left?
- Filter `VIDEO_CALL: No remote participants for 30s - auto-ending call` — the 60s no-participant timer fired (the log line says 30s, it's actually 60s — see [[Tablet/Video Call View]] §11).
- Filter `VIDEO_CALL: Call timed out - no participant joined` — the configured-timeout countdown fired.

**Fix:**
- Remote disconnected: usually transient; tablet sends `CallEnded` to backend correctly. Verify tablet returned to home screen.
- Backend `appConfig.callTimeoutInMilliseconds` might be too short. Check `/app/config` response.

### Forced call doesn't auto-answer

**Symptom:** Backend marks call `isForced: true` but tablet doesn't auto-join the Daily room.

**Likely causes:**
1. `home.view_model._onForcedCallReceived` failed silently.
2. `CallService.joinCall` returned null token.

**Diagnose:**
- Filter `HOME_VIEW: Handling forced call` — fires on receipt.
- Filter `HOME_VIEW: Showing incoming call modal (not forced)` — wrong path; backend payload might have `isForced: false`.
- Filter `Unable to join forced call.` — toast displayed, joinCall failed.

**Fix:**
- Verify backend payload has `isForced: true` and not the string `"true"`.
- joinCall failure: backend `/call/:id/token` returned non-200 or call not found.

### Call cleanup hangs (ANR risk)

**Symptom:** After ending a call, the tablet shows "Connecting..." or freezes. CloudWatch may show "WATCHDOG - callClient cleanup timed out after 30s".

**Likely cause:** Daily SDK's native `dispose()` is blocking. The `withTouchDisabledTimeoutVoid` watchdog is the safety net.

**Diagnose:**
- Filter `KIOSK: WATCHDOG - callClient cleanup timed out` — confirms the timeout fired.
- Filter `CALL_SERVICE: Cleanup timed out or failed:` — what error was reported.

**Fix:**
- Touch is auto-re-enabled by the watchdog `finally` block, so the tablet remains usable. The Daily SDK's leaked thread won't recover until app restart — `restartApp` may be the cleanest path.
- If recurring: WiFi quality is bad enough to consistently hang Daily. Consider tightening `WifiQualityTier` thresholds.

---

## Chat

### Messages don't appear in real-time

**Symptom:** Sent messages from staff don't show on tablet until manual refresh.

**Likely causes:**
1. WebSocket disconnected.
2. `ConversationMessageCreated` event being emitted but not received (network or stream issue).
3. View-model `getMessagesStream` not subscribed (chat detail screen didn't mount cleanly).

**Diagnose:**
- Filter `CONVERSATION_SERVICE: Message received via WebSocket` — does it fire when staff sends?
- If yes: likely view-model issue; filter `CHAT_DETAIL_VIEWMODEL:` and check for stream subscription.
- If no: WebSocket-side issue (see WebSocket section).

### Unread badge stays after opening conversation

**Symptom:** Opening a chat shows the messages but the unread badge on the home card doesn't clear.

**Likely causes:**
1. Read receipts not POSTed because messages weren't reported as visible by the view layer.
2. `ReadReceiptController.markMessagesAsRead` returned `DataError`.

**Diagnose:**
- Filter `CHAT_DETAIL_VIEWMODEL: onMessageVisibilityChanged` — was the visibility actually triggered?
- Filter `READ_RECEIPT: failed` — POST failed.

**Fix:**
- 200ms debounce in the view-model: scrolling too fast can miss visibility events. Test by holding scroll briefly.
- POST failure: check backend `/read-receipt` endpoint.

### "Unable to send message at the moment"

**Symptom:** Send button shows toast on each attempt.

**Likely causes:**
1. POST `/conversation/message` returns non-201 (NestJS POST default is 201).
2. Backend `ConversationExpiredException` — conversation closed.

**Diagnose:**
- Filter `CONVERSATION_SERVICE: Message failed` — confirms send failed.
- Filter `_lastErrorType` value — backend error code.
- If `lastErrorType == "ConversationExpiredException"`: chat detail view shows a different UI for this; check that's working.

**Fix:**
- 201 vs 200 mismatch: backend may have changed status code. Verify endpoint returns 201.
- ConversationExpired: expected behavior; conversation needs to be reopened from staff side.

---

## Auth

### Tablet stuck on connectivity / login screen

**Symptom:** Tablet boots but stays on connectivity screen or login screen.

**Likely causes:**
1. No internet (connectivity screen) — bootstrap couldn't reach backend.
2. Auth failure — Cognito rejected, or `UserService.getUserProfile()` returned null.
3. Wrong flavor / bad config — API base URL or Cognito IDs are misconfigured.

**Diagnose:**
- Filter `HEYLO: Internet available:` — `false` means connectivity screen.
- Filter `HEYLO: Authentication result:` — `false` means auth failed.
- Filter `COGNITO_SERVICE: Authentication failed:` — exact Cognito error.
- Filter `HTTP_SERVICE: Base URL set to:` — confirms the API URL.

**Fix:**
- No internet: tablet WiFi or backend down. Verify the backend is reachable from another network.
- Cognito "Incorrect username or password": Cognito password drifted. The self-healing path should clear stored password and retry with temp password (line 127-141 of `cognito.service.dart`). If it isn't recovering, run `KioskService.regenerateDeviceId()` (currently no UI for this — would require a debug build).
- Cognito "Password attempts exceeded": Cognito has temporarily locked this device. Wait ~15 minutes, then restart the tablet.

### "Authentication failed. Please turn the device off and back on."

**Symptom:** Toast appears, conversation features broken.

**Likely cause:** `ConversationService.getConversationWithSupportProfessional` triggered its own re-auth path which also failed.

**Diagnose:**
- Filter `CONVERSATION_SERVICE: Auth error detected, attempting re-authentication` — confirms entry to retry.
- Filter `CONVERSATION_SERVICE: Re-authentication or retry failed` — both attempts failed.

**Fix:**
- Cognito-side issue: see "Tablet stuck on login screen" above.
- This is a sign the underlying auth is broken; rebooting the tablet (admin command `reboot`) is the fastest recovery.

### IAM credentials unavailable (CloudWatch logs not shipping)

**Symptom:** Tablet appears to be running but no log events arrive in CloudWatch. Recent device-status reports also missing from backend.

**Likely cause:** `AuthService.getIAMCredentials()` failing — Cognito Identity Pool exchange broken.

**Diagnose:**
- Filter `CLOUDWATCH: Failed to ensure log stream` — confirms IAM exchange failure.
- Filter `Failed to get identity ID` or `Failed to get credentials` — auth.service.dart errors.

**Fix:**
- Cognito Identity Pool may be misconfigured for the tablet's user pool. Cross-check the IAM role mapping.
- Token expiration: a stale JWT can fail the exchange. JWT refresh path should fix; if not, `restartApp`.

---

## WebSocket

### Tablet shows "Connection lost" modal indefinitely

**Symptom:** "Connection lost. Attempting to reconnect automatically." doesn't go away.

**Likely causes:**
1. Network is genuinely down.
2. WebSocket is connected per `RealtimeService`, but `InternetStatusService` flipped to `false` based on a failed HTTP request.
3. `_internetCheckInterceptor` is firing on a benign error.

**Diagnose:**
- Filter `HOME_VIEW: Internet connection LOST` — when did it fire?
- Filter `HOME_VIEW: Internet connection RESTORED` — has it restored?
- Filter `HTTP_SERVICE: Request failed` around the same time — what request failed?

**Fix:**
- If genuinely offline: wait for WiFi.
- If WS is connected but modal is stuck: `InternetStatusService` may be in a bad state. `restartApp` is the cleanest fix.

### Watchdog timeout — "No messages for 40s"

**Symptom:** WS reconnects every ~40s. CloudWatch shows watchdog timeouts.

**Likely cause:** API Gateway WS connection is silently dead but the OS hasn't detected it. The 40s watchdog (in `realtime.service.dart` `_startWatchdog`) catches this.

**Diagnose:**
- Filter `REALTIME_SERVICE: Watchdog timeout!` — confirms watchdog is firing.
- Filter `REALTIME_SERVICE: WebSocket disconnected - closeCode:` — was a close code received before the watchdog fired?

**Fix:**
- API Gateway's idle timeout is 10 minutes; close code 1001 is normal and silent. If watchdog is firing without close code, something at the network layer is broken.
- Check tablet's WiFi RSSI — `getWifiInfo()` in CloudWatch logs every 3s.
- Persistent watchdog firings suggest router NAT timeout or carrier-level idle drop. Backend keepalive (15s status report) should prevent this; if it isn't, backend may not be processing those reports.

### Admin commands don't take effect

**Symptom:** Backend sends `admin_command: restart` (or similar), tablet doesn't respond.

**Likely causes:**
1. Tablet WS not connected (see above).
2. Tablet received the event but `_handleAdminCommand` errored silently.
3. Admin command name typo (case-sensitive).

**Diagnose:**
- Filter `REALTIME_SERVICE: Admin command received` — did the event arrive?
- Filter `REALTIME_SERVICE: Executing admin command:` — what command name was extracted?
- Filter `REALTIME_SERVICE: Unknown admin command:` — typo or new command not implemented.
- Filter `REALTIME_SERVICE: Error handling admin command:` — exception during execution.

**Fix:**
- See [[Tablet/Admin Commands]] for the canonical command names.
- For sideload commands, ensure the `url` field is in the payload.

---

## Updates

### Update prompt never appears (flexible)

**Symptom:** Backend sends `admin_command: update-flexible` but no update notification appears on tablet.

**Likely causes:**
1. No update available from Play Store.
2. Stuck `developerTriggeredUpdateInProgress` state.
3. Download polling timed out (15 min limit).

**Diagnose:**
- Filter `HEYLO: Update check completed` — what `updateAvailability` was returned?
- If `updateAvailable`: filter `HEYLO: Starting flexible update` — did it start?
- If `developerTriggeredUpdateInProgress`: filter `HEYLO: Update in progress detected from previous session` — recovery flow should handle it.
- Filter `Download timeout after` to see if poll exhausted.

**Fix:**
- No update: nothing to do.
- Stuck state: usually self-clears via the recovery path. If not, `restartApp` clears the in-memory state but Play Store's stuck state persists.
- Poll timeout: WiFi too weak to download. Wait for better network and re-trigger.

### Update downloads but doesn't install

**Symptom:** Logs show "Download ready" but `installUpdate` never runs.

**Likely cause:** `UpdateNotificationWrapper` UI didn't render the prompt, or the user didn't tap it. Note this is the manually-confirmed flexible flow; the auto-install flow (`update-immediate`) bypasses the prompt.

**Diagnose:**
- Filter `HEYLO: Download ready - total elapsed` — confirms download done.
- For auto-install: filter `HEYLO: Auto-install download ready` — confirms the auto path.
- Filter `HEYLO: Installing update - app will restart` — install actually started.

**Fix:**
- If user didn't tap and update should be forced: send `admin_command: update-immediate` instead.

### Sideload APK install fails

**Symptom:** `admin_command: update-sideload` returns failure.

**Likely causes:**
1. S3 URL malformed or APK not at that key.
2. IAM permissions don't allow this device to read the S3 bucket.
3. Play Protect blocks the install.
4. Insufficient storage on tablet (`STATUS_FAILURE_STORAGE`).

**Diagnose:**
- Filter `KIOSK: APK_INSTALL: FAILED` — exact failure point.
- Filter `KIOSK: APK_INSTALL: Bucket: X, Key: Y` — confirms URL parsing.
- Filter `HeyloApkInstall: Install` — Java-side install status.

**Fix:**
- URL: verify the APK is uploaded and the URL format matches one of the supported patterns ([[Tablet/Update Service]] §3).
- IAM: check Cognito Identity Pool's role policy for S3 GetObject on this bucket.
- Play Protect: temporary disable via `package_verifier_enable=0` is part of `installApkSilently`. If it's still blocking, the APK signature may be invalid.
- Storage: free up cache (`/data/data/com.heylo.app/cache/`) — `cleanupApkFile` should normally handle this.

### Tablet stuck on old version after Play Store update

**Symptom:** New version pushed via Play Store, tablet still reports old `appVersion`.

**Likely causes:**
1. Play Store hasn't downloaded the update yet.
2. Update downloaded but `completeFlexibleUpdate` never called.
3. App restarted but kiosk relaunched the old binary (rare).

**Diagnose:**
- Filter `HEYLO: Update check completed - updateAvailability:` — what's Play Store reporting?
- Filter `HEYLO: completeFlexibleUpdate() returned` and `HEYLO: Automatic restart didn't occur` — restart fallback may have triggered.
- Compare `pubspec.yaml` version vs current tablet's reported `appVersion`.

**Fix:**
- Force update via `admin_command: update-immediate`.
- If still stuck: clear Play Store cache (requires kiosk exit).

---

## Kiosk / Native

### Kiosk exit gesture (5-tap top-right) doesn't work

**Symptom:** Tapping doesn't show PIN dialog.

**Likely causes:**
1. The 5 taps must be within 2 seconds; gesture has a tight window.
2. `KioskExitGestureWrapper` not in the widget tree (regression).
3. Widget tree paused (e.g., during a call).

**Diagnose:**
- Filter for any kiosk-exit-related log lines.
- Test on a fresh boot with no app activity in progress.

**Fix:**
- Try tapping faster.
- Verify `main.dart` builder still wraps with `KioskExitGestureWrapper` (line 721 of main.dart).

### App keeps relaunching itself

**Symptom:** App restarts every few seconds.

**Likely causes:**
1. Watchdog detecting "not in lock task mode" and relaunching.
2. Battery low + not charging → `DeviceStatusService` triggered restart.
3. FlutterError fatal → error screen → user tapped Restart App.
4. Crash in `_setup()` causing a real crash loop.

**Diagnose:**
- Filter `KIOSK: RESTART APP CALLED` — stack trace shows the trigger.
- Filter `HEYLO: Battery low (` — battery-driven restart.
- Filter `HeyloWatchdog: Launching MainActivity (reason:` — watchdog triggered. The `reason` field tells you why.
- Filter `HEYLO: FATAL ERROR - SHOWING ERROR SCREEN TO USER` — Flutter fatal.

**Fix:**
- Watchdog loop on lock task: kiosk mode failing to apply. Check `KIOSK: setupFullKioskMode` errors.
- Battery loop: confirm tablet is plugged into a working charger with sufficient amperage.
- Fatal crash: read the `Stack trace:` block in the FlutterError log to identify the source.

### App not starting after factory reset

**Symptom:** New tablet (or freshly reset) doesn't enter kiosk on boot.

**Likely cause:** Tablet wasn't re-provisioned as Device Owner.

**Diagnose:**
- Filter `HEYLO: Device owner status: false` — confirms not provisioned.
- Filter `Not device owner - skipping early lock task mode` (Java logcat) — confirms `MainActivity.onCreate` skipped the early entry.

**Fix:**
- Re-provision via QR code or ADB. See [[Tablet/Kiosk Mode Setup]] for the full process.

### Watchdog fights manual kiosk exit

**Symptom:** Field staff exits kiosk via PIN, watchdog re-enters within seconds.

**Likely cause:** `stopWatchdogService` was not called before exit, or the `ACTION_STOP_INTENTIONALLY` intent didn't deliver.

**Diagnose:**
- Filter `HeyloWatchdog: Received intentional stop request` — confirms the intent landed.
- If absent: stop intent didn't deliver.

**Fix:**
- The kiosk exit dialog widget should call `stopWatchdogService` first. If broken, the only safe path is to disable Device Owner via ADB (`adb shell dpm remove-active-admin com.heylo.app/.AppDeviceAdminReceiver`) — this is a destructive operation that requires re-provisioning.

---

## Bootstrap

### Tablet stuck on "Battery Too Low" screen even when charging

**Symptom:** Charging screen shows but doesn't recover even with charger plugged in.

**Likely causes:**
1. Charger not delivering enough amperage.
2. Samsung `BatteryState.charging` not firing reliably.
3. `Battery.onBatteryStateChanged` listener crashed.

**Diagnose:**
- Filter `HEYLO: Battery at X%, charging: Y` — values on each state change.
- If `charging: false` despite plugged in: Samsung quirk. Force-restart usually clears.
- Filter `HEYLO: Error in battery listener` — listener crashed.

**Fix:**
- Better charger (≥1A).
- Force-restart if Samsung state didn't update.

### "FATAL ERROR" screen appears on boot

**Symptom:** Boot leads to error screen with "Restart App" button.

**Likely causes:**
1. Crash in `_setup()` that's not caught.
2. Network-related error during auth that propagated as a fatal.

**Diagnose:**
- Filter `HEYLO: FATAL ERROR - SHOWING ERROR SCREEN TO USER` — confirms this path.
- Look for the Flutter `Exception:` field above to see what crashed.
- Filter `_setup` errors specifically: `HEYLO: Error during authentication flow:` etc.

**Fix:**
- If transient (network): tap Restart App.
- If reproducible: collect the exception text, read the relevant service file, fix and deploy.

### Boot deadlock on Samsung tablet

**Symptom:** Samsung tablet boots, shows splash, hangs forever (or reboots).

**Likely causes:**
1. `enterLockTaskEarly` failed.
2. `disablePairIpLicenseCheck` didn't fire early enough.
3. Unclean shutdown corrupted `/efs/MDM/`.

**Diagnose:**
- Java logcat (via ADB): filter `HeyloMainActivity: Early lock task mode:` — was it `SUCCESS` or `FAILED`?
- Look for `ClassNotFoundException: com.pairip.licensecheck` — PairIP fired before disable.

**Fix:**
- PairIP issue: ensure `disablePairIpLicenseCheck` is called BEFORE `super.onCreate` (line 25-29 of MainActivity.java). Don't reorder.
- /efs/MDM corruption: factory reset is the only fix. Sometimes Samsung Knox recovery helps.

---

## Voice Commands

### Wake word "heylo" not detected

**Symptom:** Resident says "heylo" but no response.

**Likely causes:**
1. Voice commands disabled (default state — needs 4-tap activation gesture).
2. STT model unavailable (`error_server_disconnected`).
3. Audio routing issue — STT can't pick up the mic.
4. Wake word recognized as a different word (Samsung mishearing).

**Diagnose:**
- Filter `VOICE_CMD: Disabling voice commands` — confirms current state.
- Filter `VOICE_CMD: Speech recognition not available on this device` — STT broken.
- Filter `VOICE_CMD: Heard:` — what is the recognizer actually hearing?
- If "heylo" comes through as "halo" / "hello": already covered by the 5-variant matcher.

**Fix:**
- 4-tap bottom-left of home screen to enable.
- Restart app if STT model is reporting unavailable.
- If audio issue: same diagnosis as call audio (`getAudioDiagnostics`).

### Voice command listening but commands ignored

**Symptom:** "Heylo" → "Yes?" plays, but saying "accept" / "deny" / "call staff" does nothing.

**Likely causes:**
1. Command timeout (10s) expired before command was spoken.
2. Command vocabulary doesn't match what was said.
3. Command matched but `_execute*` failed silently.

**Diagnose:**
- Filter `VOICE_CMD: Command timeout - returning to idle` — 10s expired.
- Filter `VOICE_CMD: Heard:` after wake word — what was recognized.
- Filter `VOICE_CMD: Matched command:` — command match reported.
- Filter `VOICE_CMD: Error executing` — execution failure.

**Fix:**
- Speak within 10s of "Yes?".
- Vocabulary: see [[Tablet/Voice Commands]] §2 for exact match phrases. Adding new phrases requires code change.

---

## General

### Tablet appears offline in fleet dashboard

**Symptom:** Tablet shows "offline" or last-seen >5 min ago.

**Likely causes:**
1. Tablet powered off or unplugged.
2. WebSocket connected but `DeviceStatusService` 15s reports failing.
3. Internet down at the site.

**Diagnose:**
- Filter `DEVICE_STATUS: Failed to report status` — POST failures.
- Filter `HTTP_SERVICE: Request failed to /device/status` — same.
- Filter `KIOSK: Battery level:` — was the tablet alive recently?
- If completely silent in CloudWatch: tablet is off or disconnected.

**Fix:**
- Send admin command `restart` if WS is connected but reports are failing.
- If WS not connected at all: physical-access check (charger, WiFi).

### CloudWatch logs missing for a tablet

**Symptom:** Specific tablet has no logs in `heylo-tablet-logs/{agency}/{device}` for hours.

**Likely causes:**
1. Tablet hasn't authed since boot — pre-auth `print` calls are queued (max 500).
2. `CloudWatchService.initialize()` failed (IAM creds).
3. CloudWatch Logs has a backend issue.

**Diagnose:**
- `tablet-logs` skill — try fetching with explicit time range.
- If the same tablet has recent logs in another stream: stream mapping changed.

**Fix:**
- Restart tablet to flush pre-auth queue.
- Verify IAM creds path (see "IAM credentials unavailable").

### Build number doesn't bump after release

**Symptom:** New APK uploaded but tablets don't update.

**Likely cause:** `pubspec.yaml`'s `version: X.Y.Z+N` integer after `+` wasn't incremented. The release-build skill might've forgotten the bump.

**Diagnose:**
- Compare current tablet `appVersion` in CloudWatch (from `device_status` reports) to the new version. If `N` is the same, the bump was missed.

**Fix:**
- Bump build number, rebuild, redeploy.
- See [[Tablet/Update Strategy]] and [[Tablet/Agent Work Guide]] gotchas.

---

## When to escalate vs DIY

**DIY-fixable** (just deploy a code change):
- Enum mismatches, missing null checks, missing `_parseData` cases.
- New `LogEventType` values, new platform channel methods.
- Adding a new command vocabulary, retry tuning.

**Escalate** (needs ops or backend):
- Cognito password drift requiring `regenerateDeviceId` (no UI).
- Play Store stuck states unresponsive to recovery flow.
- IAM Identity Pool misconfigurations.
- Samsung-specific firmware bugs.
- Network/DNS issues at the deployment site.

**Reboot tablet first** (cheapest fix, often works):
- Watchdog loops, stuck connection states, voice command zombie sessions, Daily SDK leaks.

---

## Adding to this runbook

When you resolve a real incident:

1. Add a new entry under the right subsystem.
2. Lead with the **observable symptom** (what was reported), not the technical cause.
3. Include the **specific log filter** that helped narrow the cause.
4. Include the **fix that worked** — even if it was just "restart the tablet."
5. Mark entries that turned out to be wrong with a strikethrough rather than deleting (so the next person doesn't re-derive the wrong conclusion).

Treat this doc as a growing institutional memory. Code-derived entries are starting points; real-incident entries are the gold.

---

## Where this connects

- [[Tablet/Logging Stack]] — log prefix table for grepping; the `tablet-logs` skill.
- [[Tablet/Onboarding Walkthrough]] — architecture context for understanding causes.
- [[Tablet/WS Contract]] §10 — symptom-to-cause table for WS-specific issues (subset of this doc).
- [[Tablet/Update Service]] — update-flow troubleshooting.
- [[Tablet/Voice Commands]] §10 — voice-command observability.
- [[Tablet/Native Layer]] — for Java-side issues (`adb logcat` filters).
