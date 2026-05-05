# Heylo — Claude / Claude Code

This folder is the **Heylo engineering Obsidian vault**: Markdown notes (mostly `_…/` folders) and application code (`frontend/`, `backend/`, `go/`, `tablet/`, `hub/`, `customer-onboarding/`, `inventory/`) live together. Obsidian config is under `.obsidian/`.

**Canonical, detailed guide for any coding agent:** read **`AGENTS.md`** in this same directory (vault layout, Obsidian rules, sub-repo map, how to attach context, local dev).

---

## Agent work flow (short)

1. Open **`_Engineering/Agent Work - Start Here.md`** and use its routing table to choose the region.
2. Open only the **repo-specific Agent Work Guide** for code you will touch (`Frontend`, `Backend`, `Go`, `Tablet`, `Hub`, `Customer Onboarding`, `Inventory`, `Infra`, `CLI`).
3. Use **`_Engineering/Agent Operating Loop.md`** for the orient/explore/plan/edit/verify/report workflow and **`_Engineering/Agent Verification Matrix.md`** for checks.
4. Use **Domain Playbooks** under `_Engineering/<area>/Domain Playbooks.md` when the task is subsystem-specific.

Wikilinks like `[[Frontend/Agent Work Guide]]` in those notes mean `_Engineering/Frontend/Agent Work Guide.md`.

---

## Code map

| Area | Path | Stack |
|------|------|--------|
| Web console | `frontend/` | Next.js 15, React 19, Zustand + Context, Tailwind |
| Core API | `backend/` | NestJS, TypeORM, MySQL |
| AppSync | `go/backend/appsync/` | Go Lambda, GraphQL |
| Resident tablet | `tablet/` | Flutter (Android kiosk) |
| Hub device OS | `hub/` | Yocto, Mender OTA, Raspberry Pi 5 |
| Customer onboarding | `customer-onboarding/` | Vite, React 18, MUI 7, Zustand 5 |
| Inventory tracking | `inventory/` | Vite, React 18, MUI 7, Zustand 5 |
| AWS infrastructure | `heylo-infra/` | Terraform |

Typical local URLs: web `http://localhost:3000`, API `http://localhost:4000`. Hub builds use kas/Docker under `hub/` (see `hub/README.md`), not root `npm run dev`.

---

## Priming a session

Paste or attach: **Start Here**, the relevant **Agent Work Guide**, specific source files, and any ticket or `_Plans/` doc. State cross-stack impact up front (API + UI + Go + tablet + hub + onboarding/inventory when relevant).

Prefer **small, contract-aligned** changes; update **`_Engineering/`** when architecture or contracts shift.

---

## Local dev (npm at vault root)

- `npm install` then `npm run dev` — API + web (loads `.env.dev` + `.env`)
- `npx heylo` / `npm run dev:services` — choose services (`--help` for flags)
- Other targets: `npm run dev:go`, `npm run dev:tablet`, `npm run dev:onboarding`, `npm run dev:inventory`

---

## Key backend coding rules

These rules apply project-wide to `backend/`, including backend inventory controllers/services/entities/migrations; full details in `_Engineering/Backend/Agent Work Guide.md`.

**Database conventions**
- Table names: all lowercase, no separators (e.g. `customeronboarding`, `devicealerttype`).
- Column names: **camelCase** matching the entity property name (`agencyId`, `siteId`, `createdOn`, `isDeleted`, `isMfaEnabled`). A few legacy columns are PascalCase (`DeviceAlertEmails`, `AlertTypeId`) — do not propagate that pattern; new columns are camelCase.
- `@Entity({ name: 'tablename' })` must match the lowercase table name exactly. `@Entity()` with no name is fine when the class name already lowercases to the right table (e.g. `Alert` → `alert`).
- Timestamp columns (`createdOn`, `updatedOn`): set `insert: false, update: false` on the entity — never include `default: () => 'CURRENT_TIMESTAMP'` — the DB manages these.

**Query style — prefer raw SQL**
- Reads: use `repository.manager.query()`, not TypeORM `find`/`findAndCount`/`createQueryBuilder` with relations.
- Pagination: two separate queries (`SELECT …` + `SELECT COUNT(*) AS total`). Avoid `COUNT(*) OVER()`.
- `COUNT()` returns strings — always wrap with `parseInt()`.
- No JS ternaries inside SQL template strings — build the `WHERE` clause imperatively.

**Transactions**
- Wrap any method touching multiple tables in `repository.manager.transaction(async (manager) => { … })` and use `manager` for all ops inside.

**ORM cascade rules**
- Never set `onDelete: 'CASCADE'`, `cascade: true`, or similar on relation decorators. Delete dependents explicitly in the transaction.

**Mutation responses & frontend re-fetch**
- Create/update endpoints return only `{ id: saved.id }`.
- Frontend re-fetches full page data after a successful mutation — no optimistic store updates.

**Enums over literals**
- Always use enum or constant references instead of hardcoded string literals. Create one if it doesn't exist.
