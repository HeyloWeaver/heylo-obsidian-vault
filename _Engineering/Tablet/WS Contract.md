---
type: reference
tags: [tablet, backend, websocket, contract]
owner: Mike
updated: 2026-05-06
status: current
---
# Tablet ↔ Backend WebSocket Contract

The single source of truth for what events flow over the tablet's WebSocket connection. Sister doc to [[Tablet/Onboarding Walkthrough]].

> **Bottom line:** the tablet's `Event` enum (`tablet/lib/enums/events.enum.dart`) must match the wire strings produced by the backend's `AppEvent` enum (`backend/src/domain/models/common/event.ts`). Adding a new tablet-bound event requires changes in **5 places**, listed at the bottom.

---

## 1. Two backend event enums — pick the right one

| File | Enum | Type | Purpose |
|---|---|---|---|
| `backend/src/domain/models/common/event.ts` | `AppEvent` | numeric | **Tablet WS contract.** All call/conversation/alert events the tablet might receive. |
| `backend/src/domain/enums/websocket-event.ts` | `WebSocketEvent` | string | **Operator console only.** Currently has only `DeviceAlertsChanged`, sent to operator-console users via `device.service.ts:995`. Not consumed by the tablet. |

Both are named confusingly close. Older docs (and code review feedback) sometimes refer to "the WebSocket event enum" — they almost always mean `AppEvent`, not `WebSocketEvent`. If you see only `DeviceAlertsChanged`, you're looking at the wrong file.

---

## 2. Wire format — how a numeric enum becomes a string

The trick is in every backend emit site. Example, `call.service.ts:354`:

```ts
await this.webSocketSvc.sendMessage([residentUserId], {
  event: AppEvent[AppEvent.CallCreated],   // ← reverse-mapping: number → string
  data: { id, url, caller, isForced, ... }
});
```

`AppEvent.CallCreated` is the number `5` (declared in the enum). `AppEvent[5]` is the string `"CallCreated"` — TypeScript's [reverse mapping](https://www.typescriptlang.org/docs/handbook/enums.html#reverse-mappings) for numeric enums.

Net effect on the wire:

```json
{ "event": "CallCreated", "data": { ... } }
```

The tablet matches by string. From `tablet/lib/enums/events.enum.dart`:

```dart
enum Event {
  callCreated("CallCreated"),   // ← same string
  callConnected("CallConnected"),
  // ...
  final String value;
  const Event(this.value);
}
```

And `tablet/lib/models/web_socket_message.dart:12`:

```dart
final event = Event.values.firstWhere(
  (e) => e.value == (json["event"] as String),
  orElse: () => Event.none,   // unknown events silently become Event.none
);
```

So the contract is **the string**. The numeric/string asymmetry is a TS-internal implementation detail — the wire format is plain strings.

---

## 3. Currently emitted events (catalog)

Grepped from `backend/src` for `AppEvent[AppEvent.*]` and `event: AppEvent[appEvent]`. Updated 2026-05-06.

| Event (wire string) | Backend emit site | Tablet handler |
|---|---|---|
| `CallCreated` | `call.service.ts:354` (incoming call to resident), `:557` (outbound flow) | `CallService.onIncomingCall` |
| `CallConnected` | `call.service.ts:979` (status switch) | `CallService` (filtered out — not directly subscribed) |
| `CallEnded` | `call.service.ts:979` (status switch) | `CallService.onCallEnded` |
| `CallRejected` | `call.service.ts:979` (status switch) | `CallService.onCallRejected` |
| `CallMissed` | `call.service.ts:979` (status switch) | `CallService.onCallMissed` |
| `ConversationMessageCreated` | `conversation.service.ts:564` | `ConversationController` (chat list update) |
| `AlertCreated` | `alert.service.ts:421`, `:1220`, `:1861` | **Not consumed by tablet.** Operator-console only. |

The single dynamic emit site at `call.service.ts:979` runs through a `switch (call.status)` block (lines 880-912) that maps `CallStatus` enum values to `AppEvent` values, then sends via `AppEvent[appEvent]`. So the *literal* string set on the wire is the same — just resolved at runtime.

---

## 4. Declared but never emitted (vestigial values — audited 2026-05-06)

A `grep -rn "AppEvent\." backend/src` audit confirmed these `AppEvent` values are declared but have **zero emission sites** anywhere in the backend codebase:

| Value | Tablet has matching enum entry? | Likely intent |
|---|---|---|
| `none` (= 0) | ✅ (`Event.none`) | Default for unknown wire-string match (`firstWhere` `orElse`). Not emitted. |
| `ConversationMessageRetrieved` | ✅ | Symmetry with REST CRUD verbs; not actually pushed over WS. |
| `ConversationMessageUpdated` | ✅ | Same. |
| `ConversationMessageDeleted` | ✅ | Same. |
| `CallRetrieved` | ❌ | Same. |
| `CallUpdated` | ❌ | Same. |
| `CallDeleted` | ❌ | Same. |
| `BatteryLow` | ❌ | Aspirational — tablet's own `DeviceStatusService.lowBatteryThreshold` is checked locally, no WS event ever broadcasts. |
| `BatteryRecovered` | ❌ | Same. |
| `DeviceOnline` | ❌ | Aspirational device-state events; would notify operator console, not implemented. |
| `DeviceStandby` | ❌ | Same. |
| `DeviceOffline` | ❌ | Same. (Backend's "device offline" detection lives in `lambda/tabletChecker2.mjs`, which currently sends *email/SES alerts*, not WS events.) |

**Recommendation for incident response / future agents:** these enum values are **not** safety nets. Don't rely on `BatteryLow` arriving over WS to trigger UI changes — tablet handles its own battery threshold internally. Don't expect `DeviceOffline` to fire when a peer device goes down.

**Recommendation for cleanup:** consider removing the unused values from `AppEvent` and the matching tablet enum to reduce future agent confusion. Out of scope for this doc; flagged for a future cleanup PR.

---

## 5. Events on the wire that aren't in `AppEvent`

| Wire string | Source | Tablet handling |
|---|---|---|
| `pong` | Backend keepalive response (or API Gateway) | Stamps `_lastMessageReceived` (feeds the watchdog), broadcast on `_dataStream$` with `Event.none`. No service subscribes. |
| `admin_command` | Backend admin tooling (out-of-band, not in `AppEvent`) | **Special-cased** in [realtime.service.dart:227](../../tablet/lib/services/realtime.service.dart) before enum lookup. Switches on `data.command`: `update-flexible`, `update-immediate`, `update-sideload`, `restart`, `reboot`. See [[Tablet/Admin Commands]]. |

These are reasons you can't model "all WS events" by mirroring the `AppEvent` enum alone. The dispatcher has to know about both the typed-event path *and* these special-cased paths.

---

## 6. Data payload shapes

The `event` string is one contract; the `data` shape is another. The tablet picks a parser based on the event:

```dart
// tablet/lib/models/web_socket_message.dart
static dynamic _parseData(Map<String, dynamic> dataJson, {Event? event}) {
  if ([Event.callCreated, Event.callConnected, Event.callEnded,
       Event.callRejected, Event.callMissed].contains(event)) {
    return CallMessageModel.fromJson(dataJson);
  } else if ([Event.conversationMessageCreated].contains(event)) {
    return ChatMessageModel.fromJson(dataJson);
  }
  return dataJson;  // raw map — pong, admin_command, anything unknown
}
```

| Event(s) | Data shape (Dart model) |
|---|---|
| All `Call*` events | `CallMessageModel` — `{ id, url?, caller?, isForced?, isStealth?, reason?, createdById?, ... }` |
| `ConversationMessageCreated` | `ChatMessageModel` — `{ id, body, senderId, ... }` |
| Everything else | Raw `Map<String, dynamic>` |

If you add a new typed event without updating `_parseData`, the tablet receives the event but `data` is a raw map. Downstream `data as MyModel` casts will throw at runtime.

### Backend payload sources

The backend constructs the `data` field as a plain object — there's no shared DTO between backend and tablet for these payloads. Field names and types are matched by hand.

For `CallCreated` specifically (the most-touched payload), the shape comes from `backend/src/services/call.service.ts:355-366`:

```ts
data: {
  id: callSession.id,
  url: callSession.url,
  caller: { name, profilePictureWebUrl },
  isForced: isForced,
  isStealth: isStealth,
  createdById: this.contextSvc.userId,
  createdOn: new Date()
}
```

Tablet's `CallMessageModel` parses these fields. If a backend service drops a field or renames it, the tablet model goes silently null on that field.

---

## 7. Connection lookup — userId or deviceId

`WebSocketService.sendMessage` accepts `string[]`. Each ID is matched against **both** the `createdById` (user) and `deviceId` columns of `WebSocketConnection`:

```ts
// backend/src/services/websocket.service.ts:43
const webSocketConnections = await this.webSocketConnectionRepository.find({
  where: [
    { createdById: In(userIds), isDeleted: false },
    { deviceId: In(userIds), isDeleted: false }
  ],
});
```

Practically: a "userId" passed to `sendMessage` could actually be a deviceId and the call still works. Reflects the deviceId-as-identity model from [[Tablet/Onboarding Walkthrough]] §6 (auth section).

---

## 8. Stale connection cleanup (HTTP 410)

API Gateway WebSocket returns **HTTP 410 Gone** when a `PostToConnection` targets a connection ID that no longer exists. The backend treats 410 as "delete this row":

```ts
catch (error) {
  if (error.$metadata?.httpStatusCode === 410) {
    staleConnections.push(x);
  }
}
// later:
await this.webSocketConnectionRepository.remove(staleConnections);
```

Opportunistic cleanup — the row only goes away when somebody tries to send to it. So `WebSocketConnection` rows can live for a while after the actual socket has died.

---

## 9. Recipe — adding a new tablet-bound event

Five places to update. Miss one and the event silently fails somewhere on the chain.

1. **Backend `AppEvent`** — add a value to `backend/src/domain/models/common/event.ts`.

   ```ts
   export enum AppEvent {
     // ...
     MyNewEvent = 19,   // next free integer
   }
   ```

2. **Backend emit site** — call `webSocketSvc.sendMessage` with the reverse-mapped string:

   ```ts
   await this.webSocketSvc.sendMessage([userId], <WebSocketMessageModel>{
     event: AppEvent[AppEvent.MyNewEvent],
     data: { ...payload }
   });
   ```

3. **Tablet `Event` enum** — add a value to `tablet/lib/enums/events.enum.dart` with the matching string:

   ```dart
   myNewEvent("MyNewEvent"),
   ```

4. **Tablet payload model + dispatcher** — if the data is typed:
   - Define `tablet/lib/models/my_new_event.dart` annotated with `@JsonSerializable`.
   - Run `flutter pub run build_runner build --delete-conflicting-outputs` to regenerate `*.g.dart`.
   - Add a case to `_parseData` in `tablet/lib/models/web_socket_message.dart`:
     ```dart
     } else if (event == Event.myNewEvent) {
       return MyNewEventModel.fromJson(dataJson);
     }
     ```

5. **Tablet consumer** — add a stream getter on the relevant service:

   ```dart
   Stream<MyNewEventModel> get onMyNewEvent => RealtimeService().onDataReceived
     .where((data) => data.event == Event.myNewEvent)
     .map((data) => data.data as MyNewEventModel);
   ```

   Subscribe to it from a view-model (with `.takeUntil(unsubscriber.stream)`).

If the data is untyped (e.g., a void notification), skip step 4's model/dispatcher work and consume `data as Map<String, dynamic>` directly.

---

## 10. Common drift symptoms

| Symptom | Likely cause |
|---|---|
| Tablet silently ignores a new event | Step 3 (Dart enum) missed, or string doesn't match |
| Event arrives, but downstream cast throws | Step 4 (`_parseData` dispatch) missed; data is a raw map |
| Backend emits but no tablet receives | `WebSocketConnection` row is stale (HTTP 410); will self-clean next emit |
| Field on tablet model is null | Backend renamed or dropped that key in the `data` payload |
| Tablet stops responding to all WS events | Watchdog tripped (40s of silence); reconnect should auto-fire |
| Tablet doesn't respond to a `Call*` filter | The `id !== activeCall?.id` dedupe filter in `CallService` is dropping it (see `onIncomingCall`) |
| `pong` floods the logs | Logging filter in `RealtimeService` skips `pong`; if you see them, the filter regressed |

---

## 11. Tablet enum vs backend `AppEvent` (delta)

Tablet `Event` enum currently knows about:

- `none`
- `ConversationMessageCreated`, `ConversationMessageRetrieved`, `ConversationMessageUpdated`, `ConversationMessageDeleted`
- `CallCreated`, `CallConnected`, `CallEnded`, `CallRejected`, `CallMissed`

Backend `AppEvent` declares:

- All of the above, *plus*:
- `CallRetrieved`, `CallUpdated`, `CallDeleted`
- `AlertCreated`
- `BatteryLow`, `BatteryRecovered`
- `DeviceOnline`, `DeviceStandby`, `DeviceOffline`

The tablet doesn't subscribe to any of those backend-extras. Most aren't emitted anywhere (vestigial), and `AlertCreated` is operator-console scope. If a future feature needs the tablet to react to one, follow §9 (the 5-step recipe) to wire it up.

---

## Where this doc lives in the bigger picture

- [[Tablet/Onboarding Walkthrough]] — architectural spine, including how the tablet processes a received WS event end-to-end.
- [[Tablet/Domain - Calls]] — call-domain ownership and change patterns.
- [[Tablet/Domain - Chat]] — chat / conversation domain.
- [[Tablet/Admin Commands]] — `admin_command` payload spec.
- [[Tablet/Stream Patterns Cookbook]] — how subscribers build derived streams (`.where().map()` pipelines).
