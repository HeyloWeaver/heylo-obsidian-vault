---
type: guide
tags: [customer-support, frontend, agents]
owner: Mike
updated: 2026-05-07
status: draft
---
# Customer Support - Agent Work Guide

> **Status: boilerplate.** This guide is a placeholder for the new `customer-support/` repo. Specifics (routes, domains, contracts, deploy targets) are still being decided — treat anything below as a starting shape, not policy.

This guide is for agents making changes in `customer-support/`.

Use with [[Agent Operating Loop]], [[Agent Verification Matrix]], and [[Backend/Agent Work Guide]] if/when the change touches a backend support API.

---

## What this app owns

- Internal customer support tooling (scope TBD).
- React 18 + TypeScript + Vite application shell.
- MUI 7 UI, React Router 7 routing, Zustand 5 state.
- Backend counterpart: TBD.

---

## High-signal files to read first

- `customer-support/package.json` - confirm current dependencies and scripts.
- `customer-support/src/` - app source (structure still being established).
- `customer-support/vite.config.ts` - Vite config.
- `customer-support/tsconfig*.json` - TS project setup.

When the repo's conventions are settled, mirror the layout the other Vite apps use:

- `src/App.tsx` for routes and top-level providers.
- `src/pages/` for page-level data loading.
- `src/components/` for presentational/shared components.
- `src/store/` for Zustand stores.
- `src/types/` for TypeScript type definitions.
- `src/theme.ts` for the MUI theme.

---

## Coding standards (defaults — confirm before relying)

- Use MUI components and a single shared theme; do not introduce Tailwind, Bootstrap, or one-off styling systems.
- Use Zustand for state. One store per domain concern.
- Network requests originate from page components. Stores and presentational components do not fetch.
- Use named exports for components and stores. `App.tsx` is the one default-export exception.
- Do not use `any` or `@ts-ignore`.
- Do not add dependencies, env vars, or deployment config changes without explicit approval.
- Do not modify `vite.config.ts`, `tsconfig*.json`, or deploy scripts without explicit approval.

---

## Done checklist

- Routes/components/stores/types are aligned.
- `npm run lint` (in `customer-support/`) passes or any blocker is reported.
- `npm run build` (in `customer-support/`) passes before considering the change complete.
- Backend docs/routes are updated if any API contract changed.

---

## Local dev

- From the vault root: `npm run dev:support` (loads `.env.dev` + `.env` and runs Vite in `customer-support/`).
- Or via the CLI launcher: `npx heylo support` (or pick `support` from the interactive picker; combine with other services like `npx heylo api support`).
- Or directly: `npm run dev -w customer-support`.

Default Vite port is 5175 (auto-bumps if taken).

## Open questions

- Auth model, deploy target, and backend contract are still TBD.
