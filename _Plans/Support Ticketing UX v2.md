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

Reduce friction in the Heylo Support flow by replacing a single long-form dropdown experience with a **3-step card-based wizard**, adding ticket progress visibility on a home/landing view, improving the date/time field UX, and delivering a proper centered confirmation instead of a corner toast.

---

## Current State

| Area | What exists today |
|---|---|
| Entry point | `frontend/app/(private)/heylo-support/page.tsx` — single `<Select>` dropdown for ticket type, then shows `TicketForm` |
| Form | `frontend/components/heylo-support/ticket-form.tsx` — dynamic form driven by `ticketType.ticket_type_attributes`; urgency rendered as a generic `list` dropdown; datetime uses `<Input type="datetime-local" />` |
| Confirmation | `toast.success("Ticket submitted successfully.")` via sonner — bottom-right corner |
| Post-submit state | Form resets but page stays on the same ticket-type-selected view |
| Ticket history | None — no list or status view exists |
| API | `intercomService.getTicketTypes()` and `intercomService.createTicket()` — no fetch-submitted-tickets method |

---

## Definition of Done

- [ ] Home view shows "OPEN TICKETS" list with ticket type icon, title, friendly date, site, and color-coded status badge
- [ ] "+ New ticket" button top-right on home view opens the 3-step wizard
- [ ] **Step 1** — Issue type selected via 2-column card grid (icon + name + description per card); "Continue →" advances to Step 2
- [ ] **Step 2** — Form fields rendered with: description textarea, site dropdown, "when did this happen?" recency card selector, urgency card selector (Low / Medium / High); "Continue →" advances to Step 3
- [ ] **Step 3** — Date + approximate time fields shown for ticket types that need precise timestamps (hardware/device); "Submit" sends the ticket
- [ ] Progress bar tracks current step across all 3 steps; "← Back" returns to previous step
- [ ] Urgency renders as 3 cards: 🟢 Low ("Can wait") / 🟡 Medium ("Affecting some") / 🔴 High ("Blocking residents")
- [ ] "When did this happen?" renders as button cards: Just now / Earlier today / Yesterday / A few days ago / Ongoing
- [ ] Datetime field (Step 3) shows "ESTIMATED DATE" input + "APPROXIMATE TIME" dropdown (30-min increments) + "I'm not sure" option that clears and disables the time dropdown
- [ ] Post-submission confirmation is a centered modal dialog, not a toast
- [ ] After dismissing the modal the user returns to the home view
- [ ] All existing field types (site, common area, string, boolean, files, integer/float) continue to render correctly in Step 2/3

---

## Scope Boundaries

- No changes to the backend Intercom proxy endpoints beyond adding one new `GET /intercom/tickets` route
- No changes to the tablet, Go, or hub stacks
- No redesign of the file upload or site/common-area dependency fields
- Not changing how ticket data is stored or routed in Intercom

---

## Open Questions

- **Intercom tickets API** — Does the Intercom API support fetching tickets by contact/user? Need to verify the endpoint shape before wiring `getMyTickets()`. If not supported, stub with an empty array and ship the home view skeleton — rest of the plan is unblocked.
- **Step 3 scope** — Which ticket types need the precise date/time step? Mockup suggests device/hardware types. Confirm the rule: is it driven by a field `data_type === "datetime"` being present in the ticket's attributes, or by ticket type category?
- **Urgency field name** — Confirm the exact `attr.name` / `attr.label` from Intercom that maps to urgency so the card-selector heuristic targets the right field.
- **"When did this happen?" field** — ✅ Resolved: will be added as a `list` attribute in Intercom. Frontend renders it dynamically from `input_options` using `<TicketRecencyCards>`, detected by field name keyword (same pattern as urgency). No hardcoded options needed in constants.

---

## Proposed File Layout

No new routes. All changes are within `frontend/app/(private)/heylo-support/` and `frontend/components/heylo-support/`.

```
frontend/
  app/(private)/heylo-support/
    page.tsx                            # Refactored — home view + wizard entry point

  components/heylo-support/
    ticket-wizard.tsx                   # NEW — 3-step wizard shell with progress bar and Back/Continue nav
    ticket-step-type.tsx                # NEW — Step 1: issue type card grid
    ticket-step-details.tsx             # NEW — Step 2: description, site, recency cards, urgency cards
    ticket-step-datetime.tsx            # NEW — Step 3: date picker + approximate time dropdown
    ticket-recency-cards.tsx            # NEW — "When did this happen?" button card selector
    ticket-option-cards.tsx             # NEW — reusable single-select card grid (urgency, etc.)
    ticket-success-modal.tsx            # NEW — centered confirmation dialog
    my-tickets.tsx                      # NEW — home view ticket list with status badges

  services/
    intercomService.ts                  # Add getMyTickets() method

  lib/models/intercom/
    ticketTypeModel.ts                  # Add TicketSummary interface
    intercomSupportConstants.ts         # NEW — SupportView enum, SupportStep enum, urgency/recency constants
```

---

## Implementation Steps

### Step 1 — My Tickets API (`intercomService.ts` + backend)

**Goal:** Fetch the current user's submitted tickets for the home view.

**Backend** (`backend/` — NestJS):
- Add `GET /intercom/tickets` to the existing Intercom controller
- Call the Intercom API to list tickets for the authenticated contact
- Return array of `{ id, title, ticketTypeId, ticketTypeName, ticketTypeIcon, site, state, createdAt, updatedAt }`

**Frontend** (`services/intercomService.ts`):
```ts
getMyTickets(): Promise<TicketSummary[]>
```

Add `TicketSummary` to `ticketTypeModel.ts`:
```ts
export interface TicketSummary {
  id: string;
  title: string;
  ticketTypeName: string;
  ticketTypeIcon: string;        // emoji or icon identifier — used in ticket list rows
  site: string | null;
  state: TicketState;
  createdAt: string;
  updatedAt: string;
}
```

Add `TicketState` enum to `intercomSupportConstants.ts` (not an inline string union):
```ts
export enum TicketState {
  Open             = "open",
  InProgress       = "in_progress",
  WaitingOnCustomer = "waiting_on_customer",
  Resolved         = "resolved",
}
```

> If Intercom doesn't support per-user lookup, stub `getMyTickets()` to return `[]` and mark with `// TODO` — the rest of the plan is unblocked.

---

### Step 2 — `my-tickets.tsx` (new component)

Home view ticket list. Renders "OPEN TICKETS" section header and a list of `TicketSummary` rows.

Each row:
- Left: ticket type icon in a rounded square container
- Center: bold title, then muted subtitle — "Opened X days ago · Site: Y" (or "Resolved Apr 10 · Site: Y" for resolved)
- Right: status badge — color per `TicketState`:
  - `open` → blue
  - `in_progress` → orange
  - `waiting_on_customer` → yellow
  - `resolved` → green

Empty state: "No tickets yet. Create your first ticket to get started."
Loading: skeleton rows while fetching.

---

### Step 3 — `intercomSupportConstants.ts` (new file)

Central constants for the support feature — no magic strings or numbers elsewhere.

```ts
export enum SupportView {
  Home      = "home",
  NewTicket = "new-ticket",
}

export enum SupportStep {
  IssueType = 1,
  Details   = 2,
  DateTime  = 3,
}

export enum TicketState { ... }  // from Step 1

export enum UrgencyLevel {
  Low    = "Low",
  Medium = "Medium",
  High   = "High",
}

export const URGENCY_OPTIONS = [
  { value: UrgencyLevel.Low,    label: "Low",    subtitle: "Can wait",          dot: "🟢" },
  { value: UrgencyLevel.Medium, label: "Medium", subtitle: "Affecting some",    dot: "🟡" },
  { value: UrgencyLevel.High,   label: "High",   subtitle: "Blocking residents", dot: "🔴" },
] as const;

// Recency options come from Intercom input_options — no hardcoded list needed here.
// RECENCY_FIELD_KEYWORDS is used to detect the field and render it as cards instead of a dropdown.
export const RECENCY_FIELD_KEYWORDS = ["when", "happen", "occurred"] as const;
export const URGENCY_FIELD_KEYWORDS = ["urgency"] as const;
export const TIME_SLOT_INTERVAL_MINUTES = 30;
```

---

### Step 4 — `ticket-option-cards.tsx` (new component)

Reusable single-select card grid. Used for urgency.

Props: `options: { value: string; label: string; subtitle?: string; dot?: string }[], selected: string, onSelect: (value: string) => void`

Renders a horizontal row (or wrapping grid) of bordered cards. Selected card gets a ring highlight. Urgency cards show dot + bold label + muted subtitle stacked vertically.

---

### Step 5 — `ticket-recency-cards.tsx` (new component)

"When did this happen?" card renderer. Options come from the Intercom `list` attribute's `input_options` — no hardcoded values in the component.

Props: `options: { label: string; value: string }[], selected: string, onSelect: (value: string) => void`

Renders as a wrapping set of pill-style button cards (label-only, no subtitle). Selected card gets a ring/border highlight. Detected in `ticket-step-details.tsx` by field name matching `RECENCY_FIELD_KEYWORDS` — renders this component instead of the default `<Select>`.

---

### Step 6 — `ticket-step-type.tsx` — Step 1 (new component)

Issue type card grid. 2-column layout.

Props: `ticketTypes: TicketType[], selected: string, onSelect: (id: string) => void`

Each card:
- `type.icon` rendered large at top
- `type.name` in bold
- `type.description` in muted text, 2-line clamp
- Selected state: ring highlight on card border

---

### Step 7 — `ticket-step-details.tsx` — Step 2 (new component)

The main form step. Renders:
1. Ticket type badge at top (icon + name) — visual confirmation of Step 1 selection
2. "DESCRIBE THE ISSUE *" — `<Textarea>` with placeholder (e.g. "e.g. The tablet in Room 3B won't connect to Wi-Fi...")
3. "SITE" — `<Select>` dropdown (optional), same site list as today
4. "WHEN DID THIS HAPPEN?" — `<TicketRecencyCards>`
5. "HOW URGENT IS THIS?" — `<TicketOptionCards>` with `URGENCY_OPTIONS`
6. Any other `visible_on_create` attributes from the ticket type that are not datetime — render with existing field logic

Props: `ticketType: TicketType, sites: IntercomSite[], formData: Partial<TicketFormData>, onChange: (data: Partial<TicketFormData>) => void`

---

### Step 8 — `ticket-step-datetime.tsx` — Step 3 (new component)

Shown only when the selected ticket type has a `datetime` attribute (i.e. needs a precise timestamp for log correlation).

Renders:
- Section header: "WHEN DID THE ISSUE OCCUR?"
- ESTIMATED DATE label + `<Input type="date" />`
- APPROXIMATE TIME label + `<Select>` with 30-min slots from 12:00 AM → 11:30 PM; generated from `TIME_SLOT_INTERVAL_MINUTES` constant
- "I'm not sure" toggle inline next to the time dropdown — when checked, clears and disables the time select; form value stores date only
- Helper text: "A 2-hour window is enough for our team to correlate with device logs."

Props: `value: { date: string; time: string }, onChange: (value: { date: string; time: string }) => void`

---

### Step 9 — `ticket-success-modal.tsx` (new component)

Replaces `toast.success(...)`.

Uses shadcn/ui `<Dialog>` centered on screen.

Content:
- Green checkmark icon
- Heading: "Ticket Submitted"
- Body: "We've received your request and will be in touch soon. You can track progress in My Tickets."
- CTA button: "Done" — closes modal and calls `onClose`

Props: `open: boolean, onClose: () => void`

---

### Step 10 — `ticket-wizard.tsx` (new component)

The 3-step shell. Owns step state and accumulated form data. Renders the progress bar, Back/Continue navigation, and the active step component.

Props: `ticketTypes: TicketType[], sites: IntercomSite[], onSuccess: () => void`

Internal state:
```ts
const [step, setStep] = useState<SupportStep>(SupportStep.IssueType);
const [formData, setFormData] = useState<Partial<TicketFormData>>({});
```

Logic:
- Step 1 → Step 2: always (any ticket type selected)
- Step 2 → Step 3: only if selected ticket type has a `datetime` attribute; otherwise submit directly from Step 2
- "Continue" is disabled until required fields for the current step are filled
- On final step submit: call `intercomService.createTicket(...)`, show `<TicketSuccessModal>`, on modal close call `onSuccess()`
- Error on submit: `toast.error(...)` (toast is appropriate for errors)

Progress bar: `(step / totalSteps) * 100` width, `bg-primary` fill.

---

### Step 11 — Refactor `page.tsx`

Two views — home and wizard — driven by `SupportView` enum from `intercomSupportConstants.ts`.

```ts
const [view, setView] = useState<SupportView>(SupportView.Home);
```

**Home view** (`SupportView.Home`):
```
Header: "Heylo Support" + subtitle "View your tickets or get help with anything Heylo."
        [ + New ticket ]  ← top right (sets view to SupportView.NewTicket)
<MyTickets />
```

**Wizard view** (`SupportView.NewTicket`):
```
<TicketWizard
  ticketTypes={ticketTypes}
  sites={sites}
  onSuccess={() => setView(SupportView.Home)}
/>
```

The `<SiteHeader>` "Create New Ticket" / back behavior moves into the wizard shell's own nav so the header stays clean.

---

## Implementation Order

1. Step 3 — `intercomSupportConstants.ts` (unblocks everything else)
2. Step 1 — Backend `GET /intercom/tickets` + `getMyTickets()` (can be stubbed)
3. Step 2 — `my-tickets.tsx`
4. Steps 4–5 — `ticket-option-cards.tsx` + `ticket-recency-cards.tsx` (parallel)
5. Steps 6–8 — `ticket-step-type.tsx`, `ticket-step-details.tsx`, `ticket-step-datetime.tsx` (parallel)
6. Step 9 — `ticket-success-modal.tsx`
7. Step 10 — `ticket-wizard.tsx` (depends on 4–6, 9)
8. Step 11 — Refactor `page.tsx` (depends on 2, 3, 10)

---

## Frontend Done Checklist (from Agent Work Guide)

- [ ] No raw hex color values — use theme utilities (`text-foreground`, `bg-muted`, `text-destructive`, `bg-card`, `border-border`, etc.) from `globals.css`
- [ ] No inline string literals for discriminated values — use enums (`SupportView`, `SupportStep`, `TicketState`, `UrgencyLevel`)
- [ ] No inline route strings — `/heylo-support` already defined in sidebar; no new inline paths
- [ ] No magic numbers (time slot interval, max files, etc.) — all in `intercomSupportConstants.ts`
- [ ] Service contracts still match backend responses
- [ ] Lint passes for all touched files
- [ ] `_Engineering/Frontend/` notes updated if any architectural behavior changes

---

## Testing Checklist

- [ ] Home view loads with ticket list and correct status badge colors
- [ ] Ticket rows show ticket type icon, title, site, and friendly date
- [ ] "+ New ticket" opens wizard at Step 1
- [ ] Step 1 — selecting a card enables "Continue →"; unselected keeps it disabled
- [ ] Step 2 — urgency and recency cards select/deselect correctly; form validates required fields before Continue
- [ ] Step 3 — shown only for ticket types with a datetime attribute; "I'm not sure" disables and clears the time dropdown; date label reads "Estimated Date"
- [ ] Back button from Step 2 returns to Step 1 with previous selection intact
- [ ] Back button from Step 3 returns to Step 2 with previous form data intact
- [ ] Submit shows centered modal, not corner toast
- [ ] "Done" on modal returns to home view
- [ ] Error on submit shows toast (not modal)
- [ ] Existing field types (site, common area, file upload, checkbox, text) unaffected
- [ ] Progress bar advances at each step and reflects correct percentage
