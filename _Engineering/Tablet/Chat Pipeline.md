---
type: reference
tags: [tablet, chat, websocket]
owner: Mike
updated: 2026-05-06
status: current
---
# Tablet — Chat Pipeline

End-to-end trace of the conversation/chat feature, parallel to the call trace in [[Tablet/Onboarding Walkthrough]] §5. Sister doc to [[Tablet/Domain - Chat]] (which covers ownership) and [[Tablet/WS Contract]] (which documents the wire format).

> **Bottom line:** the tablet doesn't keep a global "current conversations" store. Each consumer (chat-detail screen, unread-messages card) maintains its own copy, both subscribing independently to `ConversationService.onMessageReceived`. There's no cross-screen sync — the two consumers can hold slightly different views of the same conversation, which is fine because the chat-detail view is short-lived (mounted only when open) while the home card is the persistent ground-truth.

---

## 1. The pipeline at a glance

```
Backend (NestJS conversation.service.ts)
  emits ConversationMessageCreated over WS
        │
        ▼
RealtimeService._dataStream$         ← single broadcast firehose
        │
        ▼
ConversationService.onMessageReceived  ← .where(event == ConversationMessageCreated).map(...)
        │
        ├──────────────────────────────────────────────────┐
        ▼                                                  ▼
chat_detail.view_model                          unread_messages_card.view_model
  - filters: conversationId match               - matches by conversationId
  - .doOnData(_onNewMessage):                   - if no match: creates synthetic ConversationModel
      append message,                             from data.sender + data.createdById
      bump unreadCount if from SP               - bumps unreadCount + appends message
      log waypoint                              - wakes screen via ScreenDimService
        │                                                  │
        ▼                                                  ▼
chat thread re-renders                         home card badge updates
```

Two independent consumers, each with their own state. There is no shared "conversation store" service — both view-models keep their own `List<ConversationModel>`.

---

## 2. Outbound (sending a message)

User taps Send in `chat_detail.view`:

```
ChatDetailViewModel.createMessage(text)
  ├─ ConversationService.sendMessage(text, conversationId, recipientName)
  │    ├─ ConversationController.sendMessage(MessageRequest)
  │    │    └─ POST /conversation/message  (status code 201)
  │    │       returns DataState<ChatMessageModel>
  │    └─ WaypointService.log(messageSent, status: SUCCESS|FAILED)
  ├─ on null (failure): ToastNotificationService.showError(...)
  └─ on success:
        messageData.user = UserService.currentActiveUser
        _onNewMessage(messageData)   ← same path as inbound: append, bump count
```

Notable points:

- **Sent message echoes locally** via `_onNewMessage` — there's no server round-trip wait. The view-model treats its own send as identical to a received message in terms of state mutation.
- **`messageData.user` is patched on the client** — backend response `ChatMessageModel` doesn't include the full sender profile; the view-model hydrates with the local `UserService.currentActiveUser` so the avatar renders without a refetch.
- **No optimistic state** — the message only appears after the POST returns 201. If the network is slow, there's a visible delay. (Different from many React chat UIs that render-then-confirm.)

---

## 3. Inbound (receiving a message via WS)

A `ConversationMessageCreated` event arrives:

### 3a. In `chat_detail.view_model.dart`

```dart
Stream<void> getMessagesStream() {
  return ConversationService().onMessageReceived
    .where((data) => data.conversationId == conversaionId)   // ← scope to this thread
    .doOnData(_onNewMessage)                                  // ← side-effect: mutate state
    .map((_) => null)                                         // ← view rebuilds via setState in view
    .takeUntil(_unsubscriber.stream);
}
```

`_onNewMessage` does:

1. `_conversationData?.messages?.add(data)`.
2. **If `isMessageFromSender(data)` returns true**, `unreadCount += 1`.
3. Log a `messageReceived` waypoint with the sender name.

The `.doOnData` operator is rxdart's "tap" — runs a side effect without altering the stream value. Then `.map((_) => null)` collapses to a void signal that the view's `StreamBuilder` can latch onto for `setState`.

### 3b. In `unread_messages_card.view_model.dart`

```dart
Stream<void> setupNewMessageStream() {
  return ConversationService().onMessageReceived
    .doOnData((data) async {
      ScreenDimService.wakeUp();
      var conversation = _conversations?.firstWhereOrNull((c) => c.id == data.conversationId);
      if (conversation == null) {
        // build a synthetic ConversationModel from data.sender + data.createdById
        conversation = ConversationModel(...);
        _conversations.add(conversation);
      }
      conversation.messages.add(data);
      conversation.unreadCount += 1;
    })
    .map((_) => null)
    .takeUntil(_unsubscriber.stream);
}
```

The home card subscribes to **all** `ConversationMessageCreated` events (no conversationId filter) so it catches both updates to known conversations *and* messages from brand-new conversations the tablet hasn't seen yet.

### 3c. The "new conversation in real-time" case

If a message arrives for a conversation not in `_conversations`, the unread-card view-model **synthesizes a `ConversationModel`** from the WS payload's `sender` and `createdById` fields. This avoids a server round-trip to fetch the conversation list before the badge can update.

The synthesis uses these payload fields (per backend `conversation.service.ts:564`):

```ts
data: {
  // standard ChatMessage fields (id, body, sentAt, conversationId, createdById, ...)
  sender: { name, profilePictureWebUrl }   // ← used to fabricate the participant
}
```

Quirk: the backend sends `profilePictureWebUrl` as the literal string `"null"` (not actual null) when there's no picture — the view-model handles both: `(rawProfilePicture == "null" || rawProfilePicture?.isEmpty == true) ? null : rawProfilePicture`. Don't "fix" the literal-string check; that's the contract.

---

## 4. Marking messages as read

`chat_detail.view_model` uses an IntersectionObserver-style pattern:

```dart
void onMessageVisibilityChanged(List<ChatMessageModel> visibleMessages) {
  for (final message in visibleMessages) {
    if (!message.isRead && isMessageFromSender(message) && message.id != null) {
      _visibleUnreadMessageIds.add(message.id!);
    }
  }
  _debounceTimer?.cancel();
  _debounceTimer = Timer(Durations.long2, () => _markMessagesAsRead());
}
```

Then:

```dart
Future<void> _markMessagesAsRead() async {
  final ids = _visibleUnreadMessageIds.toList();
  _visibleUnreadMessageIds.clear();
  final res = await ReadReceiptController().markMessagesAsRead(ids);
  if (res is DataSuccess) {
    // mark local message.isRead = true; decrement unreadCount
    _messageStateStream$.add(null);   // signal view to rebuild
  }
}
```

Notes:

- **`Durations.long2`** is Flutter's `Duration(milliseconds: 200)` — the read-receipt debounce.
- **The view layer notifies visibility** — the view-model doesn't auto-mark; it only acts on what the view says is visible. So messages scrolled past quickly aren't marked read.
- **POST happens via `ReadReceiptController.markMessagesAsRead`** (not `ConversationController`). Body: array of message IDs.
- **Local state mutation only on success** — if the POST fails, the IDs are added back to `_visibleUnreadMessageIds` so the next debounce retries.

---

## 5. The "who sent this?" decision tree

`isMessageFromSender(message)` is the most-checked predicate in the chat layer. It distinguishes "message from the staff member" from "message from this tablet" so unread counts and avatar bubbles render correctly.

The logic depends on **tablet type**, decided by `currentUser.isDevice`:

```dart
if (isCommonAreaTablet) {            // currentUser.isDevice == true
  return message.createdById != null;
} else if (currentUserId != null) {  // resident tablet
  return message.createdById != currentUserId;
}
return false;
```

Why two paths:

- **Resident tablets** — the tablet authenticates as a deviceId, but `UserService.currentActiveUser` is the resident's user record. Messages sent by the *resident* (from this tablet) carry `createdById = residentUserId`. Messages from the support professional carry `createdById = SP_userId`. So "from sender" = "createdById != currentUserId".
- **Common-area tablets** — no specific resident user. `currentUser.isDevice = true`. Messages from the device (anyone tapping this tablet) have `createdById = null`. Messages from the SP have `createdById = spUserId`. So "from sender" = "createdById != null".

**SME implication:** if you ever add a third tablet type or change auth identity model, this decision tree needs updating. It's the single most error-prone piece of chat logic.

---

## 6. The conversation-participant resolution

`ChatDetailViewModel.getConversationData` finds the "other" participant (the staff member) to render the chat header. Logic also branches on tablet type:

```dart
_sender = conversationData?.conversationUsers?.where((conversationUser) {
  if (isCommonAreaDevice) {
    if (hasDevice && !hasUser) return false;        // skip device-only entries
    if (hasUser && participantUserId == currentUserId) return false;  // skip self
    return hasUser;
  } else if (currentUserId != null) {
    return hasUser && participantUserId != currentUserId;             // skip self
  }
  return false;
}).firstOrNull;
```

Same idea: pick the participant who isn't *this tablet*. Edge cases handled: device-only conversation entries (created when the conversation was first opened from a common-area tablet — the device ID is registered as a participant separate from any user).

---

## 7. The "initiate chat from home screen" entry point

The `Message Staff` button on the home screen (in `home.view.dart`) calls `home.view_model.dart`'s `initStaffChat`:

```dart
Future<bool> initStaffChat() async {
  final conversationData = await ConversationService().getConversationWithSupportProfessional();
  if (conversationData == null) return false;
  RouterService().push(Routes.chatDetail, arguments: {"conversationId": conversationData.id});
  return true;
}
```

`getConversationWithSupportProfessional` is **a get-or-create** endpoint on the backend. The tablet sends the request; backend either returns the existing conversation or creates a new one and returns it. No client-side branching on "create vs find."

The service-level method has its own 401/403 retry-with-re-auth (separate from `HttpService` 401 interceptor) — see [[Tablet/Domain - Chat]] for that detail.

---

## 8. Resyncing on reconnect

Both view-models subscribe to `InternetStatusService.onOnlineStatusChanged` filtered to `isOnline == true`:

```dart
Stream<bool> onResync() {
  return InternetStatusService().onOnlineStatusChanged
    .where((isOnline) => isOnline)
    .takeUntil(_unsubscriber.stream);
}
```

The view consumes this stream and triggers `getConversations()` / `getConversationData()` to refresh from the server after a reconnect. Loss of WS = drift; the resync fetches authoritative state.

`unread_messages_card.view_model` adds a 5-minute periodic `Stream.periodic(Duration(minutes: 5))` for **stale data refresh** even without a network event — defensive against missed WS events that an `isOnline` flip wouldn't catch.

---

## 9. SME-worth gotchas

- **No global conversation store.** Don't add one — each view-model is responsible for its own state, and there's no current pain forcing centralization. If you do add one, sync becomes a real concern.
- **`onMessageReceived` has no dedupe filter.** If you see double-renders, suspect double-subscription, not a service bug.
- **The synthetic `ConversationModel` (when a brand-new convo arrives over WS)** uses minimal fields — if you add a required field to `ConversationModel`, update the synthesis path in `unread_messages_card.view_model.dart:101-115` or the new convo will render with stub data until next refresh.
- **`profilePictureWebUrl: "null"`** — backend sometimes sends the literal string. Always check both `== "null"` and `isEmpty`. If you "fix" the backend, update the tablet check too.
- **Read receipts only fire when the chat detail screen is open and messages are visible.** Background WS events do *not* mark anything read — that would falsely zero the unread badge while the tablet is on the home screen.
- **`messageData.user` is patched after sendMessage** — the backend response doesn't include the sender profile; the client hydrates locally. If you add a UI element that reads other fields off the message author, ensure they're either in the response DTO or hydrated similarly.
- **`ConversationService.lastErrorType`** is mutable singleton state. Don't read it across an `await` — race conditions if multiple service calls overlap.
- **`isMessageFromSender` decision tree assumes exactly two tablet types** (resident vs common-area). Adding a third tablet type breaks this without modification.

---

## 10. Adding a new chat feature — recipe

### Adding a message field (e.g., attachment URL)

1. Backend: extend the `ChatMessage` DTO and persist column.
2. Tablet: add the field to `tablet/lib/models/chat_message.dart` annotated with `@JsonSerializable`.
3. Run `flutter pub run build_runner build --delete-conflicting-outputs`.
4. If sending: extend `MessageRequest` and `ConversationController.sendMessage`; pass the new field from `chat_detail.view_model.createMessage`.
5. Render the new field in `chat_detail.view.dart` (and possibly the unread-card preview if appropriate).

### Adding a new WS event for chat (e.g., `MessageDeleted`)

1. Backend `AppEvent` — add the value.
2. Backend emit site — `webSocketSvc.sendMessage(...)` with `event: AppEvent[AppEvent.MessageDeleted]`.
3. Tablet `Event` enum — add `messageDeleted("MessageDeleted")`.
4. `_parseData` in `web_socket_message.dart` — add a case to parse `data` as the appropriate model.
5. Add an `onMessageDeleted` getter to `ConversationService` that filters the broadcast.
6. Subscribe in the relevant view-model(s).

(Step-by-step in [[Tablet/WS Contract]] §9.)

### Adding a new conversation participant role

1. Update the participant resolution logic in `getConversationData` (§6 above).
2. Update `isMessageFromSender` (§5).
3. Add tests if the participant model changes shape.

---

## 11. How this connects

- [[Tablet/Domain - Chat]] — primary ownership + change patterns; pairs with this doc.
- [[Tablet/Onboarding Walkthrough]] §5 — the parallel call pipeline trace.
- [[Tablet/WS Contract]] — `ConversationMessageCreated` payload shape + the event/data dispatch.
- [[Tablet/Stream Patterns Cookbook]] — `.doOnData`, `.where`, `.takeUntil` recipes used here.
- [[Tablet/DataState Pattern]] — return type from `ConversationController.sendMessage` etc.
