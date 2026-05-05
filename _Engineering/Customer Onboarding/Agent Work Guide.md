---
type: guide
tags: [customer-onboarding, frontend, agents]
owner: Mike
updated: 2026-05-05
status: current
---
# Customer Onboarding - Agent Work Guide

This guide is optimized for agents making changes in `customer-onboarding/`.

Use with [[Agent Operating Loop]], [[Agent Verification Matrix]], and [[Backend/Agent Work Guide]] when the change touches the NestJS onboarding API.

---

## What this app owns

- Public customer onboarding intake forms for `onboard.heylo.tech`.
- React 18 + TypeScript + Vite application shell.
- MUI 7 UI, React Router 7 routing, and Zustand 5 state.
- Frontend counterpart to backend `CustomerOnboarding*` controllers/services/entities.

---

## High-signal files to read first

- `customer-onboarding/CLAUDE.md` - app-local conventions and guard rails.
- `customer-onboarding/src/App.tsx` - route definitions and top-level providers.
- `customer-onboarding/src/main.tsx` - React entrypoint.
- `customer-onboarding/src/theme.ts` - MUI theme source of truth.
- `customer-onboarding/src/pages/` - page-level data loading.
- `customer-onboarding/src/components/` - presentational/shared components.
- `customer-onboarding/src/store/` - Zustand stores.
- `customer-onboarding/src/types/` - TypeScript type definitions.
- Backend counterpart: search `backend/src/**` for `CustomerOnboarding`.

---

## Fast change recipes

### Add a new route

1. Create a page component in `customer-onboarding/src/pages/`.
2. Add the route in `customer-onboarding/src/App.tsx`.
3. Create any needed Zustand store in `customer-onboarding/src/store/`.
4. Add presentational child components in `customer-onboarding/src/components/`.
5. Verify the route with `npm run build -w customer-onboarding`.

### Add or change page data

1. Update the backend endpoint/DTO first if the contract changes.
2. Update TypeScript types in `customer-onboarding/src/types/`.
3. Fetch data from the page component, then write it to the appropriate Zustand store.
4. Keep components presentational; they read from store and props, not directly from the API.
5. Verify loading, empty, error, and submit states.

---

## Coding standards

- Use MUI components and the existing theme in `theme.ts`; do not introduce Tailwind, Bootstrap, or one-off styling systems.
- Use Zustand for state. Keep stores in `src/store/`, one store per domain concern.
- Network requests originate from page components. Stores and presentational components do not fetch.
- Use named exports for components and stores. `App.tsx` is the one default-export exception.
- Do not use `any` or `@ts-ignore`.
- Do not add dependencies, env vars, or deployment config changes without explicit approval.
- Do not modify `vite.config.ts`, `tsconfig*.json`, or deploy scripts without explicit approval.

---

## Done checklist

- Routes are registered in `App.tsx`.
- Page owns network request and writes to Zustand.
- Components remain presentational.
- Types match backend DTO/response shape.
- MUI theme is used for colors, spacing, and typography.
- `npm run lint -w customer-onboarding` passes or any blocker is reported.
- `npm run build -w customer-onboarding` passes before considering the change complete.
- Backend onboarding docs/routes are updated if the API contract changed.
