---
type: reference
tags: [tablet, logging, observability, cloudwatch]
owner: Mike
updated: 2026-05-06
status: current
---
# Tablet — Logging Stack

How tablet logs flow from `print()` calls and structured event logs into AWS CloudWatch. Covers `CloudWatchService`, `WaypointService`, and the `runZonedGuarded` zone trick that makes everything work. Sister doc to [[Tablet/Onboarding Walkthrough]].

> **Bottom line:** there are **two** logging paths. (1) **`print()` capture via Zone interception** — every `print()` in the app becomes a CloudWatch log event, batched and shipped on a 1s flush. (2) **`WaypointService.log(eventType, metadata)`** — explicit structured events POSTed to a backend endpoint, which forwards to DynamoDB. Both paths exist; they're for different consumers.

---

## 1. The two paths

```
┌─────────────────────────────────────────────────────────────┐
│ Tablet code                                                 │
│                                                             │
│   print("CALL_SERVICE: ...")           WaypointService.log( │
│                                          callJoined,        │
│                                          metadata: {...})   │
└──────────────┬──────────────────────────────────┬───────────┘
               │                                  │
               ▼                                  ▼
┌─────────────────────────────────┐   ┌──────────────────────┐
│ Zone interceptor in main.dart   │   │ HttpService.post     │
│ (CloudWatchService.captureOutput)│   │ /connection/tablet/  │
│                                 │   │ logs                 │
│ ↓ batches + 1s flush            │   │ ↓                    │
│ ↓ ships via SigV4-signed HTTPS  │   │ Backend (NestJS)     │
│                                 │   │ ↓                    │
│ AWS CloudWatch Logs             │   │ DynamoDB             │
│ Log group: heylo-tablet-logs    │   │ Table:               │
│ Log stream: {agencyId}/{deviceId}│  │ tablet-event-logs    │
└─────────────────────────────────┘   └──────────────────────┘
```

Different consumers:

- **CloudWatch** — diagnostic logs, used by ops and the `tablet-logs` skill. Free-form text. Includes everything `print()` outputs across all services. **Volume: high**.
- **Waypoints (DynamoDB)** — structured events with typed `eventType` + structured `metadata`. Used for product analytics, fleet-health dashboards, and incident retrospectives. **Volume: low** (only intentional logging points).

You'd use `print` for "what is the tablet currently doing" debugging and `WaypointService.log` for "what happened that someone needs to know later about."

---

## 2. CloudWatch path — Zone interception

The bootstrap (`main.dart`) wraps the entire app in a Dart `Zone` that intercepts `print`:

```dart
void main() {
  CloudWatchService.captureOutput(() async {
    // ... entire app runs inside this callback
  });
}
```

`CloudWatchService.captureOutput` is implemented as:

```dart
static void captureOutput(void Function() body) {
  runZonedGuarded(
    body,
    (error, stackTrace) {
      print("UNCAUGHT_EXCEPTION: $error");
      print("STACK_TRACE: $stackTrace");
    },
    zoneSpecification: ZoneSpecification(
      print: (Zone self, ZoneDelegate parent, Zone zone, String line) {
        parent.print(zone, line);                  // ← still prints to stdout/Logcat
        CloudWatchService()._queueMessage(line);   // ← also queue for CloudWatch
      },
    ),
  );
}
```

Two effects:

1. **Every `print()` is captured** — no need to opt in. Existing console-style logging across all services is automatically shipped.
2. **Uncaught async exceptions are caught** — `runZonedGuarded` provides a top-level error handler for promises that reject without a `.catchError`. They get formatted and re-printed (which then ships to CloudWatch).

The TS analogue would be monkey-patching `console.log` plus a `process.on('unhandledRejection')` handler. Dart's Zone API makes this clean.

---

## 3. CloudWatch — log structure

Once `CloudWatchService.initialize()` runs (during `_setup()`, after auth + user profile load):

- **Log group**: `heylo-tablet-logs` (single, shared across all tablets).
- **Log stream**: `{agencyId}/{deviceId}` — one stream per (agency, device) pair. Both come from the JWT (`custom:platformAgencyId`, `custom:platformDeviceId`).
- **Events**: each `print()` becomes a CloudWatch event with:
  - `timestamp` — `DateTime.now().millisecondsSinceEpoch`
  - `message` — JSON-stringified `{message: line, timestamp: ts}` (so the message itself is searchable structured data, even though CloudWatch treats it as a free-form string)

The agencyId-prefixed stream name matters for ops: filter by stream prefix to scope to one agency, or by full stream name to scope to one device.

---

## 4. Batching + flush

```dart
static const int _flushIntervalSeconds = 1;
static const int _maxQueueSize = 50;
static const int _maxQueueCapacity = 500;
```

- **`_flushIntervalSeconds = 1`** — periodic flush every 1s.
- **`_maxQueueSize = 50`** — flush early if queue reaches 50 events (so high-volume burst doesn't wait a full second).
- **`_maxQueueCapacity = 500`** — hard cap. If `_putLogEvents` is failing and the queue fills past 500, oldest events are **dropped** to prevent OOM.

A failed flush re-inserts the events at the front of the queue and retries on the next flush tick — but is also subject to the 500-event cap, so a long-term outage will start dropping the oldest events.

`flush()` can be called manually (e.g., before `restartApp` — see `KioskService.restartApp` flushes 2s before restarting to ensure recent logs land in CloudWatch even if the process is killed).

---

## 5. AWS auth — SigV4 signing

CloudWatch Logs is called directly via signed HTTPS, not through any backend proxy. The signing flow:

```dart
final credentials = await AuthService().getIAMCredentials();   // Cognito Identity Pool exchange
_signer = AWSSigV4Signer(
  credentialsProvider: AWSCredentialsProvider(AWSCredentials(
    credentials.accessKeyId,
    credentials.secretAccessKey,
    credentials.sessionToken,
  )),
);
```

`AuthService.getIAMCredentials` (covered in [[Tablet/Onboarding Walkthrough]] §6 auth digest) does:

1. `POST cognito-identity.{region}.amazonaws.com / GetId` — exchange JWT for `IdentityId`.
2. `POST .../GetCredentialsForIdentity` — exchange `IdentityId` for AWS creds.
3. Cache for ~55 minutes (5min pre-expiry buffer).

Each flush rebuilds the signer if credentials expired. The signer is cached otherwise — signature generation is non-trivial CPU.

The two CloudWatch operations called:

- `Logs_20140328.CreateLogStream` — once at init (idempotent; treats `ResourceAlreadyExistsException` as success). Retries with exponential backoff up to 30min if it fails.
- `Logs_20140328.PutLogEvents` — every flush.

---

## 6. Waypoint path — `WaypointService`

Tiny file, big leverage:

```dart
class WaypointService {
  void log(LogEventType eventType, {required DateTime timestamp, Map<String, dynamic>? metadata}) {
    HttpService().http.post("/connection/tablet/logs", data: {
      "eventType": eventType.value,
      "timestamp": timestamp.millisecondsSinceEpoch,
      "metadata": metadata,
    }).then((_) {}).catchError((e) {
      print("WAYPOINT: Failed to send ${eventType.value}: $e");
      return null;
    });
  }
}
```

**Fire-and-forget.** No await, no return value. Errors are caught and printed (which then ships to CloudWatch — meta-recursive but benign). The entire service is 27 lines.

The backend endpoint (`POST /connection/tablet/logs`) is implemented in NestJS and forwards to DynamoDB. Retention and analytics queries on that table are managed by ops.

### `LogEventType` catalog

Defined in `tablet/lib/enums/log_event_type.enum.dart`. Currently includes (non-exhaustive — grep the enum for the full list):

| Event | Where logged |
|---|---|
| `appStarted` | `_setup()` after successful login |
| `appError` | `FlutterError.onError` and `PlatformDispatcher.onError` (fatal errors that show error screen) |
| `callReceived` | `home.view_model._setupIncomingCallListener` |
| `callJoined` | `video_call.view_model.init` after successful join |
| `callEnded` | `home.view_model._setupCallEndedListener` |
| `callMissed` | `home.view_model._setupCallMissedListener` |
| `callRejected` | `home.view_model._setupCallRejectedListener` |
| `callError` | `video_call.view_model.init` after all retries exhausted |
| `incomingCallAccepted` | `home.view_model._onIncomingCallAccept` |
| `messageSent` | `conversation.service.sendMessage` (with status SUCCESS/FAILED) |
| `messageReceived` | `chat_detail.view_model._onNewMessage` (only if from sender) |
| `voiceWakeWordDetected` | `voice_command.service._checkForWakeWord` |
| `voiceCommandDetected` | `voice_command.service._tryMatchCommand` |
| `voiceCommandError` | `voice_command.service` error paths |
| `websocketConnected` / `websocketDisconnected` | `realtime.service` lifecycle |

When adding a new logging point, **prefer adding a new `LogEventType` enum value over creating a new free-form `print` line** — Waypoints are easier to query for analytics. The exception is high-volume per-tick logging (e.g., the 5s call ping); those should stay as `print`.

---

## 7. The two paths' tradeoffs

| Concern | CloudWatch (`print`) | Waypoints |
|---|---|---|
| **Setup cost** | Zero — works for any `print` | Add enum + call |
| **Volume / cost** | High — every `print` ships | Low — only intentional events |
| **Querying** | Full-text search in CloudWatch console | Structured DynamoDB queries |
| **Retention** | CloudWatch default (configurable) | DynamoDB TTL (per ops policy) |
| **Schema flexibility** | Free-form | Typed enum + structured metadata |
| **Analytics dashboards** | Hard | Easy (Athena over DynamoDB exports, or QuickSight) |
| **Per-device drill-down** | Easy via log stream filter | Easy via deviceId metadata |
| **Real-time monitoring** | CloudWatch Insights | DynamoDB streams or polling |

**Rule of thumb:** if you'd want to count occurrences across the fleet ("how many failed call joins per agency last week"), use Waypoints. If you'd want to read the full log of one tablet's afternoon, CloudWatch.

---

## 8. SME-worth gotchas

- **CloudWatch flush requires auth.** `_putLogEvents` calls `_ensureSigner` which calls `AuthService.getIAMCredentials`. Before login completes, no log events ship. Pre-login `print` calls are queued indefinitely (up to 500-event cap). Once login succeeds and `CloudWatchService.initialize()` runs, queued events flush in chronological order.
- **`tablet-status` keepalive logs are filtered** in `http.service.dart:102` to avoid drowning CloudWatch. If you need to debug those specifically, comment the filter — but expect a lot of noise.
- **The 500-event cap is per-process.** App restart starts the queue fresh. So a tablet that loses CloudWatch connectivity for hours will only retain the last ~500 events when it comes back.
- **Sorting before send** — `_putLogEvents` sorts events by timestamp before sending. CloudWatch requires chronological order; out-of-order events cause the whole batch to fail.
- **Recursive logging is benign but real**. `WaypointService` failures `print` an error. `CloudWatchService` failures `print` an error. Both prints get queued back into CloudWatch. There's no infinite loop because the queue cap and the dropped-events behavior prevent it from cascading, but you'll see "WAYPOINT: Failed to send" lines in CloudWatch when the backend has an outage.
- **Crashlytics is parallel infrastructure.** Firebase Crashlytics is initialized in `main()` and captures crashes (`FlutterError.onError`, `PlatformDispatcher.onError`). It's separate from both paths above. Crashes go to Firebase; the *log-line equivalent* of the crash goes to CloudWatch via `print`; the Waypoint version goes via `WaypointService.log(appError, ...)`. Three independent capture channels for the same fatal-error event.
- **`captureOutput` zone errors** (the second arg to `runZonedGuarded`) catch *uncaught async errors*. They `print` (and thus ship to CloudWatch) but do **not** trigger the error screen — that's only set up after `runApp` via `FlutterError.onError`. So a bootstrap-time async exception won't show the error screen; it'll just appear in CloudWatch.
- **Adding a new Waypoint event** requires: new enum value in `log_event_type.enum.dart`, all call sites pass a `metadata: {...}` map. Backend doesn't validate the shape — it just stores whatever you send. Prefer flat scalar fields for queryability.

---

## 9. The `tablet-logs` skill

You have access to a Claude Code skill: **`tablet-logs`**. It fetches and analyzes logs from CloudWatch. Use it for:

- "What was tablet X doing at time Y?"
- "Find recent occurrences of error pattern Z across the fleet"
- "Why did tablet X restart at 3am?" (search for `RESTART APP CALLED` or `REBOOTING DEVICE`)
- "Did tablet X hit a video-call error?" (filter for `callError` waypoint or `VIDEO_CALL_VM:` prefix)

The skill handles AWS auth, log group/stream resolution, and time-window queries.

If you're investigating an incident, run `tablet-logs` first to get context — most issues are diagnosable from CloudWatch alone.

---

## 10. Useful log prefixes for grepping

Most services use a consistent prefix on `print` calls. Search by these to scope to a specific subsystem:

| Prefix | Source |
|---|---|
| `HEYLO:` | `main.dart` bootstrap |
| `CALL_SERVICE:` | `services/call.service.dart` |
| `CALL_CONTROLLER:` | `controllers/call.controller.dart` |
| `VIDEO_CALL_VM:` | `ui/screens/video_call/video_call.view_model.dart` |
| `CONVERSATION_SERVICE:` | `services/conversation.service.dart` |
| `CHAT_DETAIL_VIEWMODEL:` | `ui/screens/chat_detail/chat_detail.view_model.dart` |
| `HOME_VIEWMODEL:` / `HOME_VIEW:` | `ui/screens/home/home.view_model.dart` (and view) |
| `REALTIME_SERVICE:` | `services/realtime.service.dart` |
| `AUTH_SERVICE:` | `services/auth.service.dart` |
| `COGNITO_SERVICE:` | `services/cognito.service.dart` |
| `HTTP_SERVICE:` | `services/http.service.dart` |
| `KIOSK:` | `services/kiosk.service.dart` |
| `DEVICE_STATUS:` | `services/device_status.service.dart` |
| `VOICE_CMD:` | `services/voice_command.service.dart` |
| `CLOUDWATCH:` | `services/cloudwatch.service.dart` |
| `WAYPOINT:` | `services/waypoint.service.dart` |
| `APK_INSTALL:` | APK install flow inside `kiosk.service.dart` |

When adding new logging in a service, **use a consistent prefix** matching this list (or invent one for a new service). Makes log analysis much easier.

---

## 11. Where this connects

- [[Tablet/Bootstrap & Module Wiring]] §2 — the `captureOutput` zone wraps `main()`.
- [[Tablet/Onboarding Walkthrough]] §6 (auth) — `AuthService.getIAMCredentials` is what enables CloudWatch's SigV4 signing.
- [[Tablet/Kiosk Service Reference]] — `restartApp` flushes CloudWatch before killing the process.
- [[Tablet/Voice Commands]] §10 — uses `WaypointService` for voice-command analytics.
- [[Tablet/Domain - Calls]] / [[Tablet/Chat Pipeline]] — both feature areas log via `WaypointService` + `print`.
