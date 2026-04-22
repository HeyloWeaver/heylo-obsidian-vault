---
type: guide
tags: [tablet, kiosk, ops, setup, android]
owner: Mike
updated: 2026-04-22
status: current
source: tablet/KIOSK_MODE_SETUP.md
---
# Heylo Tablet — Kiosk Mode Setup Guide

Full guide for enabling kiosk mode via Android Device Owner provisioning. For the condensed version see [[Tablet/Kiosk Quick Start]].

---

## Overview

Kiosk mode locks down the Android tablet to run only the Heylo app:

- **Lock Task Mode** — prevents users from exiting the app
- **Immersive Mode** — hides system UI (navigation bar, status bar)
- **Boot Auto-Start** — automatically launches Heylo on device boot
- **System App Hiding** — hides Settings and other system apps
- **Keyguard Disabled** — removes lock screen
- **Status Bar Disabled** — prevents notification panel access

---

## Prerequisites

- Android 11+ (API 30+) device
- Factory-reset device (required for device owner provisioning)
- ADB installed on your computer
- Heylo app installed on the device

⚠️ **The device MUST be factory reset before provisioning. Device owner can only be set with no existing accounts. You CAN add a Google account after device owner is set.**

---

## Provisioning methods

### Method 1: ADB (recommended for development)

**1. Factory reset the device**
Settings → System → Reset → Factory data reset. Complete setup wizard **without** adding any Google accounts.

**2. Enable Developer Options**
Settings → About tablet → Tap "Build number" 7 times → Settings → System → Developer options → Enable "USB debugging".

**3. Connect device via USB**

**4. Install the Heylo app**

Dev flavor (recommended for testing):
```bash
cd heylo-tablet
flutter build apk --flavor dev --release
adb install build/app/outputs/flutter-apk/app-dev-release.apk
```

Prod flavor:
```bash
cd heylo-tablet
flutter build apk --flavor prod --release
adb install build/app/outputs/flutter-apk/app-prod-release.apk
```

**5. Set device owner**

⚠️ **Command differs by flavor.**

Dev flavor:
```bash
adb shell dpm set-device-owner com.heylo.app.dev/com.heylo.app.AppDeviceAdminReceiver
```
Expected output:
```
Success: Device owner set to package com.heylo.app.dev
Active admin set to component {com.heylo.app.dev/com.heylo.app.AppDeviceAdminReceiver}
```

Prod flavor:
```bash
adb shell dpm set-device-owner com.heylo.app/.AppDeviceAdminReceiver
```
Expected output:
```
Success: Device owner set to package com.heylo.app
Active admin set to component {com.heylo.app/com.heylo.app.AppDeviceAdminReceiver}
```

**Package name format:** `{package_with_flavor_suffix}/{receiver_class_in_base_package}`

**6. Reboot**
```bash
adb reboot
```

**7. Verify kiosk mode** — app launches automatically, system UI hidden, Settings inaccessible.

**8. Add Google account (optional — for Play Store updates)**

Once device owner is set, you can add a Google account:
- **Via admin gesture:** Tap top-right corner 5 times → PIN **2650** → Settings → Accounts → Add Google account → restart app.
- **Programmatically:**
  ```dart
  await KioskService.showSystemApps();
  // User adds account in Settings
  await KioskService.hideSystemApps();
  ```

---

### Method 2: QR Code (recommended for production)

Ideal for deploying multiple devices.

**1. Factory reset the device.**

**2. Prepare `provisioning.json`:**
```json
{
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.heylo.app/.AppDeviceAdminReceiver",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": "https://your-server.com/heylo.apk",
  "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": false,
  "android.app.extra.PROVISIONING_WIFI_SSID": "YourWiFiNetwork",
  "android.app.extra.PROVISIONING_WIFI_PASSWORD": "YourWiFiPassword",
  "android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE": "WPA"
}
```

**3. Generate QR code** from the JSON (e.g., qr-code-generator.com).

**4. Provision the device** — start the setup wizard, tap the welcome screen 6 times, scan the QR code. The device downloads and installs the app and sets it as device owner automatically.

---

### Method 3: NFC Provisioning

1. Install an NFC provisioning app on a secondary device.
2. Factory reset the target tablet.
3. Configure provisioning settings in the NFC app.
4. Tap devices together during the setup wizard.

---

## App updates in kiosk mode

See [[Tablet/Update Strategy]] for the full comparison. Short version:

- **Play Store:** Set device owner first, then add Google account afterward. Updates work normally.
- **Built-in UpdateService (current):** App polls your server, downloads and installs new APKs silently. No Google account needed. Entry point: `lib/main.dart` lines 66–68.

---

## Using kiosk mode

### Automatic activation

Once provisioned, kiosk mode activates automatically on app start:
1. Detects device owner status.
2. Hides system apps.
3. Disables status bar.
4. Enables immersive mode.
5. Enters lock task mode.

### Manual control (for testing)

```dart
import 'package:heylo/services/kiosk.service.dart';

bool isOwner = await KioskService.isDeviceOwner();
await KioskService.setupFullKioskMode();
await KioskService.exitKioskMode();
String info = await KioskService.getDeviceOwnerInfo();
```

### KioskService API

| Function | Description |
|----------|-------------|
| `isDeviceOwner()` | Check if app is device owner |
| `enterKioskMode()` | Enable lock task mode |
| `exitKioskMode()` | Disable lock task mode |
| `isInKioskMode()` | Check if in lock task mode |
| `enableImmersiveMode()` | Hide system UI |
| `hideSystemApps()` | Hide Settings and system apps |
| `showSystemApps()` | Unhide system apps |
| `disableStatusBar()` | Disable notification panel |
| `enableStatusBar()` | Enable notification panel |
| `setupFullKioskMode()` | Enable all kiosk features |
| `teardownKioskMode()` | Disable all kiosk features |
| `getDeviceOwnerInfo()` | Get debug info |
| `postponeSystemUpdates()` | Block OS updates for up to 30 days |
| `setSystemUpdateWindow(start, end)` | Set maintenance window (minutes from midnight) |
| `allowAutomaticSystemUpdates()` | Enable automatic OS updates |
| `removeSystemUpdatePolicy()` | Restore default update behavior |
| `getSystemUpdatePolicyInfo()` | Get current update policy status |

---

## System update management

### Overview

Android system update prompts can take the device out of kiosk mode. By default, when kiosk mode is enabled, the app **automatically postpones Android system updates indefinitely** via `SystemUpdatePolicyService`.

### How it works

On kiosk mode start (`main.dart` lines 45–54), the app:
1. Sets up full kiosk mode.
2. Initializes `SystemUpdatePolicyService`.
3. Applies postpone policy immediately.
4. **Auto-renews every 25 days** (before the 30-day Android limit).
5. Runs daily checks to ensure the policy stays active.

Policy status (`system_update_policy.service.dart`):
```dart
Map<String, dynamic> status = await SystemUpdatePolicyService().getPolicyStatus();
// {lastApplied: "2025-01-15T10:30:00", daysSinceApplied: 5, daysUntilReapply: 20, needsReapply: false}
```

### Update policy options

**Option 1 — Postpone indefinitely (default, recommended)**

Zero configuration required. Policy renews automatically. Tablets never receive update prompts.

To force re-application:
```dart
await SystemUpdatePolicyService().forceReapply();
```

Best for: 24/7 kiosks, no maintenance windows, stability over latest OS updates.

⚠️ Trade-off: tablets never receive Android OS security updates. Use Option 2 if security patches are required.

**Option 2 — Update window**

Allow OS updates only during off-hours:
```dart
await KioskService.setSystemUpdateWindow(120, 300);  // 2 AM – 5 AM
```
Parameters are minutes from midnight. Edit `main.dart` lines 50–54 to replace `SystemUpdatePolicyService` initialization.

Best for: devices available for maintenance overnight.

**Option 3 — Automatic updates**

```dart
await KioskService.allowAutomaticSystemUpdates();
```

May briefly interrupt kiosk mode during installation. Best for non-critical deployments where security updates are a priority.

### Monitoring

```bash
# Check policy status via logs
adb logcat | grep "SystemUpdatePolicyService"
# Look for: "Applying system update postpone policy...", "System update policy applied successfully"
```

---

## Troubleshooting

### "Not allowed to set device owner"

Device has existing accounts or was not factory reset. Factory reset and complete setup without adding accounts.

### "Invalid component" / "Unknown admin"

Wrong package name for the installed flavor. Check:
```bash
adb shell pm list packages | grep heylo
```
Match the command to what you see (`com.heylo.app.dev` vs `com.heylo.app`).

### Kiosk mode not activating

```bash
adb shell dpm list-owners
# Should show: admin=ComponentInfo{com.heylo.app[.dev]/com.heylo.app.AppDeviceAdminReceiver}

adb logcat | grep -i "heylo\|kiosk"
# Look for: "HEYLO: Device owner status: true", "HEYLO: Kiosk mode enabled"
```

### App stuck in lock task mode

**Via admin gesture:** Tap top-right corner 5 times within 3 seconds → PIN **2650** → kiosk disabled. Restart app to re-enable.

**Via ADB:**
```bash
# Dev
adb shell dpm remove-active-admin com.heylo.app.dev/com.heylo.app.AppDeviceAdminReceiver
# Prod
adb shell dpm remove-active-admin com.heylo.app/.AppDeviceAdminReceiver
```

### Boot receiver not starting app

```bash
# Dev
adb shell dumpsys package com.heylo.app.dev | grep -A 20 "Receiver"
# Prod
adb shell dumpsys package com.heylo.app | grep -A 20 "Receiver"

# Test manually
adb shell am broadcast -a android.intent.action.BOOT_COMPLETED
```

### System update prompts still appearing

1. Verify device owner: `adb shell dpm list-owners`
2. Check service status:
   ```dart
   Map<String, dynamic> status = await SystemUpdatePolicyService().getPolicyStatus();
   // needsReapply should be false
   ```
3. Check Android policy: `await KioskService.getSystemUpdatePolicyInfo()` — should return "Policy: Updates postponed".
4. Check logs: `adb logcat | grep "SystemUpdatePolicyService"`
5. Force re-apply: `await SystemUpdatePolicyService().forceReapply()`
6. Some OEM devices (Samsung, Xiaomi) may have additional restrictions — try `setSystemUpdateWindow(120, 300)` instead.

---

## Removing device owner

**Via ADB:**
```bash
# Dev
adb shell dpm remove-active-admin com.heylo.app.dev/com.heylo.app.AppDeviceAdminReceiver
# Prod
adb shell dpm remove-active-admin com.heylo.app/.AppDeviceAdminReceiver
```

**Via Settings (if accessible):** Settings → Security → Device admin apps → Heylo → Deactivate.

**Via factory reset:** Removes device owner completely.

---

## Security considerations

- **Device Owner = full control** of device management APIs.
- **Physical security:** ensure tablets are physically secured.
- **Emergency exit:** admin gesture (tap top-right corner 5 times) + PIN **2650**.
- **Change default PIN:** consider rotating from `2650` in `KioskService.kioskExitPin` for production.
- Always test kiosk mode thoroughly before production deployment.

---

## Production deployment checklist

- [ ] Factory reset all devices
- [ ] Prepare QR code provisioning files
- [ ] Host APK on a secure server
- [ ] Configure WiFi credentials in provisioning JSON
- [ ] Test provisioning on one device end-to-end
- [ ] Verify all kiosk features work correctly
- [ ] Test auto-start after reboot
- [ ] Change default exit PIN (2650) for production
- [ ] Document emergency exit procedure for staff
- [ ] Train staff on device usage and emergency exit
- [ ] Set up remote device monitoring (CloudWatch — see [[Tablet/Skills/tablet-logs]])

---

## Reference

- [Android Device Administration](https://developer.android.com/guide/topics/admin/device-admin)
- [Lock Task Mode](https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode)
- [Device Owner Provisioning](https://developers.google.com/android/work/prov-devices)
- Log filter for support: `adb logcat -s HeyloKioskManager HeyloDeviceAdmin HeyloBootReceiver`
