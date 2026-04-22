---
type: guide
tags: [tablet, agents]
owner: Mike
updated: 2026-04-22
status: current
---
# Tablet — Agent Work Guide

## What the Tablet owns

- Resident-facing Android kiosk app (Flutter / Dart).
- Video call UX via Daily.co — receiving and placing calls.
- Chat / messaging with staff (conversations + read receipts).
- Missed calls, unread messages, clock, weather display.
- Kiosk lockdown (Android Device Admin — no escape except PIN).
- Self-hosted APK auto-update (version check + silent install).
- Device telemetry reporting (battery, connectivity, brightness) to backend.
- CloudWatch log shipping for remote diagnostics.
- Voice command interface (speech-to-text, text-to-speech).

---

## High-signal files to read first

### App foundation
- `tablet/lib/main.dart` — bootstrap, GetIt registrations, `FlutterScreenUtil` init, error wiring.
- `tablet/lib/config/routes/routes.dart` — named route map.
- `tablet/lib/config/theme.dart` — Material theme, AtkinsonHyperlegible font.
- `tablet/pubspec.yaml` — dependency manifest; version + build number (OTA key).

### Auth & session
- `tablet/lib/controllers/auth.controller.dart` — `AuthState` stream, login/logout/refresh.
- `tablet/lib/services/auth.service.dart` — Cognito `USER_PASSWORD_AUTH`, token refresh.

### Realtime (WebSocket)
- `tablet/lib/services/realtime.service.dart` — single WS connection, event dispatch.
- `tablet/lib/enums/events.enum.dart` — event names; **must stay in sync with `backend/src/domain/enums/websocket-event.ts`**.

### Calls
- `tablet/lib/controllers/call.controller.dart` — call state machine.
- `tablet/lib/services/call.service.dart` — REST + Daily room/token.
- `tablet/lib/ui/screens/video_call/` — call UI.

### Chat
- `tablet/lib/controllers/conversation.controller.dart` — conversation list + message cache.
- `tablet/lib/controllers/read_receipt.controller.dart` — unread count tracking.
- `tablet/lib/services/conversation.service.dart` — chat REST.
- `tablet/lib/ui/screens/chat_detail/` — chat thread UI.

### Kiosk / native
- `tablet/android/app/src/main/java/com/heylo/app/heylo/KioskManager.java` — Device Admin lock/unlock.
- `tablet/android/app/src/main/java/com/heylo/app/heylo/KioskWatchdogService.java` — watchdog foreground service.
- `tablet/lib/services/kiosk.service.dart` — Dart platform channel wrapper.
- `tablet/lib/ui/common_widgets/kiosk_exit_gesture/` — 5-tap escape gesture.

### Updates
- `tablet/lib/services/update.service.dart` — version poll + APK download + install trigger.

---

## Fast change recipes

### 1. Add a new screen

1. Add a named route constant in `tablet/lib/config/routes/routes.dart`.
2. Create `tablet/lib/ui/screens/<name>/<name>.view.dart` (widget) and `<name>.view_model.dart` (interaction logic).
3. Wire navigation from the appropriate entry point (e.g., a card on the home screen).
4. If the screen needs new data: add a service method → add a controller stream → observe in the view via `StreamBuilder`.
5. Use `FlutterScreenUtil` (`sp`, `w`, `h` extensions) for all sizing — never hardcode pixel values.
6. Colors must come from `Theme.of(context)` or the constants in `theme.dart`; no raw hex.

### 2. Add a new API call

1. Add a method to the relevant service file in `tablet/lib/services/`.
2. Define request DTO in `tablet/lib/models/requests/` and response DTO in `tablet/lib/models/response/`, annotated with `@JsonSerializable`.
3. Run `flutter pub run build_runner build --delete-conflicting-outputs` to regenerate `*.g.dart`.
4. Inject the service into the relevant controller via GetIt; expose the result as a stream.
5. Handle loading, error, and empty states in the view.

### 3. Handle a new WebSocket event

1. Add the event name to `tablet/lib/enums/events.enum.dart` — value must match what the backend emits in `websocket-event.ts`.
2. Add a case to the dispatch switch in `tablet/lib/services/realtime.service.dart`.
3. Parse the payload and call the relevant controller method.
4. Update the controller's stream to reflect the new state.
5. Coordinate with Backend and verify the event shape in `backend/src/domain/enums/websocket-event.ts`.

### 4. Add a native Android platform channel

1. Define the method in `tablet/android/.../MainActivity.java` inside `configureFlutterEngine` → `MethodChannel` handler.
2. Wrap it in a Dart service class in `tablet/lib/services/` using `MethodChannel` with the same channel name.
3. Keep channel name and method name strings identical in both places.
4. If you add a broadcast (event channel), wire `EventChannel` in Java and `EventChannel.receiveBroadcastStream()` in Dart.

### 5. Cut a new release / OTA update

1. Bump the integer build number after `+` in `version` in `tablet/pubspec.yaml` (e.g., `1.1.4+134` → `1.1.4+135`).
2. Follow the steps in `.claude/skills/release-build/` (or run the skill directly via Claude).
3. Upload the signed APK to the self-hosted location (S3 bucket or backend endpoint) where `UpdateService` polls.
4. Tablets on the previous build number will detect the bump and auto-install.

---

## Gotchas and drift risks

- **`events.enum.dart` must mirror `websocket-event.ts`** — any mismatch means the tablet silently drops WS events. Always update both when adding a new event type.
- **Landscape only** — `FlutterScreenUtil` is initialized for `1280×800` landscape. Never add portrait breakpoints or assume a portrait aspect ratio.
- **`GetIt` registration order matters** — services that depend on other services must be registered after their dependencies in `main.dart`. A circular dependency will crash at startup.
- **`json_serializable` codegen must be re-run** — adding a field to a `@JsonSerializable` model without running `build_runner` will compile but silently fail to deserialize the new field.
- **Kiosk escape PIN is `2650`** — document changes to this in both `KioskManager.java` and `KIOSK_MODE_SETUP.md` if you ever rotate it.
- **Build number, not semantic version, drives OTA** — `UpdateService` compares integers. Forgetting to bump the build number means deployed tablets won't update even after a release.
- **Self-signed APK installs require `REQUEST_INSTALL_PACKAGES`** — if `AndroidManifest.xml` permission is removed, the install step silently fails.
- **Two lambda paths exist in the backend for tablet checking** — `lambda/tabletChecker.mjs` (legacy) and `lambdas/tablet-checker-2/` (newer). If changing server-side tablet health logic, confirm which is active.
- **Token storage is `FlutterSecureStorage` with `encryptedSharedPreferences: true`** — avoid reading tokens from `SharedPreferences` directly; always go through `AuthService`.
- **`reactStrictMode`-equivalent note:** the Flutter `debug` build mode hot-reloads stateful widgets; always test kiosk locking behavior on a real device in `--release`, not the emulator.

---

## Done checklist for Tablet tasks

- All new Dart models have `build_runner`-regenerated `*.g.dart` files committed.
- New WS event types are added to both `events.enum.dart` (Dart) and `websocket-event.ts` (backend).
- Landscape layout renders correctly on a 1280×800 landscape tablet (or emulator).
- No hardcoded pixel values — use `FlutterScreenUtil` extensions.
- No raw hex colors — use `Theme.of(context)` or `theme.dart` constants.
- Auth flows (token refresh, unauthenticated redirect) still work after changes to service/controller layer.
- Kiosk locking/unlocking still works on a real device after any native or platform-channel change.
- Build number in `pubspec.yaml` is bumped if the change should trigger an OTA push.
- CloudWatch log events are emitted for any new significant lifecycle steps.
- Update `_Engineering/Tablet/*` notes when architecture, contracts, or the WS event schema changes.
