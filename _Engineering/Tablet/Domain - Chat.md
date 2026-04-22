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

- `tablet/lib/controllers/conversation.controller.dart` — conversation list stream + per-conversation message cache.
- `tablet/lib/controllers/read_receipt.controller.dart` — unread count per conversation.
- `tablet/lib/services/conversation.service.dart` — REST: list conversations, fetch messages, send message.
- `tablet/lib/services/read_receipt.service.dart` — REST: POST read receipt.
- `tablet/lib/ui/screens/chat_detail/` — chat thread screen (view + view-model).
- `tablet/lib/ui/screens/home/unread_messages_card/` — home screen badge + conversation list entry.
- `tablet/lib/models/conversation.dart` — `Conversation` model.
- `tablet/lib/models/chat_message.dart` — `ChatMessage` model.

## Backend relationship

- `ConversationMessageCreated` WS event → `RealtimeService` dispatches to `ConversationController` to prepend the new message and increment unread count in `ReadReceiptController`.
- `GET /conversation` — list all conversations for this device's resident.
- `GET /conversation/:id/messages` — paginated message history.
- `POST /conversation/:id/message` — send a new message.
- `POST /read-receipt` — mark messages in a conversation as read (called when `ChatDetailScreen` mounts or scrolls to bottom).

## Common change patterns

1. New message field (e.g., attachment) → add to `ChatMessage` model, run `build_runner`, update `chat_detail` render logic, update `conversation.service.dart` send method.
2. Real-time message update behavior → modify `ConversationController`'s handler for `ConversationMessageCreated`; ensure list sort order is maintained.
3. Unread badge changes → `ReadReceiptController` owns the unread count map; update there and verify the `UnreadMessagesCard` widget rebuilds.
4. Pagination → `conversation.service.dart` fetches by page; `ConversationController` should append pages correctly without duplicating messages.

## Gotchas

- The tablet's auth is device-based (not resident-user), so conversation list is scoped by the device's `residentId`. If the resident changes, conversations must be refreshed.
- Read receipts should be POST-ed only when the chat screen is actually visible — not when a WS event arrives in the background, as that would falsely clear the unread badge.
- Message ordering: sort by `sentAt` descending for the list, ascending for the thread. An off-by-one in sort direction creates confusing UI.
- `build_runner` must be re-run after any `@JsonSerializable` model change — missing this causes silent deserialization failures with no runtime error in release mode.

## Done checklist

- Sending a message POSTs correctly and the new message appears in the thread without duplication.
- Receiving a WS message updates both the conversation list (last message preview + unread count) and the thread (if open).
- Opening a conversation POSTs the read receipt and clears the unread badge.
- Pagination loads additional messages without duplicates or ordering artifacts.
- `build_runner` has been re-run if any model was modified.
