---
type: domain
tags: [tablet, chat]
owner: Mike
updated: 2026-04-22
status: current
---
# Tablet Domain - Chat

## Primary ownership

- Conversation list display on the home screen (unread message badge).
- Chat thread view: message history, send, receive in real time.
- Read receipt tracking — mark conversations as read when opened.
- Real-time message delivery via WebSocket (`ConversationMessageCreated`).

## Read these first

> **Naming note:** in this codebase, `controllers/*.dart` are **HTTP API clients** (no state), while `services/*.service.dart` own streams and lifecycle. See [[Tablet/Onboarding Walkthrough]] §2.

- `tablet/lib/services/conversation.service.dart` — **conversation lifecycle owner**. Exposes `onMessageReceived` (filtered `ConversationMessageCreated` stream off `RealtimeService`), wraps `getConversation` / `sendMessage` / `searchConversations` / `getConversationWithSupportProfessional`, owns `_lastErrorType` (so view-models can branch on backend error codes like `ConversationExpiredException`). Has its own 401/403 retry path that triggers full re-auth via `AuthService.authenticate()` (separate from the HttpService 401 interceptor).
- `tablet/lib/services/read_receipt.service.dart` — **unread count owner.** Tracks unread count per conversation as state.
- `tablet/lib/controllers/conversation.controller.dart` — **HTTP wrapper.** `getConversation`, `searchConversations`, `sendMessage`, `getConversationWithSupportProfessional`. No state, no streams.
- `tablet/lib/controllers/read_receipt.controller.dart` — **HTTP wrapper.** `POST /read-receipt`.
- `tablet/lib/ui/screens/chat_detail/chat_detail.view_model.dart` — subscribes to `ConversationService.onMessageReceived` to update the open thread; calls `sendMessage` and reads `lastErrorType` for error UX.
- `tablet/lib/ui/screens/home/unread_messages_card/unread_messages_card.view_model.dart` — subscribes to `onMessageReceived` to bump the unread badge; pulls conversation list via `searchConversations`.
- `tablet/lib/ui/screens/home/unread_messages_card/` — home screen badge + conversation list entry.
- `tablet/lib/models/conversation.dart` — `Conversation` model.
- `tablet/lib/models/chat_message.dart` — `ChatMessage` model.

## Backend relationship

- `ConversationMessageCreated` WS event → `RealtimeService._dataStream$` broadcasts → `ConversationService.onMessageReceived` filter — both the `chat_detail` view-model (if open) and the `unread_messages_card` view-model subscribe independently. (No "dispatch to controller" — `RealtimeService` doesn't know about consumers.) See [[Tablet/WS Contract]].
- `GET /conversation/:id` — fetch one conversation (incl. messages). Wrapped by `ConversationController.getConversation`.
- `GET /conversation/my/with/support-professional` — get-or-create the resident's conversation with their assigned staff. Wrapped by `getConversationWithSupportProfessional`. **Has its own 401/403 retry-with-re-auth path in `ConversationService`.**
- `POST /conversation/search` — paginated conversation list. **Checks for HTTP 201** (NestJS POST default), not 200. Wrapped by `searchConversations`.
- `POST /conversation/message` — send a new message. **Checks for HTTP 201.** Wrapped by `sendMessage`.
- `POST /read-receipt` — mark messages in a conversation as read. Called when `ChatDetailScreen` mounts and on scroll-to-bottom; **not** in response to a WS event arriving in the background (would falsely clear the unread badge).
- Backend error code `ConversationExpiredException` is surfaced via `ConversationService.lastErrorType` and read by `chat_detail.view.dart` to render the expiry-specific UI.

## Related references

- [[Tablet/Chat Pipeline]] — end-to-end trace (parallel to call pipeline in [[Tablet/Onboarding Walkthrough]] §5).
- [[Tablet/Onboarding Walkthrough]] — architectural spine.
- [[Tablet/WS Contract]] — `ConversationMessageCreated` wire format and payload shape (`ChatMessageModel`).
- [[Tablet/Stream Patterns Cookbook]] — how WS event filters are built.
- [[Tablet/DataState Pattern]] — return type used by every conversation HTTP method.

> Section above re-anchored 2026-05-06 to match actual code: `controllers/*.dart` are HTTP clients, `services/*.service.dart` own state/streams.

## Common change patterns

1. **New message field** (e.g., attachment) → add to `ChatMessage` model, run `build_runner`, update `chat_detail` render logic, update `MessageRequest` DTO + `ConversationController.sendMessage` if a new field needs to be POSTed.
2. **Real-time message handling** → modify the `chat_detail` and/or `unread_messages_card` view-model's `.listen` handler on `ConversationService.onMessageReceived`. Don't add state to `ConversationController`.
3. **Unread badge changes** → `ReadReceiptService` owns the unread count map; update there and verify the `UnreadMessagesCard` widget's `StreamBuilder` rebuilds.
4. **Pagination** → extend `conversation.service.dart` with a paged fetch method; `ConversationController` provides the raw HTTP. Append pages in the view-model without duplicating messages (sort by `sentAt`).
5. **New backend error codes** → add a check on `ConversationService.lastErrorType` in the relevant view; service stores the `data["error"]` string verbatim from the response body.
6. **Adding a new WS event the chat should react to** → see [[Tablet/WS Contract]] §9 for the 5-step recipe.

## Gotchas

- The tablet's auth is device-based (not resident-user), so the conversation scope is determined by which resident is associated with this `deviceId`. If the resident changes, conversations must be refreshed.
- **`onMessageReceived` has no dedupe filter** (unlike `CallService.onIncomingCall`). Every `ConversationMessageCreated` event is delivered. If you see double-renders, check for double-subscription in the view-model — not a service bug.
- **`ConversationService.getConversationWithSupportProfessional` has its own 401/403 retry** that triggers a full `AuthService.authenticate()` (not just a token refresh). This is *in addition to* the `HttpService` 401-refresh interceptor — defensive layering. Don't rip it out.
- Read receipts should be POSTed only when the chat screen is actually visible — not when a WS event arrives in the background, which would falsely clear the unread badge.
- Message ordering: sort by `sentAt` descending for the list preview, ascending for the thread. An off-by-one in sort direction creates confusing UI.
- `build_runner` must be re-run after any `@JsonSerializable` model change — missing this causes silent deserialization failures with no runtime error in release mode.
- **`searchConversations` and `sendMessage` check for HTTP 201**, not 200 (NestJS POST default). If the backend "fixes" to 200, both endpoints silently fail.
- **`_lastErrorType` is a mutable singleton field** — only safe because it's read immediately after a known service call. Don't read it across an `await` from another method.

## Done checklist

- Sending a message POSTs correctly (returns 201) and the new message appears in the thread without duplication.
- Receiving a WS message updates both the conversation list (last message preview + unread count) and the thread (if open). Both view-models subscribe to `onMessageReceived` independently.
- Opening a conversation POSTs the read receipt and clears the unread badge.
- Pagination loads additional messages without duplicates or ordering artifacts.
- `build_runner` has been re-run if any model was modified.
- New `ConversationController` methods only added when there's a corresponding backend route; no state introduced there.
- New backend error codes routed through `_lastErrorType` and consumed in the view layer, not buried in service-internal toasts.
