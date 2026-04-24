# Heylo — Claude / Claude Code

This folder is the **Heylo engineering Obsidian vault**: Markdown notes (mostly `_…/` folders) and application code (`frontend/`, `backend/`, `go/`, `tablet/`, `hub/`) live together. Obsidian config is under `.obsidian/`.

**Canonical, detailed guide for any coding agent:** read **`AGENTS.md`** in this same directory (vault layout, Obsidian rules, sub-repo map, how to attach context, local dev).

---

## Agent work flow (short)

1. Open **`_Engineering/Agent Work - Start Here.md`**.
2. Open the **`_Engineering/<Frontend|Backend|Go|Tablet|Hub>/Agent Work Guide.md`** that matches the code you will touch.
3. Use **Domain Playbooks** under `_Engineering/<area>/Domain Playbooks.md` when the task is subsystem-specific.

Wikilinks like `[[Frontend/Agent Work Guide]]` in those notes mean `_Engineering/Frontend/Agent Work Guide.md`.

---

## Code map

| Area | Path | Stack |
|------|------|--------|
| Web console | `frontend/` | Next.js App Router |
| Core API | `backend/` | NestJS, TypeORM, MySQL |
| AppSync | `go/backend/appsync/` | Go Lambda, GraphQL |
| Resident tablet | `tablet/` | Flutter (Android kiosk) |
| Hub device OS | `hub/` | Yocto, Mender OTA, Raspberry Pi 5 |

Typical local URLs: web `http://localhost:3000`, API `http://localhost:4000`. Hub builds use kas/Docker under `hub/` (see `hub/README.md`), not root `npm run dev`.

---

## Priming a session

Paste or attach: the relevant **Agent Work Guide**, **specific source files**, and any **ticket or `_Plans/`** doc. State cross-stack impact up front (API + UI + Go + tablet + hub when relevant).

Prefer **small, contract-aligned** changes; update **`_Engineering/`** when architecture or contracts shift.

---

## Local dev (npm at vault root)

- `npm install` then `npm run dev` — API + web (loads `.env`)
- `npx heylo` / `npm run dev:services` — choose services (`--help` for flags)
