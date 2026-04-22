---
status: proposed
owner: Mike
created: 2026-04-21
tags:
  - plan
  - frontend
  - design-system
  - tailwind
related:
  - "[[Frontend/High Level Overview]]"
type: plan
updated: 2026-04-21
---

# Frontend theme colors and design tokens — Plan

## Goal

Replace scattered **hardcoded hex colors** (for example `bg-[#4655E5]`, `text-[#262428]`, inline `#008556` in device status UI) with **named design tokens** that live in one place, so colors stay consistent, easier to tweak for dark mode later, and safer to reuse across components.

Initial pain example: `frontend/components/devices/device-status-badge.tsx` mixes status dot colors, neutrals, borders, and warning surfaces as arbitrary Tailwind values.

## Current state

- **Tailwind v4** is wired through `frontend/app/globals.css` with `@import "tailwindcss"` and `@theme inline { ... }` mapping shadcn-style tokens (`--color-primary`, `--destructive`, charts, sidebar, etc.) to CSS variables on `:root` and `.dark`.
- **Many components still use** `bg-[#...]`, `text-[#...]`, `border-[#...]`, and similar arbitrary values. A quick repo scan shows hex usage across dozens of files (devices, alerts, communication, connection tables, socket context, etc.), not only device badges.
- **Risk today**: the same semantic idea (for example “error red” or “muted body text”) may be spelled as slightly different hex values in different files.

## Definition of done (for a first shippable slice)

- **Token source of truth**: new semantic colors are defined once (prefer extending the existing `@theme inline` + `:root` / `.dark` pattern in `globals.css`, or a small dedicated `frontend/app/design-tokens.css` imported before component styles if the file grows too large).
- **Tailwind usage**: components consume tokens via stable class names (for example `bg-device-wifi`, `text-body`, `border-subtle`) instead of `bg-[#4655E5]` unless there is a documented exception.
- **Pilot migration**: `device-status-badge.tsx` (and optionally one adjacent “high visibility” surface such as device connectivity) is fully migrated off hardcoded hex for its recurring colors.
- **Documentation**: a short comment block or section in this plan’s “Token catalog” table (below) lists each token, meaning, and light/dark value — updated when tokens change.
- **No visual regression** on the pilot screens (spot-check in light theme; dark theme behavior explicitly called out in open questions if we defer dark parity).

## Recommended approach

### 1. Separate “palette” from “semantic” tokens (lightweight)

- **Primitives** (optional): `--color-heylo-green-600`, `--color-heylo-indigo-500` if we want raw brand anchors. Keep this list small.
- **Semantics** (preferred for most UI): names that describe **usage**, not the paint mix — for example `--color-status-online`, `--color-status-wifi`, `--color-text-secondary`, `--color-border-default`, `--color-surface-warning`.

Map semantics to primitives or directly to `oklch(...)` / hex in `:root` and `.dark` so swapping themes does not require grep-replacing components.

### 2. Wire semantics into Tailwind `@theme`

Extend `@theme inline` with entries such as:

- `--color-status-online` → exposed as `bg-status-online`, `text-status-online`, etc.
- Reuse existing shadcn tokens where they already match meaning (`destructive` for destructive actions) instead of inventing parallel reds.

Follow the same pattern already used in `globals.css` (`--color-*: var(--token-name)` in `@theme`, concrete values in `:root` / `.dark`).

### 3. Migration strategy (phased, low blast radius)

| Phase | What | Outcome |
| ----- | ---- | ------- |
| **A — Audit** | Run structured searches for `#RRGGBB`, `rgb(`, `rgba(`, and `bg-[#` / `text-[#` in `frontend/`. Bucket results into categories: status/connectivity, alerts, neutrals, charts, one-off marketing. | A prioritized hit list and a “duplicate hex” report (same color, many files → one token). |
| **B — Token catalog v1** | Add only the tokens needed for the pilot + any obvious duplicates uncovered in A (for example one shared “body text” and “muted text” if they recur). | Small, reviewable CSS surface area. |
| **C — Pilot PR** | Migrate `device-status-badge.tsx` (and agreed adjacent files) to semantic classes. | Proof the pattern works with Tailwind v4 in this repo. |
| **D — Ongoing** | New work uses tokens; legacy files migrate opportunistically or by feature area (alerts, devices, communication). | Steady debt burn without a mega-PR. |

### 4. Naming conventions (proposal)

- **Prefix by domain** when the color is not generic: `status-*`, `connectivity-*`, `alert-severity-*`.
- **Generic UI** tokens: `text-primary`, `text-muted`, `border-subtle`, `surface-warning` — align names with shadcn vocabulary where overlap exists to reduce mental load.

### 5. Edge cases to decide up front

- **Opacity in arbitrary values** (for example `bg-[#00000066]`): prefer `bg-black/40` only if it matches design; otherwise define a dedicated token `--color-status-standby` with the intended alpha baked in or use `color-mix` / `oklch` with alpha in the token.
- **Charts**: chart colors already exist as `--chart-1` … `--chart-5`; prefer extending that set for new chart series instead of new random hex in components.
- **Socket / connection “state” colors** in `socket-context.tsx`-style files: treat as **connectivity semantics** and name tokens accordingly so refactors stay grep-friendly.

## Token catalog v1 (starter — fill during implementation)

| Token (semantic) | Intended use | Notes |
| ---------------- | ------------ | ----- |
| `status-online` | Online / Ethernet good state | May share value with brand green |
| `status-offline` | Offline / error emphasis | Align with or compose from `destructive` |
| `status-standby` | Standby / indeterminate | Opacity / muted treatment |
| `status-wifi` | Wi‑Fi connectivity | Replaces `#4655E5` usage where that meaning holds |
| `status-mobile` | Cellular | Replaces `#FF8C00` family |
| `text-body` | Primary paragraph / label text | Replaces repeated `#262428`-class neutrals if audit confirms |
| `text-muted` | Secondary timestamps, hints | Replaces `#6E6B73`-style neutrals |
| `border-subtle` | Card / badge outlines | Replaces `#DADADA` where generic |

Adjust rows after the audit so every row corresponds to an actual migrated callsite.

## Open questions

- **Dark mode parity for status colors**: should status dots stay the same hue across themes, or shift for contrast on dark backgrounds? Product/design call — tokens should still exist either way.
- **Single file vs split**: if `globals.css` grows unwieldy, split tokens into `design-tokens.css` and `@import` it — keep one logical “tokens” story for contributors.

## Related files (starting points)

- `frontend/app/globals.css` — `@theme inline`, `:root`, `.dark`
- `frontend/components/devices/device-status-badge.tsx` — pilot candidate
- Broader hex usage — see phase A search results under `frontend/`
