---
type: guide
tags: [frontend, agents]
owner: Mike
updated: 2026-05-05
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
- `frontend/stores/` - Zustand stores for new feature-level client state.
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

### After a create or update mutation

After a successful create or update call:

1. Expect the API to return only `{ id }` — not the full object.
2. Re-fetch the full page data from the backend (call the existing list/get service method). Do **not** do optimistic or targeted client-state patches. This keeps the UI in sync with computed/aggregated fields from the backend.

### After a realtime interaction

1. Confirm event name in `frontend/lib/models/common/event.ts`.
2. Handle in `frontend/context/socket-context.tsx` and/or subscribe via `EventHub`.
3. Check navigation/notification/toast behavior.
4. Ensure duplicate event handling is avoided.

---

## Coding standards

### State — use Zustand for new feature state

Legacy and app-wide concerns still use providers/Context (`UserProvider`, `SocketProvider`, `VideoCallProvider`). For new feature-level client state, use a Zustand store under `frontend/stores/`; `frontend/stores/useCaseloadScheduleStore.ts` is the reference pattern.

Redux, React Redux, Redux Persist, and Jotai may still appear in `frontend/package.json` as legacy dependencies. Do not treat them as active patterns for new code unless current source usage proves otherwise.

### Colors — always use Tailwind theme tokens, never raw hex

Semantic colors live in `frontend/app/globals.css`: `:root` and `.dark` define CSS variables (`--foreground`, `--muted`, `--primary`, `--destructive`, …). The `@theme inline { … }` block maps those to Tailwind color utilities (`text-foreground`, `bg-muted`, `border-destructive`, …). Use those utilities only. Never write `text-[#6F6C76]`, `bg-[#262428]`, etc. inline in components.

Common mappings:

| Tailwind | Typical use |
|---|---|
| `text-foreground` / `bg-background` | Primary body text and page background |
| `text-muted-foreground` / `text-muted-foreground/70` | Secondary text, icons, dimmed labels (opacity for extra de-emphasis) |
| `bg-muted` / `hover:bg-muted` / `hover:bg-muted/70` | Subtle surfaces, headers, hover rows |
| `bg-primary` + `text-primary-foreground` | Strong emphasis (e.g. “today” on a calendar) |
| `text-destructive`, `border-destructive/50`, `bg-destructive` | Errors and destructive actions |
| `border-border`, `bg-card`, `text-card-foreground` | Cards and neutral borders |
| `ring-ring` | Focus rings (with `focus-visible:ring-2`, etc.) |

If you need a new semantic, **extend `:root` / `.dark` and the `@theme inline` map in `globals.css`** so it stays theme- and dark-mode-aware; do not add one-off hex palettes beside the main system.

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
- Some state/tooling dependencies are legacy (notably Redux/Jotai packages in `package.json`); verify current source usage before adding or copying patterns.
- Middleware currently carries both routing and analytics concerns.

---

## Done checklist for frontend tasks

- Route behavior works for each affected role.
- Service contracts still match backend responses.
- Realtime handlers do not break existing toast/audio behavior.
- No raw hex color values in components — use theme utilities (`foreground`, `muted`, `primary`, `destructive`, `card`, `border`, `ring`, …) from `globals.css`.
- No inline string literals for discriminated values — use enums.
- No inline route strings — use path constants.
- After create/update mutations, re-fetch page data from the backend — no optimistic client-state patches.
- Lint passes for touched files.
- Update `_Engineering/Frontend/*` notes when behavior changes.
