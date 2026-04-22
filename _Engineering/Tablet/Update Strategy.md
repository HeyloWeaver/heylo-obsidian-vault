---
type: guide
tags: [tablet, updates, kiosk, ops]
owner: Mike
updated: 2026-04-22
status: current
source: tablet/UPDATE_STRATEGY.md
---
# Tablet — App Update Strategy

## The short answer

You add the Google account **after** setting device owner — the restriction only applies before provisioning. Once device owner is set, you can freely add accounts.

---

## Two strategies

### Strategy 1: Play Store Updates

**Workflow:**
1. Factory reset → skip Google account during setup wizard.
2. Set device owner via ADB or QR code.
3. Now add Google account (Settings → Accounts → Add account).
4. Install/update app via Play Store as normal.

**Benefits:** Standard automatic updates, no server infrastructure, familiar deployment process. Kiosk mode stays active — users still can't access Settings.

**When to use:** Production deployments where you want Google to handle distribution and a standard update cadence is acceptable.

---

### Strategy 2: Self-Hosted Updates (current implementation)

The app has `UpdateService` built in.

**Workflow:**
1. Factory reset → skip Google account (and keep it that way).
2. Set device owner via ADB or QR code.
3. App automatically checks the backend for a newer APK version, downloads it, and installs in the background.

**Benefits:** No Google account required, faster/controlled deployment timing, update all devices simultaneously, already implemented.

**Requirements:** Host APK on a server (currently S3 via `build-and-upload-apk.sh`), configure update endpoint, devices need internet.

**Code entry point:**
```dart
// lib/main.dart (~line 66)
if (isInternetAvailable) {
  UpdateService().startPeriodicUpdateCheck();
}
```

**When to use:** Testing/staging, rapid update deployment, full control over timing, no Google accounts on devices.

---

## Comparison

| Feature | Play Store | Self-Hosted (UpdateService) |
|---------|-----------|---------------------------|
| Google Account Required | Yes (after provisioning) | No |
| Setup Complexity | Low | Medium |
| Update Control | Google controls timing | You control timing |
| Infrastructure | None | Need server for APKs |
| Already Implemented | N/A | ✅ Yes |
| Update Speed | Google's schedule | Immediate |
| Kiosk Mode Compatible | ✅ Yes | ✅ Yes |

---

## Recommended hybrid approach

- **Development / testing:** Self-hosted (UpdateService) — fast iteration, no Google accounts needed, full control.
- **Production:** Add Google accounts + Play Store — more reliable, automatic, with UpdateService as a fallback.

---

## FAQ

**Will adding a Google account break kiosk mode?**
No. Kiosk restrictions remain active; users still can't access Settings.

**Can I add the Google account without exiting kiosk mode?**
You need to temporarily exit (via ADB or `KioskService.showSystemApps()`), add the account, then the app re-enters kiosk mode automatically.

**What if I want NO Google accounts on my tablets?**
Use the built-in `UpdateService` — it's already implemented and works without any Google account.

**Can I switch strategies later?**
Yes — you can add Google accounts to existing deployed devices at any time.

---

**Quick commands**

```bash
# Temporarily exit kiosk to add Google account:
# Tap top-right corner 5 times → PIN 2650 → Settings → Accounts → Add Google

# Check if a Google account exists on the device:
adb shell dumpsys account | grep -i google
```

See [[Tablet/Kiosk Mode Setup]] for full provisioning details and [[Tablet/Skills/release-build]] for how to build and upload a new APK.
