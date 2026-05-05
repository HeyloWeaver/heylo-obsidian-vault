---
type: overview
tags: [tablet, reference]
owner: Mike
updated: 2026-05-05
status: current
---
# Tablet — High Level Overview

The Heylo tablet app is a Flutter (Dart) Android application designed to run in kiosk mode on resident-facing tablets deployed at care sites. It is the primary touchpoint for residents — allowing them to receive and place video calls, exchange chat messages with staff, check the time and weather, and receive missed-call and unread-message notifications. The app is locked into landscape orientation, disables all system UI navigation, and auto-restarts on boot. Remote management (device status, CloudWatch logging, self-hosted APK auto-updates) is built in so that a deployed tablet requires zero physical intervention for routine updates. Two build flavors exist: `dev` (package `com.heylo.app.heylo.dev`) and `prod` (`com.heylo.app.heylo`).

At a glance: `lib/main.dart` bootstraps the app with Firebase Crashlytics error wiring, initializes `FlutterScreenUtil` for landscape scaling, and registers all controllers via `GetIt` DI. Controllers are long-lived singletons that own reactive state via `RxDart`/`BehaviorSubject`; views (`.view.dart`) observe those streams, and view-models (`.view_model.dart`) encapsulate interaction logic. HTTP is done via Dio; real-time updates come through a WebSocket managed by `RealtimeService`; auth is AWS Cognito with JWT refresh. The `KioskService` wraps the native `KioskManager.java` Android Device Admin to lock/unlock the kiosk shell.

---

## 1. Concise architectural overview

### Stack

- **Language / framework:** Dart 3, Flutter SDK ^3.7.0, Material Design.
- **State management:** RxDart `BehaviorSubject` streams exposed by controllers; views use `StreamBuilder`. No Provider/Riverpod/Bloc — controllers are `GetIt`-registered singletons.
- **DI:** `GetIt` — all controllers and services are registered in `main.dart` before `runApp`.
- **HTTP:** Dio — base URL read from `FlavorConfig`, auth token injected via `AuthInterceptor`.
- **Auth:** AWS Cognito (`amazon_cognito_identity_dart_2`). Login via `USER_PASSWORD_AUTH`. Token refresh on 401. Credentials stored in `FlutterSecureStorage`.
- **Realtime:** `RealtimeService` maintains a single WebSocket (`web_socket_channel`) to the backend's API Gateway WS endpoint. Auto-reconnects with linear back-off. Incoming frames are decoded and dispatched to controllers by event type (matching the `Events` enum).
- **Video calling:** `daily_flutter` package — Daily.co WebRTC SDK. Room name + meeting token fetched from the backend; tablet joins as a participant.
- **Voice commands:** `speech_to_text` and `flutter_tts` — wake-word style activation, voice command state machine in `VoiceCommandService`.
- **Device monitoring:** `battery_plus`, `connectivity_plus`, `screen_brightness`, `wakelock_plus` — polled by `DeviceStatusService` and reported to the backend.
- **Logging / crash:** Firebase Crashlytics + `CloudwatchService` (raw HTTP to CloudWatch Logs endpoint) — key lifecycle and error events are shipped to CloudWatch for remote diagnostics.
- **Updates:** `in_app_update` + `UpdateService` — polls a backend endpoint for a newer APK version and triggers self-hosted install (not Play Store).
- **Kiosk / Android native:** `KioskManager.java` (Device Admin), `AppDeviceAdminReceiver.java`, `BootReceiver.java`, `KioskWatchdogService.java` — exposed to Flutter via a platform channel wrapped in `KioskService`.
- **Assets / codegen:** `flutter_gen` for strongly-typed asset references; `build_runner` for JSON serialization (`json_serializable`).
- **Responsive layout:** `flutter_screen_util` — initialized for 1280×800 landscape.
- **Deploy:** flavor-based APK builds (`--flavor dev|local|prod`). Two update strategies documented in `UPDATE_STRATEGY.md` (self-hosted vs. Play Store). Build automation in `.claude/skills/release-build/`.

### Folder structure

```
tablet/
├── lib/
│   ├── main.dart                     # App bootstrap, GetIt registration, runApp
│   ├── config/
│   │   ├── theme.dart                # Material ThemeData (AtkinsonHyperlegible font)
│   │   └── routes/routes.dart        # Named route definitions
│   ├── controllers/                  # Long-lived reactive singletons (8 files)
│   │   ├── app_config.controller.dart    # /app/config response (WS endpoint, region)
│   │   ├── auth.controller.dart          # Login state, Cognito token lifecycle
│   │   ├── call.controller.dart          # Call state machine (idle/incoming/active)
│   │   ├── conversation.controller.dart  # Chat list + per-conversation message cache
│   │   ├── device_status.controller.dart # Battery, connectivity, brightness
│   │   ├── read_receipt.controller.dart  # Unread-count tracking per conversation
│   │   ├── user.controller.dart          # Resident user profile
│   │   └── weather.controller.dart       # Current + forecast weather
│   ├── services/                     # Stateless logic and platform integrations (25 files)
│   │   ├── auth.service.dart             # Cognito auth flows, token refresh
│   │   ├── call.service.dart             # Call REST endpoints + Daily room/token
│   │   ├── realtime.service.dart         # WebSocket management + event dispatch
│   │   ├── conversation.service.dart     # Chat REST endpoints
│   │   ├── read_receipt.service.dart     # Read-receipt REST endpoints
│   │   ├── user.service.dart             # User REST endpoints
│   │   ├── weather.service.dart          # Weather REST endpoint
│   │   ├── kiosk.service.dart            # Platform channel to KioskManager.java
│   │   ├── update.service.dart           # Self-hosted APK version check + install
│   │   ├── device_status.service.dart    # Device telemetry to backend
│   │   ├── voice_command.service.dart    # STT / TTS voice command state machine
│   │   ├── cloudwatch.service.dart       # CloudWatch Logs shipping
│   │   ├── system_update_policy.service.dart  # Android system-update policy control
│   │   └── [12 others — notifications, audio, etc.]
│   ├── models/
│   │   ├── call.dart                 # Call, CallStatus, CallParticipant
│   │   ├── conversation.dart         # Conversation metadata
│   │   ├── chat_message.dart         # Individual message + attachment
│   │   ├── user_profile.dart         # Resident + staff profiles
│   │   ├── weather.dart              # Current + forecast structs
│   │   ├── requests/                 # Outbound API request DTOs
│   │   └── response/                 # Inbound API response DTOs
│   ├── enums/
│   │   ├── call_status.enum.dart
│   │   ├── events.enum.dart          # WebSocket event names — must match backend
│   │   ├── voice_command_state.enum.dart
│   │   ├── log_event_type.enum.dart
│   │   └── [4 others]
│   ├── ui/
│   │   ├── screens/
│   │   │   ├── login/                # Auth screen (username + password)
│   │   │   ├── home/                 # Main dashboard
│   │   │   │   ├── weather_card/
│   │   │   │   ├── incoming_call/    # Incoming call overlay
│   │   │   │   ├── missed_calls_card/
│   │   │   │   ├── unread_messages_card/
│   │   │   │   ├── clock_card/
│   │   │   │   └── home_app_bar/
│   │   │   ├── video_call/           # Active call UI
│   │   │   │   ├── calling/          # Ringing/connecting state
│   │   │   │   ├── participant_video_view/
│   │   │   │   └── local_video_view/
│   │   │   ├── chat_detail/          # Single conversation thread
│   │   │   └── weather_detail/       # Expanded weather forecast
│   │   └── common_widgets/
│   │       ├── button.view.dart
│   │       ├── call_staff.view.dart
│   │       ├── voice_command_indicator/
│   │       ├── connectivity/
│   │       ├── update_notification/
│   │       ├── screen_dim_wrapper/   # Idle screen dimmer
│   │       ├── kiosk_exit_gesture/   # 5-tap top-right corner unlock
│   │       └── kiosk_exit_dialog/    # PIN entry dialog (PIN: 2650)
│   └── gen/                          # flutter_gen + build_runner output (do not edit)
├── android/
│   ├── app/src/main/java/com/heylo/app/heylo/
│   │   ├── MainActivity.java         # Flutter entry, registers platform channels
│   │   ├── KioskManager.java         # Device admin lock/unlock logic
│   │   ├── AppDeviceAdminReceiver.java
│   │   ├── BootReceiver.java         # Auto-start on boot
│   │   ├── ShutdownReceiver.java
│   │   ├── PackageReplacedReceiver.java
│   │   ├── ApkInstallReceiver.java   # Handles silent APK installs
│   │   └── KioskWatchdogService.java # Foreground service that restarts kiosk if killed
│   ├── app/src/main/AndroidManifest.xml
│   └── provisioning-template.json    # AWS IoT provisioning template
├── assets/
│   ├── images/, icons/, audio/, fonts/  # AtkinsonHyperlegible + UI assets
├── scripts/
├── pubspec.yaml                      # Flutter deps manifest
├── KIOSK_MODE_SETUP.md               # Full kiosk provisioning guide (727 lines)
├── KIOSK_QUICK_START.md
├── UPDATE_STRATEGY.md
└── .claude/skills/
    ├── tablet-logs/                  # CloudWatch log fetcher skill
    └── release-build/                # Release build automation skill
```

### Key concepts

1. **GetIt DI, controller-centric.** All business logic lives in controllers (`controllers/`). Services (`services/`) are stateless and injected into controllers. Views observe controller streams and call view-model methods. This mirrors MVVM but without a formal framework — don't add Provider or Bloc.
2. **Single WebSocket for all realtime.** `RealtimeService` owns one persistent WS connection to the same API Gateway endpoint the web frontend uses. Incoming JSON frames carry an `event` field that maps to `Events` enum values; `RealtimeService` dispatches to the appropriate controller. Keep `Events` enum in sync with backend `websocket-event.ts`.
3. **Cognito auth with secure storage.** `AuthService` handles `USER_PASSWORD_AUTH`, token refresh, and logout. Tokens (`idToken`, `accessToken`, `refreshToken`) are persisted in `FlutterSecureStorage`. On app start, `AuthController` attempts a silent token refresh before showing the home screen.
4. **Kiosk = Android Device Admin.** `KioskService` (Dart) wraps a platform method channel to `KioskManager.java`. The Device Admin policy disables the back/home/recents gestures, hides the navigation bar, and pins the app. `KioskWatchdogService` is a foreground Android service that relaunches the app if it is killed. The escape hatch is a 5-tap gesture on the top-right corner followed by PIN `2650`.
5. **Self-hosted APK updates.** `UpdateService` polls a backend endpoint for the current expected APK version. If the installed version is behind, it downloads the APK and triggers install via `ApkInstallReceiver`. This bypasses the Play Store and works in a managed-device context. See `UPDATE_STRATEGY.md` for trade-offs.
6. **Flavor system.** `--flavor dev`, `--flavor local`, and `--flavor prod` control the package name, API base URL, and Cognito pool/client IDs. `local` is for emulator/device testing against a local backend; never hardcode env-specific values in Dart code — use `FlavorConfig`.

### Main entry points

- **App start:** `lib/main.dart` → `WidgetsFlutterBinding.ensureInitialized()` → Firebase Crashlytics setup → `GetIt` registrations → `FlutterScreenUtil.init()` → `runApp(HeyloApp())`.
- **Routes:** `lib/config/routes/routes.dart` — named routes to Login, Home, VideoCall, ChatDetail, WeatherDetail.
- **Boot persistence:** `android/.../BootReceiver.java` starts `MainActivity` on device reboot (requires `RECEIVE_BOOT_COMPLETED` permission).
- **Native kiosk:** `android/.../KioskManager.java` + `AppDeviceAdminReceiver.java` — device admin policies, pin task, lock task mode.

### Data flow (typical scenarios)

- **Login:** Resident enters credentials → `AuthService.login()` calls Cognito `USER_PASSWORD_AUTH` → stores tokens in secure storage → fetches `/user/my` and `/app/config` → `AppConfigController` initializes WS endpoint → `RealtimeService.connect()`.
- **Incoming call:** Backend pushes `CallCreated` over WS → `RealtimeService` dispatches to `CallController` → `CallController` emits `incoming` state → `HomeScreen` shows incoming call overlay → resident taps Accept → `CallService.joinCall()` fetches Daily token → `daily_flutter` joins room.
- **Chat message received:** Backend pushes `ConversationMessageCreated` over WS → `ConversationController` updates message list stream → `UnreadMessagesCard` badge increments.
- **APK update:** `UpdateService` polls on a timer → detects new version → downloads APK to external storage → triggers install via platform channel → `PackageReplacedReceiver` signals completion.

---

## 2. Detailed technical deep-dive

### Auth & token lifecycle

`AuthService` wraps `amazon_cognito_identity_dart_2`:

- **Login:** `authenticateUser(username, password)` → `USER_PASSWORD_AUTH` → returns `idToken`, `accessToken`, `refreshToken`.
- **Refresh:** On 401 from any Dio request (via `AuthInterceptor`), `AuthService.refreshToken()` is called with the stored `refreshToken`. If refresh fails, `AuthController` emits unauthenticated state and the app navigates to Login.
- **Logout:** Clears `FlutterSecureStorage` and closes the WS.
- **Storage keys:** `idToken`, `accessToken`, `refreshToken` — accessed through `FlutterSecureStorage` with `encryptedSharedPreferences: true` on Android.

Dio interceptors:
- `AuthInterceptor` — attaches `Authorization: Bearer <idToken>` to every request; on 401, refreshes token and retries once.
- `LoggingInterceptor` (dev only) — logs requests/responses.

### Realtime: `RealtimeService`

- **Connect:** After login, `AppConfigController` resolves the WS endpoint URL from `/app/config`; `RealtimeService.connect(url, idToken)` opens `WebSocketChannel(Uri.parse('wss://...?jwt=$idToken'))`.
- **Heartbeat:** Sends a `ping` HTTP request via `connectionService.ping()` on an interval (matching the frontend's 4s ping). This keeps the API Gateway connection alive.
- **Reconnect:** `onDone` / `onError` triggers a reconnect with linear back-off (1s, 2s, 4s… max 30s).
- **Dispatch:** Each incoming frame is decoded as JSON. The `event` field maps to `Events` enum values. A switch-statement dispatches to the relevant controller method. Unknown events are logged to CloudWatch.
- **Events consumed:** `CallCreated`, `CallConnected`, `CallMissed`, `CallRejected`, `CallEnded`, `ConversationMessageCreated`, `AlertCreated` (for tablet-relevant alerts), `DeviceStatusUpdate`, `Pong`.

### Video calling

Daily.co via `daily_flutter`:

1. `CallController` receives `CallCreated` WS event → transitions to `incoming` state.
2. Resident accepts → `CallService.joinCall(callId)` → `GET /call/:id/token` → token.
3. `CallController` initializes `CallClient` with the room URL and token.
4. `VideoCallScreen` mounts `ParticipantVideoView` (remote) and `LocalVideoView` (self).
5. Lifecycle events (`connected`, `left`, `error`) transition `CallController` state and PATCH the backend (`/call/:id/connected`, `/call/:id/ended`).
6. On call end, `daily_flutter` `CallClient` is destroyed and the home screen resumes.

Key files: `lib/controllers/call.controller.dart`, `lib/services/call.service.dart`, `lib/ui/screens/video_call/`.

### Kiosk mode

The kiosk is implemented as an Android Device Admin:

- `AppDeviceAdminReceiver` is registered in `AndroidManifest.xml` as `android.app.action.DEVICE_ADMIN_ENABLED`. The provisioning template (`provisioning-template.json`) provisions the tablet with Heylo as Device Owner.
- `KioskManager.startKiosk()` calls `startLockTask()` (lock-task mode) and `setStatusBarDisabled(true)` / `hideNavigationBar()`.
- `KioskManager.stopKiosk()` exits lock-task mode — only reachable via the PIN dialog.
- `KioskWatchdogService` is a sticky foreground `Service` that posts a delayed check: if `MainActivity` is not in the foreground, it broadcasts an intent to restart it.
- **Escape hatch:** `KioskExitGestureDetector` widget watches for 5 taps within 2s on the top-right quadrant → shows `KioskExitDialog` (PIN `2650`) → calls `KioskService.stopKiosk()`.
- **Boot persistence:** `BootReceiver` listens for `BOOT_COMPLETED` and starts `MainActivity`.
- **Screen dim:** `ScreenDimWrapper` widget dims the screen after 5 minutes of inactivity (taps reset the timer); `wakelock_plus` prevents the OS from sleeping during an active call.

Full setup: `KIOSK_MODE_SETUP.md` (727 lines) and `KIOSK_QUICK_START.md`.

### APK update strategy

`UpdateService`:

1. Polls `GET /device/update-info` (or equivalent backend endpoint) on a background timer.
2. Compares `packageInfo.buildNumber` (the integer after `+` in `pubspec.yaml`'s `version`) against the server's expected version.
3. If behind: downloads APK to `getExternalStorageDirectory()`, then triggers install via a platform channel that calls `Intent(Intent.ACTION_VIEW)` with the APK URI and `INSTALL_ALLOW_TEST` / `REQUEST_INSTALL_PACKAGES` permission.
4. `PackageReplacedReceiver` handles `MY_PACKAGE_REPLACED` broadcast to confirm successful install and restart the app into kiosk mode.

Two strategies are documented in `UPDATE_STRATEGY.md`:
- **Self-hosted (current):** APK hosted on S3/backend; `UpdateService` polls and downloads.
- **Play Store managed:** Managed Google Play for enterprise; requires device enrollment in Android Enterprise. Lower ops overhead but more setup.

### Device status & CloudWatch

`DeviceStatusService` polls on a 30s interval:
- `battery_plus` → charge level + is-charging.
- `connectivity_plus` → WiFi/cellular/none.
- `screen_brightness` → current brightness value.
- POSTs to `POST /device/status` on the backend.

`CloudwatchService` ships structured log events to CloudWatch Logs:
- Uses a direct HTTPS call (not an AWS SDK — credentials are embedded via IAM role + Cognito identity pool or pre-signed URL strategy).
- Key events logged: app start, login, WS connect/disconnect, call events, APK update lifecycle, errors.
- Log group and stream names are device-specific to make per-tablet debugging tractable.

### Voice commands

`VoiceCommandService` orchestrates:
1. Idle: microphone off, `VoiceCommandState.idle`.
2. Resident taps the mic icon (or a wake gesture) → `activate()` → `speech_to_text.listen()`.
3. Recognized phrase is matched against a command set (call staff, go home, etc.).
4. Matched command is executed; `flutter_tts` gives audio feedback.
5. Times out after 8s of silence → returns to idle.

### Conventions & quirks

- **Landscape only.** `SystemChrome.setPreferredOrientations([DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight])` is called in `main.dart`. Never add portrait-mode layout assumptions.
- **`FlavorConfig` for env.** API base URL, Cognito pool/client IDs, and feature flags live in the flavor config — not in `dart-define` or hardcoded strings.
- **JSON serialization via `json_serializable`.** Run `flutter pub run build_runner build` after editing any model class annotated with `@JsonSerializable`. Generated files (`*.g.dart`) are committed.
- **`GetIt` vs widget tree DI.** Controllers and services are GetIt singletons. Do not use `InheritedWidget` or `Provider` to pass them down — just `GetIt.instance<MyController>()` (or the `sl<>()` alias if established in the codebase).
- **Platform channel naming.** The Kiosk platform channel name must match exactly between `KioskService` (Dart) and `MainActivity.java`. If you rename it in one place, rename in both.
- **`gen/` is generated.** Never edit files under `lib/gen/`. Re-run `flutter pub run flutter_gen run` after adding assets to `pubspec.yaml`.
- **Build number is the update key.** `UpdateService` compares integer build numbers, not semantic version strings. Bump the integer after `+` in `version: x.y.z+N` in `pubspec.yaml` for every release that should trigger an OTA update.

---

## 3. Exhaustive reference

### `lib/controllers/` (8 files)

- `app_config.controller.dart` — fetches `GET /app/config` after login; exposes WS endpoint URL and AWS region to `RealtimeService`. Streams `AppConfig` model.
- `auth.controller.dart` — orchestrates login/logout, token refresh, unauthenticated redirect. Streams `AuthState (loading | authenticated | unauthenticated)`.
- `call.controller.dart` — owns the call state machine: `idle → incoming → connecting → active → ended`. Listens for WS `CallCreated`; delegates Daily SDK lifecycle to `CallService`. Streams `CallState`.
- `conversation.controller.dart` — maintains a sorted list of conversations and per-conversation message pages. Handles `ConversationMessageCreated` WS events to update lists in real time. Streams `List<Conversation>` and `List<ChatMessage>`.
- `device_status.controller.dart` — wraps `DeviceStatusService`; streams battery/connectivity/brightness; triggers backend POSTs on change.
- `read_receipt.controller.dart` — tracks unread message counts per conversation. Updated by WS events and by marking messages read via `ReadReceiptService`. Streams `Map<conversationId, int>`.
- `user.controller.dart` — fetches and caches the resident's `UserProfile`. Streams `UserProfile?`.
- `weather.controller.dart` — fetches weather on startup and refreshes hourly. Streams `WeatherData?`.

### `lib/services/` (~25 files)

HTTP services (Dio): `auth.service`, `call.service`, `conversation.service`, `read_receipt.service`, `user.service`, `weather.service`, `device_status.service`.

Platform/integration services: `kiosk.service` (platform channel), `update.service` (APK), `voice_command.service` (STT/TTS), `cloudwatch.service` (logging), `system_update_policy.service` (Android enterprise update policy).

Representative endpoints:
- `call.service`: `GET /call/:id`, `GET /call/:id/token`, `GET /call/my/with/resident/:id`, `PATCH /call/:id/{connected|missed|rejected|ended}`.
- `conversation.service`: `GET /conversation`, `GET /conversation/:id/messages`, `POST /conversation/:id/message`.
- `read_receipt.service`: `POST /read-receipt` (mark messages read).
- `user.service`: `GET /user/my`.
- `device_status.service`: `POST /device/status`.
- `weather.service`: `GET /weather` (proxied through backend or direct to weather API — check `weather.service.dart`).

### `lib/models/`

- `call.dart` — `Call`, `CallStatus` (idle/incoming/connecting/active/ended/missed/rejected), `CallParticipant`.
- `conversation.dart` — `Conversation` (id, participants, lastMessage, unreadCount).
- `chat_message.dart` — `ChatMessage` (id, senderId, body, sentAt, readAt?).
- `user_profile.dart` — `UserProfile` (id, name, avatarUrl, roleId).
- `weather.dart` — `WeatherData` (current conditions, hourly/daily forecast).
- `requests/` — per-endpoint request DTOs.
- `response/` — per-endpoint response DTOs (all JSON-serializable via `json_serializable`).

### `lib/enums/`

- `events.enum.dart` — `Events` enum; values must match `websocket-event.ts` in the backend.
- `call_status.enum.dart` — `CallStatus` values.
- `voice_command_state.enum.dart` — `VoiceCommandState` values.
- `log_event_type.enum.dart` — `LogEventType` values for CloudWatch logging.

### `android/` (native Java)

- `MainActivity.java` — Flutter's `FlutterActivity`, registers platform channels for kiosk, system update policy, APK install. Override `onBackPressed` to no-op in kiosk mode.
- `KioskManager.java` — Device Admin operations: `startLockTask`, `stopLockTask`, `setStatusBarDisabled`, `setKeyguardDisabled`, `setUserRestriction`.
- `AppDeviceAdminReceiver.java` — `DeviceAdminReceiver` subclass; handles admin activation/deactivation lifecycle.
- `KioskWatchdogService.java` — Sticky foreground service; posts a delayed runnable that checks if the app is in the foreground and relaunches if not.
- `BootReceiver.java` — `BroadcastReceiver` for `BOOT_COMPLETED`; starts `MainActivity`.
- `ApkInstallReceiver.java` — `BroadcastReceiver` for `MY_PACKAGE_REPLACED`; sends confirmation back to Dart via Event Channel.
- `ShutdownReceiver.java` — Handles graceful shutdown before device power-off.

### `pubspec.yaml` — key dependencies

```
daily_flutter            # Daily.co WebRTC video calling
amazon_cognito_identity_dart_2  # AWS Cognito auth
web_socket_channel       # WebSocket client
dio                      # HTTP client
rxdart                   # BehaviorSubject / streams
get_it                   # Service locator / DI
flutter_secure_storage   # Encrypted credential storage
flutter_screen_util      # Responsive sizing for landscape tablet
speech_to_text           # Voice command recognition
flutter_tts              # Text-to-speech feedback
battery_plus             # Battery level / charging state
connectivity_plus        # Network connectivity monitoring
screen_brightness        # Display brightness control
wakelock_plus            # Prevent screen sleep during calls
in_app_update            # Triggers self-hosted APK install
firebase_crashlytics     # Crash reporting
shared_preferences       # Non-sensitive persistent storage
json_serializable        # JSON model codegen (dev dependency)
flutter_gen_runner       # Asset codegen (dev dependency)
```

### Build / release

- Dev: `flutter run --flavor dev -t lib/main.dart`
- Local backend: `flutter run --flavor local -t lib/main.dart` (emulator/device testing against localhost API)
- Prod APK: `.claude/skills/release-build/` skill automates the `flutter build apk --flavor prod --release` + signing + upload steps.
- Version: `version: X.Y.Z+N` in `pubspec.yaml` — bump `N` (build number) for OTA update detection; bump `X.Y.Z` for semantic releases.
- Signing: keystore config in `android/key.properties` (not committed — provided at build time).

### Env / flavor config

`FlavorConfig` is initialized in `main.dart` per flavor:
- `apiBaseUrl` — NestJS backend URL.
- `webSocketEndpoint` — resolved from `/app/config` at runtime (not baked in).
- `cognitoUserPoolId`, `cognitoClientId` — flavor-specific Cognito pools.

### Where to start when changing things

- **Adding a new screen:** add a named route in `routes.dart`, create `screens/<name>/<name>.view.dart` + `<name>.view_model.dart`, wire navigation from the relevant entry point.
- **Adding a new API call:** add a method to the appropriate service in `services/`, define request/response models in `models/`, run `build_runner` if using `@JsonSerializable`.
- **Adding a new WS event:** add the value to `lib/enums/events.enum.dart`, handle it in `RealtimeService`'s dispatch switch, update the relevant controller. Coordinate with backend `websocket-event.ts`.
- **Adding a new controller:** register it in `GetIt` in `main.dart`; controllers should inject services via constructor from GetIt.
- **Kiosk / native change:** modify the relevant Java file in `android/.../`, update the platform channel contract in `KioskService` (Dart) if the channel method name or args change.
- **Asset change:** add to `pubspec.yaml` assets section → run `flutter pub run flutter_gen run` → use the generated `Assets` class instead of string literals.
