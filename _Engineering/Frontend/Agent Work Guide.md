---
type: guide
tags: [frontend, agents]
owner: Mike
updated: 2026-04-21
status: current
---
# Frontend - Agent Work Guide

This guide is optimized for agents making changes in `frontend/`.

Use with [[Frontend/High Level Overview]] (deep reference).
Use [[Frontend/Domain Playbooks]] for subsystem-specific entry points.

---

## What this repo owns

- Operator web console (Next.js App Router).
- Role-gated private routes and public auth flows.
- UI and interaction layer for alerts, calls, communication, sites, users, analytics, caseloads.
- Realtime client handling via WebSocket context.

---

## High-signal files to read first

- `frontend/app/(private)/layout.tsx` - private app shell and providers.
- `frontend/middleware.ts` - auth redirects and role route gating.
- `frontend/context/socket-context.tsx` - realtime behavior and event side effects.
- `frontend/hooks/useUser.tsx` - user/config bootstrap and auth-dependent state.
- `frontend/lib/api.ts` - shared axios configuration.
- `frontend/lib/models/common/event.ts` - event and command enums.
- `frontend/services/` - API-facing methods by domain.
- `frontend/components/sidebar/app-sidebar.tsx` and `frontend/lib/utils.ts` - nav visibility by role.

---

## Fast change recipes

### Add a private page

1. Add route under `frontend/app/(private)/...`.
2. Add role handling in `frontend/middleware.ts` if needed.
3. Add sidebar entry if needed, then update filtering logic.
4. Add/extend service call in `frontend/services/*`.

### Add a new API response field to UI

1. Update model under `frontend/lib/models/`.
2. Update service mapping/usage under `frontend/services/*`.
3. Update component props/render path.
4. Verify empty/loading/error states still make sense.

### Add a realtime interaction

1. Confirm event name in `frontend/lib/models/common/event.ts`.
2. Handle in `frontend/context/socket-context.tsx` and/or subscribe via `EventHub`.
3. Check navigation/notification/toast behavior.
4. Ensure duplicate event handling is avoided.

---

## Coding standards

### Colors — always use Tailwind theme tokens, never raw hex

All brand and UI colors are defined as named tokens in `frontend/app/globals.css` inside a `@theme` block. Use those token names in Tailwind classes. Never write `text-[#6F6C76]`, `bg-[#262428]`, etc. inline in components.

Current Heylo tokens:

| Token | Use |
|---|---|
| `text-heylo-body` / `bg-heylo-body` | Primary text (#262428) |
| `text-heylo-muted` / `bg-heylo-muted` | Secondary / subdued text and icons (#6F6C76) |
| `text-heylo-dim` | Dimmed text, e.g. outside-month days (#9C99A3) |
| `bg-heylo-surface` / `hover:bg-heylo-surface` | Subtle background, hover states (#F8F8F8) |
| `bg-heylo-brand` | Brand/primary action color (#4655E5) |
| `border-heylo-error-border` | Error border (#E399A0) |
| `text-heylo-error-text` | Error text (#61050E) |

If you need a color that isn't in this table, **add it to the `@theme` block in `globals.css` first**, then use the token name.

### Discriminated string values — always use enums, never inline literals

When a prop or state field accepts a fixed set of string values (e.g. a view mode, a layout type, a status), define a TypeScript string enum and use it everywhere. Do not compare against `"month"`, `"week"`, `"site"`, `"person"`, etc. as raw strings in component logic.

Pattern:

```ts
// lib/models/<domain>/<domain>Constants.ts
export enum ViewMode {
  Month = "month",
  Week  = "week",
}
```

Then in components:

```ts
if (view === ViewMode.Month) { ... }
<ToggleGroupItem value={ViewMode.Week} />
```

The existing `RoleId` enum in `lib/models/common/role-id.ts` is the canonical example — follow that pattern for any new feature.

### Route paths — always use a named constant, never inline strings

Route strings like `"/caseload-management/v2"` appear in middleware, nav filtering, and sidebar data. Define them once as exported constants and import everywhere. This prevents drift when a route is renamed.

```ts
// lib/models/<domain>/<domain>Constants.ts
export const CASELOAD_V2_PATH = "/caseload-management/v2";
```

### Magic numbers and fallback strings — name everything

Unnamed numbers and placeholder strings make intent invisible and scatter changes across files. Extract them to a constants file with a descriptive name.

```ts
export const PILL_BORDER_LEFT_WIDTH = 4;          // not: borderLeftWidth: 4
export const PILL_BG_ALPHA = 0.08;                // not: hexToRgba(color, 0.08)
export const DEFAULT_SITE_COLOR = "#DADADA";
export const UNASSIGNED_STAFF_LABEL = "Unassigned staff";
export const AGENCY_NAME_PLACEHOLDER = "Selected Agency"; // name documents it's a placeholder
```

### Constants file convention

Each feature domain that has its own state, enums, or repeated literals should have a `<domain>Constants.ts` file alongside its models. See `lib/models/caseload/caseloadConstants.ts` as the reference implementation.

---

## Gotchas and drift risks

- Route access logic exists in multiple places (middleware + nav filtering).
- Caseload beta has active migration work (fixtures and GraphQL transition context).
- Some state/tooling dependencies may be legacy; verify usage before adding more.
- Middleware currently carries both routing and analytics concerns.

---

## Done checklist for frontend tasks

- Route behavior works for each affected role.
- Service contracts still match backend responses.
- Realtime handlers do not break existing toast/audio behavior.
- No raw hex color values in components — use `heylo-*` Tailwind tokens.
- No inline string literals for discriminated values — use enums.
- No inline route strings — use path constants.
- Lint passes for touched files.
- Update `_Engineering/Frontend/*` notes when behavior changes.
