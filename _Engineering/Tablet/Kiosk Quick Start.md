---
type: guide
tags: [tablet, kiosk, ops, setup]
owner: Mike
updated: 2026-04-22
status: current
source: tablet/KIOSK_QUICK_START.md
---
# Kiosk Mode — Quick Start

Fast setup reference. For the full guide see [[Tablet/Kiosk Mode Setup]].

---

## Steps

### 1. Factory reset the device

Settings → System → Reset → Factory data reset

⚠️ **Skip Google account setup during the setup wizard.** You can add it later in step 5.

### 2. Enable USB debugging

1. Settings → About tablet → Tap "Build number" 7 times.
2. Settings → System → Developer options → Enable "USB debugging".

### 3. Install app and set device owner

**⚠️ The device-owner command differs by build flavor.**

**Dev flavor (recommended for testing):**
```bash
cd heylo-tablet

flutter build apk --flavor dev --release
adb install build/app/outputs/flutter-apk/app-dev-release.apk

# Note the .dev suffix in the package name
adb shell dpm set-device-owner com.heylo.app.dev/com.heylo.app.AppDeviceAdminReceiver

adb reboot
```

**Prod flavor:**
```bash
cd heylo-tablet

flutter build apk --flavor prod --release
adb install build/app/outputs/flutter-apk/app-prod-release.apk

# No suffix for prod
adb shell dpm set-device-owner com.heylo.app/.AppDeviceAdminReceiver

adb reboot
```

**Package name format:** `{package_with_flavor_suffix}/{receiver_class_in_base_package}`
- Dev: `com.heylo.app.dev` + `/com.heylo.app.AppDeviceAdminReceiver`
- Prod: `com.heylo.app` + `/.AppDeviceAdminReceiver`

### 4. Verify kiosk mode

The app launches automatically after reboot in kiosk mode.

### 5. Add Google account (optional — for Play Store updates)

1. Tap the **top-right corner** of the screen **5 times** within 3 seconds.
2. Enter PIN: **2650**
3. Settings → Accounts → Add account → Google.
4. Restart the app to re-enter kiosk mode.

---

## What you get

- App automatically starts on boot
- System UI hidden (navigation bar, status bar)
- Users cannot exit the app
- Settings and system apps hidden
- Lock screen disabled
- Full-screen immersive mode

---

## Quick reference commands

```bash
# Check device owner
adb shell dpm list-owners

# View kiosk logs
adb logcat | grep -E "HEYLO|Kiosk"

# Test boot receiver manually
adb shell am broadcast -a android.intent.action.BOOT_COMPLETED

# Remove device owner — dev flavor
adb shell dpm remove-active-admin com.heylo.app.dev/com.heylo.app.AppDeviceAdminReceiver

# Remove device owner — prod flavor
adb shell dpm remove-active-admin com.heylo.app/.AppDeviceAdminReceiver
```

**Exit kiosk on the tablet:** Tap top-right corner 5 times → PIN **2650**. Restart app to re-enter.

---

## Troubleshooting one-liners

| Error | Fix |
|-------|-----|
| "Not allowed to set device owner" | Factory reset required — device must have no accounts |
| "Invalid component" when setting device owner | Wrong flavor — check with `adb shell pm list packages \| grep heylo` |
| App doesn't start on boot | `adb shell dumpsys package com.heylo.app.dev \| grep -A 5 Receiver` |
| Stuck in kiosk mode | Tap top-right corner 5 times → PIN 2650 |

---

## Key files

| File | Purpose |
|------|---------|
| `android/.../MainActivity.java` | Method channel setup |
| `android/.../KioskManager.java` | Kiosk control logic |
| `android/.../AppDeviceAdminReceiver.java` | Device admin callbacks |
| `android/.../BootReceiver.java` | Auto-start on boot |
| `lib/services/kiosk.service.dart` | Flutter kiosk service |
| `android/.../res/xml/device_admin_receiver.xml` | Device admin policies |
| `android/.../AndroidManifest.xml` | Permissions & receivers |
