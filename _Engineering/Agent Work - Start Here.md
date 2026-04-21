# Agent Work - Start Here

This is the fast handoff page for future agents working in Heylo.

Use this page first, then jump to the repo-specific guide:

- Frontend: `_Engineering/Frontend/Agent Work Guide.md`
- Backend: `_Engineering/Backend/Agent Work Guide.md`
- Go: `_Engineering/Go/Agent Work Guide.md`

---

## How to orient quickly

1. Read `README.md` at vault root for the code + docs model.
2. Read the repo-specific high-level overview:
   - `_Engineering/Frontend/High Level Overview.md`
   - `_Engineering/Backend/High Level Overview.md`
3. Read the repo-specific agent guide above for "change recipes" and gotchas.
4. Confirm active local run targets before changing behavior:
   - frontend usually on `localhost:3000`
   - backend usually on `localhost:4000`
   - Go/AppSync resolver is separate from the Nest API

---

## Ground rules for safer changes

- Make the smallest change that fixes the request.
- Keep frontend and backend contracts aligned (DTO fields, enum values, event names).
- If changing auth/roles/routes, update both behavior and docs.
- If changing anything realtime, verify both emitters and consumers.
- Add or update notes in `_Engineering/` when architectural behavior changes.

---

## Cross-repo architecture in one minute

- `frontend/` is Next.js App Router and talks to backend over cookie-authenticated HTTP.
- `backend/` is NestJS + MySQL and handles core API, auth, realtime fanout, and integrations.
- `go/backend/appsync/` is a focused GraphQL resolver Lambda path for heavier reads (currently caseload schedule).
- The same product surface spans all three, so changes often need at least a sanity check in two repos.

---

## Common multi-repo tasks

### Add a new screen with data

1. Add/adjust backend endpoint and DTO.
2. Add/adjust frontend service method.
3. Wire page/component UI.
4. Validate role gating in middleware/sidebar.
5. Update docs in the relevant `_Engineering/*` note.

### Add or change a realtime event

1. Backend: emit a clear event shape.
2. Frontend: ensure `SocketProvider` and `EventHub` path handles it.
3. Verify toast/audio/notification behavior does not regress.
4. Document event contract changes in `_Engineering/Backend/` and `_Engineering/Frontend/`.

### Move a read path to GraphQL/AppSync

1. Define/extend GraphQL schema in `go/backend/appsync/schema.graphql`.
2. Implement resolver/query in Go `platformdb` + handler switch.
3. Replace fixture/REST usage in frontend service with the new path.
4. Keep fallback behavior explicit while migrating.

