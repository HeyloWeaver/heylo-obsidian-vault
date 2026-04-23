---
status: planned
owner: Mike
created: 2026-04-23
tags:
  - plan
  - frontend
  - backend
  - communication
type: plan
updated: 2026-04-23
---

# Unread Message Count Badge — Plan

## Goal

Show a red dot badge with a white unread count on the **Communication** sidebar nav item for support professionals and administrators. The count should reflect real unread messages from the server, update when new messages arrive, and decrement (or disappear) as messages are marked read. If marking messages as read fails, surface a `?` indicator with a brief error modal.

## Definition of Done

- As a support professional or administrator, if I have non-zero unread messages, I see the count in a red badge on the Communication nav item.
- When a new message arrives via WebSocket, the badge count re-fetches from the API (no local increment — stays in sync with server truth).
- When I open a conversation, my unread messages are marked as read via `POST /ReadReceipt`.
  - On success: the backend broadcasts a WebSocket event back to me → count re-fetches → badge updates.
  - On failure: a `?` appears next to the badge; clicking it shows a small modal: _"We failed to mark your messages as read. Your unread count may be higher than expected."_

---

## What Already Exists

| Thing | Location | Notes |
|---|---|---|
| `POST /ReadReceipt?messageIds=...` | `backend/src/controllers/read-receipt.controller.ts` | Fully working, deduplicates |
| Read receipt save logic | `backend/src/services/read-receipt.service.ts` | No WebSocket broadcast after save yet |
| Unread count query | `backend/src/services/conversation.service.ts` lines 778–789 | **Resident-only** — admin/SP not covered |
| WebSocket infrastructure | `backend/src/services/websocket.service.ts`, `frontend/context/socket-context.tsx` | Used for messages, calls, alerts |
| Frontend `Event` enum | `frontend/lib/models/common/event.ts` | Add `readReceiptsCreated` here |
| Backend `AppEvent` enum | `backend/src/domain/models/common/event.ts` | Add `ReadReceiptsCreated = 19` here |

---

## Implementation Steps

### 1. Backend — New `GET /conversation/unread-count` endpoint

**`backend/src/services/conversation.service.ts`**

Add `getTotalUnreadCount()`:
- Same query as lines 778–789 but without the `RoleId.resident` guard.
- Counts all unread messages across the calling user's conversations.
- Returns `{ count: number }`.

**`backend/src/controllers/conversation.controller.ts`**

Add:
```ts
@Roles(RoleId.admin, RoleId.supportProfessional)
@Get('unread-count')
async getUnreadCount() {
    return await this.conversationSvc.getTotalUnreadCount();
}
```

---

### 2. Backend — Broadcast WebSocket event after read receipts are saved

**`backend/src/domain/models/common/event.ts`**

Add `ReadReceiptsCreated = 19` to `AppEvent`.

**`backend/src/services/read-receipt.service.ts`**

After `readReceiptRepository.save(readReceipts)`:
- Inject `WebSocketService`.
- Broadcast `AppEvent.ReadReceiptsCreated` to the calling user only (not other participants).

This gives the frontend a clean signal to re-fetch the count without polling.

---

### 3. Frontend — Add `readReceiptsCreated` event

**`frontend/lib/models/common/event.ts`**

Add `readReceiptsCreated = "ReadReceiptsCreated"` to the `Event` enum.

---

### 4. Frontend — `readReceiptService`

**New file: `frontend/services/readReceiptService.ts`**

```ts
import api from "@/lib/api";

export const readReceiptService = {
    async create(messageIds: string[]): Promise<void> {
        const params = messageIds.map(id => `messageIds=${id}`).join('&');
        await api.post(`/ReadReceipt?${params}`);
    }
};
```

---

### 5. Frontend — `getUnreadCount` in conversation service

**`frontend/services/conversationService.ts`**

Add:
```ts
async getUnreadCount(): Promise<{ count: number }> {
    const res = await api.get('/conversation/unread-count');
    return res.data;
}
```

---

### 6. Frontend — `UnreadCountContext`

**New file: `frontend/context/unread-count-context.tsx`**

Provides:
- `unreadCount: number`
- `readReceiptError: boolean`
- `clearReadReceiptError: () => void`
- `markMessagesRead: (messageIds: string[]) => Promise<void>`

Behavior:
- Fetches initial count from `GET /conversation/unread-count` on mount (and when user changes).
- Subscribes to `EventHub` for `Event.conversationMessageCreated` → re-fetches count.
- Subscribes to `EventHub` for `Event.readReceiptsCreated` → re-fetches count.
- `markMessagesRead` calls `readReceiptService.create(messageIds)`:
  - Success → re-fetch count.
  - Failure → set `readReceiptError = true`.

Wrap this provider inside `SocketProvider` in the private layout so it shares the socket lifecycle.

---

### 7. Frontend — Call `markMessagesRead` from the chat page

**`frontend/app/(private)/communication/chat/[id]/page.tsx`**

- Consume `useUnreadCount()`.
- When the conversation loads: collect message IDs where `isRead === false` and call `markMessagesRead(ids)`.
- When a new message arrives via WebSocket (already handled in the existing event listener): call `markMessagesRead([newMessage.id])` if the user is currently viewing that conversation.

---

### 8. Frontend — Nav badge UI

**`frontend/components/sidebar/nav-main.tsx`**

- Add optional `badge?: number` and `badgeError?: boolean` to the nav item type.
- When `badge > 0`, render a red dot in the top-right corner of the `SidebarMenuItem` (position `relative` on the item):
  ```tsx
  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-semibold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
    {badge}
  </span>
  ```
- When `badgeError` is true, replace (or augment) with a `?` badge. On click, open a `Popover` or small `Dialog`:
  > _"We failed to mark your messages as read. Your unread count may be higher than expected."_

**`frontend/components/sidebar/app-sidebar.tsx`**

- Consume `useUnreadCount()`.
- Pass `badge: unreadCount` and `badgeError: readReceiptError` to the `Communication` nav item.

---

## Event Flow Diagram

```
New message arrives via WebSocket
  → socket-context fires EventHub: conversationMessageCreated
  → UnreadCountContext re-fetches GET /conversation/unread-count
  → Badge updates

User opens a conversation
  → Chat page calls markMessagesRead(unreadMessageIds)
  → POST /ReadReceipt
      ✓ Success
        → Backend broadcasts ReadReceiptsCreated to user's socket
        → EventHub fires readReceiptsCreated
        → UnreadCountContext re-fetches count
        → Badge decrements / disappears
      ✗ Failure
        → readReceiptError = true
        → ? badge appears with error modal on click
```

---

## Out of Scope

- Residents (they have their own mobile UI).
- Per-conversation unread counts in the chat list (the `active-chats` component already handles this separately).
- Persistent error recovery beyond the `?` modal (retry is manual — user navigates back to the conversation).
