---
status: draft
owner: Mike
created: 2026-04-27
tags:
  - plan
  - frontend
  - backend
  - support
related:
  - "[[Frontend/Agent Work Guide]]"
  - "[[Frontend/Domain Playbooks]]"
type: plan
---

# Support Ticketing UX v2 — Plan

## Goal

Reduce friction in the Heylo Support flow by replacing a single long-form dropdown experience with a card-based selection flow, adding ticket progress visibility, improving the date/time field UX, and delivering a proper centered confirmation instead of a corner toast.

---

## Current State

| Area | What exists today |
|---|---|
| Entry point | `frontend/app/(private)/heylo-support/page.tsx` — single `<Select>` dropdown for ticket type, then shows `TicketForm` |
| Form | `frontend/components/heylo-support/ticket-form.tsx` — dynamic form driven by `ticketType.ticket_type_attributes`; urgency is rendered as a generic `list` dropdown; datetime uses `<Input type="datetime-local" />` |
| Confirmation | `toast.success("Ticket submitted successfully.")` via sonner — bottom-right corner |
| Post-submit state | Form resets but page stays on the same ticket-type-selected view |
| Ticket history | None — no list or status view exists |
| API | `intercomService.getTicketTypes()` and `intercomService.createTicket()` — no fetch-submitted-tickets method |

---

## Definition of Done

- [ ] "My Tickets" list is visible on the home/landing view, showing each submitted ticket's title, type, status badge, and creation date
- [ ] "Create New Ticket" button at the top of the page opens the new ticket flow
- [ ] Issue type is selected via a card grid, not a dropdown
- [ ] Urgency field (wherever it appears in the ticket attributes) is rendered as a card grid, not a dropdown
- [ ] Datetime fields show: a date picker, a time dropdown (30-min increments), and an "I'm not sure" toggle that clears/disables time selection; label reads "Estimated date" instead of the raw attribute label
- [ ] Post-submission confirmation is a centered modal dialog, not a toast
- [ ] After dismissing the modal the user is returned to the home/landing view
- [ ] All existing field types (site, common area, string, boolean, files, integer/float) continue to render correctly

---

## Scope Boundaries

- No changes to the backend Intercom proxy endpoints beyond adding one new `GET /intercom/tickets` route
- No changes to the tablet, Go, or hub stacks
- No redesign of the file upload or site/common-area dependency fields
- Not changing how ticket data is stored or routed in Intercom

---

## Open Questions

- **Intercom tickets API** — Does the Intercom API support fetching tickets by contact/user? Need to verify the endpoint shape before wiring `getMyTickets()`. If Intercom doesn't support per-user ticket lookup, the "My Tickets" tab is blocked and should ship separately once the API question is resolved.
- **Urgency field name** — The urgency attribute name in Intercom may vary by ticket type. Confirm the exact `attr.name` / `attr.label` value(s) that map to urgency so the card-selector heuristic targets the right field.
- **Card content for urgency** — Proposed options: Low / Medium / High / Critical with color coding. Confirm with design before building.

---

## Proposed File Layout

No new routes. All changes are within `frontend/app/(private)/heylo-support/` and `frontend/components/heylo-support/`.

```
frontend/
  app/(private)/heylo-support/
    page.tsx                          # Refactored — adds view state, card-based type selection, tabs

  components/heylo-support/
    ticket-form.tsx                   # Updated — urgency cards, datetime UX, success modal callback
    ticket-type-cards.tsx             # NEW — card grid for selecting a TicketType
    ticket-option-cards.tsx           # NEW — reusable card grid for any list attribute (urgency, etc.)
    ticket-success-modal.tsx          # NEW — centered confirmation dialog
    ticket-datetime-field.tsx         # NEW — date picker + time dropdown + "I'm not sure" toggle
    my-tickets.tsx                    # NEW — fetches and renders the user's submitted tickets list

  services/
    intercomService.ts                # Add getMyTickets() method

  lib/models/intercom/
    ticketTypeModel.ts                # Add TicketSummary interface for the list view
    intercomSupportConstants.ts       # NEW — SupportView enum, urgency field name constants, time slot constants
```

---

## Implementation Steps

### Step 1 — My Tickets API (`intercomService.ts` + backend)

**Goal:** Fetch the current user's submitted tickets so the home view can show status.

**Backend** (`backend/` — NestJS):
- Add `GET /intercom/tickets` route to the existing Intercom controller
- Call the Intercom API to list tickets for the authenticated contact
- Return array of `{ id, title, ticketType, state, createdAt, updatedAt }`

**Frontend** (`services/intercomService.ts`):
```ts
getMyTickets(): Promise<TicketSummary[]>
```

Add `TicketSummary` to `ticketTypeModel.ts`:
```ts
export interface TicketSummary {
  id: string;
  title: string;
  ticketType: string;
  state: "submitted" | "in_progress" | "waiting_on_customer" | "resolved";
  createdAt: string;
  updatedAt: string;
}
```

> If Intercom doesn't support per-user lookup, stub this with an empty array and add a `// TODO` — the rest of the plan is unblocked.

---

### Step 2 — `my-tickets.tsx` (new component)

Renders a list of `TicketSummary` items with:
- Ticket title (or ticket type name if no title)
- Status badge — color-coded: `submitted` → blue, `in_progress` → yellow, `waiting_on_customer` → orange, `resolved` → green
- Friendly date (e.g. "Apr 15" or "3 days ago")
- Empty state: "No tickets submitted yet."
- Loading skeleton while fetching

---

### Step 3 — `ticket-type-cards.tsx` (new component)

Replaces the `<Select>` on `page.tsx` with a responsive card grid.

Props: `ticketTypes: TicketType[], selected: string, onSelect: (id: string) => void`

Each card shows:
- `type.icon` (if present) or a default icon
- `type.name` (bold)
- `type.description` (muted, 2-line clamp)
- Selected state: ring/border highlight

---

### Step 4 — `ticket-option-cards.tsx` (new component)

Reusable card grid for single-select list attributes — used for urgency (and any other `list` attribute we want to promote to cards in the future).

Props: `options: { label: string; value: string }[], selected: string, onSelect: (value: string) => void`

For urgency specifically, add color accents per level:
- Low → gray/muted
- Medium → yellow
- High → orange  
- Critical → red/destructive

---

### Step 5 — `ticket-datetime-field.tsx` (new component)

Replaces the raw `<Input type="datetime-local" />` in `ticket-form.tsx`.

Props: `value: string, onChange: (value: string) => void, required: boolean, label: string`

Renders:
1. Label — hard-coded to **"Estimated date"** (overrides raw attribute label for all datetime fields)
2. Date picker input (`<Input type="date" />`)
3. Time dropdown — 30-minute increments from 12:00 AM → 11:30 PM
4. "I'm not sure" checkbox — when checked, disables and clears the time dropdown; stores date only in form value
5. Combines date + time into an ISO string for the form value; when "I'm not sure" is checked, stores the date at midnight UTC

---

### Step 6 — `ticket-success-modal.tsx` (new component)

Replaces `toast.success(...)` in `ticket-form.tsx`.

Uses shadcn/ui `<Dialog>` centered on screen.

Content:
- Checkmark icon (green)
- Heading: "Ticket Submitted"
- Body: "We've received your request and will be in touch soon. You can track progress in My Tickets."
- Single CTA button: "Done" — closes modal and triggers `onSuccess` callback

Props: `open: boolean, onClose: () => void`

---

### Step 7 — Update `ticket-form.tsx`

Changes:
1. Add prop `onSuccess: () => void` — called after the success modal is dismissed
2. In `renderField`, detect urgency field using a named constant from `intercomSupportConstants.ts` (e.g. `URGENCY_FIELD_KEYWORDS = ["urgency"]`) — never an inline string literal — render `<TicketOptionCards>` instead of `<Select>`
3. Replace `case "datetime":` renderer with `<TicketDatetimeField>`
4. Replace `toast.success(...)` call with `setShowSuccess(true)`; add `<TicketSuccessModal open={showSuccess} onClose={() => { setShowSuccess(false); onSuccess(); }} />`
5. Remove `toast.error(...)` on submit failure — keep as is (toast is appropriate for errors)

---

### Step 8 — Refactor `page.tsx`

Replace the current page with a two-view layout:

**View: `home`** (default)
```
[ Create New Ticket button ]   ← top right or top of content area
My Tickets
  <MyTickets />                ← ticket list with status
```

**View: `new-ticket`**
```
[ ← Back to My Tickets ]
Select Issue Type
  <TicketTypeCards />          ← card grid, replaces <Select>

(when a type is selected, TicketForm slides in below)
  <TicketForm onSuccess={() => setView('home')} />
```

State shape — use the `SupportView` string enum from `intercomSupportConstants.ts` (per project enum convention; see `RoleId` in `lib/models/common/role-id.ts` as the canonical example):
```ts
// lib/models/intercom/intercomSupportConstants.ts
export enum SupportView {
  Home      = "home",
  NewTicket = "new-ticket",
}
```

```ts
const [view, setView] = useState<SupportView>(SupportView.Home);
const [selectedTypeId, setSelectedTypeId] = useState('');
```

The "Create New Ticket" button sets `view = 'new-ticket'` and clears `selectedTypeId`.  
`onSuccess` callback from `TicketForm` sets `view = 'home'` and clears `selectedTypeId`.

---

## Implementation Order

1. Step 1 — Backend endpoint + `getMyTickets()` (can be stubbed if API is unclear)
2. Step 2 — `my-tickets.tsx`
3. Step 3 — `ticket-type-cards.tsx`
4. Step 4 — `ticket-option-cards.tsx`
5. Step 5 — `ticket-datetime-field.tsx`
6. Step 6 — `ticket-success-modal.tsx`
7. Step 7 — Update `ticket-form.tsx`
8. Step 8 — Refactor `page.tsx`

Steps 2–6 are independent and can be built in parallel. Steps 7–8 depend on 3–6 being done.

---

## Frontend Done Checklist (from Agent Work Guide)

- [ ] No raw hex color values — use theme utilities (`text-foreground`, `bg-muted`, `text-destructive`, `bg-card`, `border-border`, etc.) from `globals.css`
- [ ] No inline string literals for discriminated values — use enums (`SupportView`, ticket state values, urgency levels)
- [ ] No inline route strings — `/heylo-support` already defined in sidebar; ensure no new inline paths are added
- [ ] No magic numbers (time slot increments, max files, etc.) — extract to `intercomSupportConstants.ts`
- [ ] Service contracts still match backend responses
- [ ] Lint passes for all touched files
- [ ] `_Engineering/Frontend/` notes updated if any architectural behavior changes

---

## Testing Checklist

- [ ] Select each ticket type via cards — correct form renders
- [ ] Urgency card selection populates form value correctly; form validates as required
- [ ] Datetime: date + time combo produces correct ISO string; "I'm not sure" clears time
- [ ] Submit shows centered modal, not corner toast
- [ ] "Done" on modal returns to home view with My Tickets list visible
- [ ] My Tickets list loads and shows correct status badges
- [ ] Error on submit still shows error toast (not modal)
- [ ] Existing field types (site, common area, file upload, checkbox, text) unaffected
