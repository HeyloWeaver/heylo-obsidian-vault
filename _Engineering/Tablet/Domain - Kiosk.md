---
type: domain
tags: [tablet, kiosk, devices]
owner: Mike
updated: 2026-04-22
status: current
---
# Tablet Domain - Kiosk & Device

## Primary ownership

- Android kiosk lockdown (lock-task mode, Device Admin, navigation bar / status bar suppression).
- Auto-start on boot via `BootReceiver`.
- Kiosk watchdog service (restarts app if killed).
- Self-hosted APK auto-update (version poll, download, silent install).
- Device status telemetry reporting (battery, connectivity, screen brightness).
- CloudWatch log shipping for remote diagnostics.
- Screen dim/wakelock for idle and call scenarios.
- Voice command interface (speech-to-text, text-to-speech).
- Escape-hatch gesture + PIN dialog for kiosk exit.

## Read these first

- `tablet/android/app/src/main/java/com/heylo/app/heylo/KioskManager.java` — Device Admin lock/unlock core logic.
- `tablet/android/app/src/main/java/com/heylo/app/heylo/KioskWatchdogService.java` — sticky foreground watchdog.
- `tablet/android/app/src/main/java/com/heylo/app/heylo/MainActivity.java` — Flutter entry, platform channel registration.
- `tablet/android/app/src/main/java/com/heylo/app/heylo/BootReceiver.java` — auto-start on boot.
- `tablet/android/app/src/main/java/com/heylo/app/heylo/ApkInstallReceiver.java` — handles silent install confirmation.
- `tablet/android/app/src/main/AndroidManifest.xml` — permissions, receivers, device admin declaration.
- `tablet/lib/services/kiosk.service.dart` — Dart platform channel wrapper for kiosk operations.
- `tablet/lib/services/update.service.dart` — version polling + APK download + install trigger.
- `tablet/lib/services/device_status.service.dart` — battery/connectivity/brightness reporting.
- `tablet/lib/services/cloudwatch.service.dart` — CloudWatch Logs shipping.
- `tablet/lib/controllers/device_status.controller.dart` — exposes device telemetry as streams.
- `tablet/lib/ui/common_widgets/kiosk_exit_gesture/` — 5-tap gesture detector.
- `tablet/lib/ui/common_widgets/kiosk_exit_dialog/` — PIN entry dialog.
- `tablet/lib/ui/common_widgets/screen_dim_wrapper/` — idle screen dimmer.
- `tablet/KIOSK_MODE_SETUP.md` — full kiosk provisioning guide.
- `tablet/UPDATE_STRATEGY.md` — APK update trade-offs.

## Backend relationship

- `POST /device/status` — tablet POSTs battery level, connectivity state, and screen brightness on a polling interval.
- APK version check — `UpdateService` polls a backend endpoint (check `update.service.dart` for the exact path) for the expected current build number.
- CloudWatch — direct HTTPS to CloudWatch Logs; no backend intermediary.
- Backend lambdas `lambdas/tablet-checker-2/` and `lambda/tabletChecker2.mjs` monitor device-last-seen timestamps and send alerts if a tablet goes offline.

## Common change patterns

1. **Kiosk lock/unlock behavior change** → modify `KioskManager.java` and update the corresponding Dart platform channel contract in `kiosk.service.dart` if method signatures change.
2. **APK update flow change** → modify `update.service.dart` (polling interval, version endpoint, download path) and/or `ApkInstallReceiver.java` (install confirmation); bump `pubspec.yaml` build number for the release.
3. **New device telemetry field** → add to `device_status.service.dart` POST payload and the corresponding backend DTO; update `DeviceStatusController` stream if the new field needs to be observed by the UI.
4. **New CloudWatch log event** → add a value to `tablet/lib/enums/log_event_type.enum.dart` and call `CloudwatchService.log(LogEventType.newEvent, ...)` at the relevant lifecycle point.
5. **Screen dim behavior** → modify `ScreenDimWrapper` widget timing constants; confirm wakelock is still acquired when a call is active.
6. **Escape PIN change** → update the PIN constant in both `kiosk_exit_dialog/` (Dart UI) and document in `KIOSK_MODE_SETUP.md`.

## Gotchas

- **Device Owner privilege is required** for lock-task mode and many `DevicePolicyManager` APIs. The `provisioning-template.json` sets this during initial AWS IoT provisioning. If a tablet is factory-reset, it must be re-provisioned through the full kiosk setup flow.
- **`KioskWatchdogService` must be a sticky foreground service** — if it is stopped or its notification is removed, Android may GC it under memory pressure, breaking auto-restart.
- **`BootReceiver` requires `RECEIVE_BOOT_COMPLETED` permission in `AndroidManifest.xml`** and must be declared as a receiver. Removing or renaming it breaks auto-start after reboot.
- **Build number (not semantic version) drives OTA.** `UpdateService` compares the integer after `+` in `pubspec.yaml`. Forgetting to increment means deployed tablets never pick up the update.
- **Silent APK install requires `REQUEST_INSTALL_PACKAGES` permission** and the Device Owner grant. Test on a real device; emulators may not enforce this the same way.
- **Two backend lambda paths for tablet health** — `lambda/tabletChecker.mjs` (legacy) and `lambdas/tablet-checker-2/` (newer). Confirm which is active before changing server-side tablet monitoring logic.
- **CloudWatch credentials** — `CloudwatchService` uses a pre-configured IAM mechanism (check the service for the exact approach). Rotating credentials requires updating both the app and the IAM policy.
- **Kiosk exit PIN is `2650`** — do not commit PIN changes without also updating `KIOSK_MODE_SETUP.md` and notifying ops.

## Done checklist

- Kiosk lock/unlock still works end-to-end on a real device (not just emulator) after any native change.
- App auto-restarts on boot after a factory-reset + reprovisioning cycle test.
- `KioskWatchdogService` survives a force-stop of the main app process.
- OTA update: build number bumped, APK uploaded, deployed tablet detects and installs within the polling interval.
- Device status POSTs continue reaching the backend after any telemetry change.
- CloudWatch logs appear in the correct log group / stream for the device.
- Escape-hatch gesture and PIN dialog still work after UI changes.
- `KIOSK_MODE_SETUP.md` updated if any provisioning step or PIN changes.
