---
type: skill
tags: [tablet, skills, claude, release, build]
owner: Mike
updated: 2026-04-22
status: current
skill_path: tablet/.claude/skills/release-build/SKILL.md
---
# Skill — release-build

Build a production release AAB (Android App Bundle) for the Heylo tablet app, bump the build number, and optionally upload to S3.

**Invoke with:** `release-build` · `build release` · `build aab` · `release aab` · `bump and build`

---

## What it does

1. **Reads** the current version from `tablet/pubspec.yaml` (`version: X.Y.Z+{buildNumber}`).
2. **Bumps** the integer build number by 1.
3. **Builds** the release AAB:
   ```bash
   flutter build appbundle --release --flavor prod
   ```
   Output: `build/app/outputs/bundle/prodRelease/app-prod-release.aab`
4. **Copies** the AAB to `~/Downloads/{buildNumber}.aab`.
5. **Reports** build number, AAB path, and file size.
6. **Asks** if you want to upload to S3. If yes, runs:
   ```bash
   ./scripts/build-and-upload-apk.sh prod heylo-prod
   ```
   Uploads to `s3://prod-heylo-health-apks/` and prints the WebSocket command for triggering sideload updates on deployed tablets.

---

## Notes

- The build number (integer after `+`) is what `UpdateService` compares on tablets for OTA detection. Always let this skill bump it rather than editing `pubspec.yaml` manually.
- Signing requires `android/key.properties` to be present (not committed — provided at build time from secure storage).
- After upload, deployed tablets will detect the new build number on their next poll interval and auto-install.
- See [[Tablet/Domain - Kiosk]] for the full OTA update flow.
