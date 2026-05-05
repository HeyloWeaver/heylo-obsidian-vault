---
type: guide
tags: [inventory, frontend, backend, agents]
owner: Mike
updated: 2026-05-05
status: current
---
# Inventory - Agent Work Guide

This guide is optimized for agents making changes in `inventory/` and its backend inventory endpoints.

Use with [[Backend/Agent Work Guide]], [[Agent Operating Loop]], and [[Agent Verification Matrix]].

---

## What inventory owns

- Internal hardware inventory tracking for purchase orders, inbound shipments, manufactured items, stock, and outbound shipments.
- React 18 + TypeScript + Vite frontend.
- MUI 7 UI, React Router 7 routing, and Zustand 5 state.
- Backend inventory controllers/services/entities/migrations in `backend/`.

---

## High-signal files to read first

- `inventory/CLAUDE.md` - app-local conventions and guard rails.
- `inventory/src/App.tsx` - route definitions and top-level providers.
- `inventory/src/components/Layout.tsx` and `inventory/src/components/Sidebar.tsx` - shell and navigation.
- `inventory/src/theme.ts` - MUI theme source of truth.
- `inventory/src/pages/` - page-level data loading.
- `inventory/src/store/` - Zustand stores, including metadata state.
- `inventory/src/types/` - frontend contract types.
- Backend counterpart: search `backend/src/**` for inventory controllers, services, entities, DTOs, and migrations.

---

## Fast change recipes

### Add a new inventory route

1. Create a page component in `inventory/src/pages/`.
2. Add the route in `inventory/src/App.tsx`.
3. Add the nav item in `inventory/src/components/Sidebar.tsx`.
4. Create any needed Zustand store in `inventory/src/store/`.
5. Keep data loading in the page component.

### Add or change inventory data

1. Shape the backend response for what the page renders.
2. Use optimized raw SQL through `repository.manager.query()` for backend reads.
3. Compute counts/aggregates in SQL, not by loading rows and counting in code.
4. Update frontend types in `inventory/src/types/`.
5. After create/update mutations, re-fetch the full page data instead of patching Zustand optimistically.

### Add lookup data

1. Prefer the domain controller that owns the data.
2. Avoid feature-specific "lookup" endpoints when a domain endpoint belongs elsewhere.
3. Avoid frontend request waterfalls. If a form needs agencies and sites together, return nested data from one endpoint.
4. Keep inventory metadata in the shared metadata store when it is globally reused.

---

## Coding standards

- Use MUI components and the existing theme in `theme.ts`; do not introduce Tailwind, Bootstrap, or one-off styling systems.
- Use Zustand for state. Keep stores in `src/store/`, one store per domain concern.
- Network requests originate from page components. Stores and presentational components do not fetch.
- Use named exports for components and stores. `App.tsx` is the one default-export exception.
- Backend mutations return `{ id }`; frontend re-fetches list/page data after success.
- Backend timestamp columns are DB-managed with `insert: false, update: false`.
- Do not use `any` or `@ts-ignore`.
- Do not add dependencies, env vars, or deployment config changes without explicit approval.

---

## Done checklist

- Frontend route/nav/page/store/types are aligned.
- Backend DTO/entity/migration/service/controller are aligned when backend changes are involved.
- Reads use optimized raw SQL and avoid N+1/query waterfalls.
- Counts and aggregates are computed in SQL and parsed from MySQL strings with `parseInt()`.
- Mutation responses stay `{ id }`; frontend re-fetches page data.
- `npm run lint -w inventory` passes or any blocker is reported.
- `npm run build -w inventory` passes before considering frontend work complete.
- Relevant backend lint/test/build checks run for backend changes.
