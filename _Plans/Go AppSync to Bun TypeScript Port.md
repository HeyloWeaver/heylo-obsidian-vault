---
status: draft
owner: Mike
created: 2026-04-22
tags:
  - plan
  - go
  - typescript
  - bun
  - appsync
type: plan
updated: 2026-04-22
---

# Go AppSync → Bun/TypeScript Port — Plan

## Goal

Port the Go AppSync microservice (`go/backend/appsync/`) to a Bun TypeScript service that is functionally identical: same GraphQL schema, same authorization model, same timezone-aware date bucketing, same deterministic site colors. The Bun service will run both as an AWS Lambda handler and as a local HTTP dev server, exactly mirroring the Go build-tag strategy.

## Scope

**In scope:**
- `getCaseloadSchedule` query resolver (the only resolver that exists)
- Cognito JWT claim extraction and role-based authorization
- MySQL data access (platformdb queries)
- Timezone-aware date bucketing and sorting logic
- Deterministic FNV-32a site color assignment
- Local HTTP dev server (`/graphql` + `/health`)
- AppSync Lambda handler shape

**Out of scope:**
- Changes to the GraphQL schema or AppSync API config
- New resolvers or mutations
- Migrating the AWS CodeBuild pipeline (buildspec.yml) — a follow-on task once the code is verified

---

## Target File Layout

```
go/backend/appsync-ts/
  package.json              # Bun project, scripts: dev, build, test
  tsconfig.json
  src/
    index.ts                # Lambda entry point (handler export)
    index.local.ts          # Local HTTP dev server (bun run dev)
    handler.ts              # AppSync event dispatch (maps fieldName → resolver)
    resolver/
      getCaseloadSchedule.ts  # Business logic, date bucketing, sorting
    db/
      client.ts             # mysql2 connection pool (3 max / 3 idle)
      queries.ts            # getUserRole, getAgencySchedulesInRange
      models.ts             # DB row types (User, Role, UserRole, Site, ScheduleRow)
    graphql/
      schema.graphql        # Copy of existing schema (single source of truth)
      types.ts              # TypeScript types mirroring the schema
    auth/
      claims.ts             # Cognito JWT claim extraction + validation
    util/
      colors.ts             # FNV-32a hash → 10-color palette
      dates.ts              # Date bucketing, UTC window calc, sorting
      dsn.ts                # MySQL DSN builder from env vars
    errors.ts               # AppSyncError, AppSyncErrorResponse types
  __tests__/
    dates.test.ts           # Timezone boundary tests (mirrors Go test cases)
    colors.test.ts
    getCaseloadSchedule.test.ts
```

---

## Implementation Steps

### 1. Project bootstrap

Create `go/backend/appsync-ts/` with:
- `package.json` — `bun` as runtime, deps: `mysql2`, `aws-lambda` types
- `tsconfig.json` — strict mode, `"module": "NodeNext"`, `"target": "ES2022"`
- `.gitignore` for `node_modules/`, `dist/`

Dev dependency: `@types/aws-lambda` for the Lambda handler type.

No GraphQL server library needed — AppSync calls us directly as a resolver, and the local HTTP server only needs `Bun.serve` to accept raw POST bodies.

### 2. Types and errors (`src/graphql/types.ts`, `src/errors.ts`)

Translate all Go types 1-for-1:

- `ResolverEvent`, `ResolverInfo`, `ResolverIdentity`, `IdentityClaims`
- `GetCaseloadScheduleInput`, `GetCaseloadScheduleOutput`
- `ScheduleDate`, `ScheduleOutput`, `ScheduleSite`, `ScheduleUser`
- DB models: `User`, `Role`, `UserRole`, `Site`, `ScheduleRow`
- `AppSyncError`, `AppSyncErrorResponse`

All `time.Time` fields become `Date` objects internally and serialize to ISO 8601 strings at the boundary.

### 3. MySQL DSN builder (`src/util/dsn.ts`)

Replicate `mysqlDSNFromEnv()` precedence exactly:
1. `APPSYNC_MYSQL_DSN`
2. `MYSQL_DSN`
3. Assemble from `DB_HOST`, `DB_USER`, `DB_NAME`, `DB_PORT` (default 3306), `DB_PASS`
4. Fall back to `root@localhost:3306/heylo`

Redact password for logging.

### 4. Database layer (`src/db/`)

Use `mysql2/promise` for async/await. Pool: `connectionLimit: 3`.

**`queries.ts`** — two functions:

```ts
getUserRole(db, platformUserId: string): Promise<UserRole | null>
getAgencySchedulesInRange(db, agencyId: string, startUtc: Date, endUtc: Date): Promise<ScheduleRow[]>
```

SQL mirrors the Go queries exactly (same joins, same `IsDeleted = 0` filters, same column aliases). Key joins:

`getUserRole`:
```sql
SELECT ur.Id, ur.AgencyId,
       u.Id, u.EmailAddress, u.FirstName, u.LastName,
       u.PhoneNumber, u.ProfilePictureWebUrl, u.IsEmailVerified,
       r.Id, r.Title
FROM userrole ur
JOIN user u ON u.Id = ur.UserId AND u.IsDeleted = 0
JOIN role r ON r.Id = ur.RoleId AND r.IsDeleted = 0
WHERE ur.Id = ? AND ur.IsDeleted = 0
```

`getAgencySchedulesInRange`:
```sql
SELECT cs.Id, cs.CaseloadId, cs.StartDateTime, cs.EndDateTime,
       s.Id, s.Name, s.timezone, s.SitePictureWebUrl,
       u.Id, u.EmailAddress, u.FirstName, u.LastName,
       u.PhoneNumber, u.ProfilePictureWebUrl, u.IsEmailVerified
FROM caseloadschedule cs
JOIN caseload c ON c.Id = cs.CaseloadId AND c.IsDeleted = 0
JOIN caseloadsite cls ON cls.CaseloadId = c.Id AND cls.IsDeleted = 0
JOIN site s ON s.Id = cls.SiteId AND s.IsDeleted = 0
LEFT JOIN user u ON u.Id = cs.UserId AND u.IsDeleted = 0
WHERE c.AgencyId = ?
  AND cs.StartDateTime >= ? AND cs.StartDateTime < ?
  AND cs.IsDeleted = 0
```

Parse `StartDateTime` / `EndDateTime` as UTC `Date` objects (`dateStrings: false`, `timezone: '+00:00'`).

### 5. Cognito claim extraction (`src/auth/claims.ts`)

`extractClaims(identity: ResolverIdentity): IdentityClaims`

For local dev, `parseJwtClaims(token: string)`: split on `.`, take index 1, base64url-decode (handle missing padding), `JSON.parse`. Map `cognito:username` and `custom:*` fields to the typed struct.

### 6. Color assignment (`src/util/colors.ts`)

Port FNV-32a exactly so colors are deterministic and match the Go service:

```ts
const PALETTE = [
  '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F',
  '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC',
];

function fnv32a(s: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;  // unsigned 32-bit
  }
  return hash;
}

export function colorForSite(siteId: string): string {
  return PALETTE[fnv32a(siteId) % PALETTE.length];
}
```

> **Critical:** use `>>> 0` (unsigned right shift) after `Math.imul` to keep the result in the 0–2³²−1 range. JavaScript's bitwise ops are signed 32-bit; the Go version uses `uint32`.

### 7. Date bucketing (`src/util/dates.ts`)

This is the most complex piece. Port `bucketSchedulesByLocalDate()` faithfully:

1. `agencyScheduleFetchUtcWindow(startDate, endDate)` — parse YYYY-MM-DD, subtract 24 h from start, add 24 h to end, return UTC `Date` pair.
2. Group `ScheduleRow[]` by the **site-local calendar date** of `startDateTime`:
   - Use `Intl.DateTimeFormat` with the site's IANA timezone to extract `YYYY-MM-DD`.
   - Only keep rows whose local date falls in `[startDate, endDate]`.
3. Within each date bucket, sort by: `lastName` → `firstName` → `startDateTime` → `siteName` (all ascending, case-insensitive strings).
4. Assign `colorHex` via `colorForSite(site.id)` once per site ID per call.
5. Return `ScheduleDate[]` sorted by `date` ascending.

Node's `Intl` supports IANA timezones natively on Node 16+ / Bun — no external library needed.

```ts
function localDateString(utcDate: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(utcDate); // returns "YYYY-MM-DD" in en-CA locale
}
```

### 8. Resolver (`src/resolver/getCaseloadSchedule.ts`)

```ts
async function getCaseloadSchedule(
  input: GetCaseloadScheduleInput,
  identity: ResolverIdentity,
  db: Pool,
  userRole: UserRole,
): Promise<GetCaseloadScheduleOutput>
```

Flow:
1. Validate `startDate` / `endDate` match `YYYY-MM-DD` regex.
2. Ensure `endDate >= startDate`.
3. Determine `agencyId`: Super Admins must supply it via input; Admins use `userRole.agencyId`.
4. Compute UTC fetch window.
5. `getAgencySchedulesInRange(db, agencyId, startUtc, endUtc)`.
6. `bucketSchedulesByLocalDate(rows, startDate, endDate)`.
7. Return `{ dates }`.

### 9. Handler dispatch (`src/handler.ts`)

Mirrors Go's `handler()`:
1. Validate identity and claims present.
2. Parse `platformUserId`, `platformRoleId`, `platformAgencyId` from claims.
3. `getUserRole(db, platformUserId)` → if null or deleted, return `Unauthorized`.
4. Check role title is `"Administrator"` or `"Super Administrator"` → else `InsufficientAccess`.
5. Dispatch on `event.info.fieldName`:
   - `"getCaseloadSchedule"` → call resolver
   - else → `AppSyncErrorResponse` with type `"FieldWithNoHandler"`
6. Wrap in try/catch → log + return `Unexpected` on any thrown error.

### 10. Lambda entry point (`src/index.ts`)

```ts
import { handler } from './handler';
export { handler };
```

Bun bundles this for Lambda. Initialize the DB pool at module load (same as Go's `init()`).

### 11. Local HTTP dev server (`src/index.local.ts`)

Use `Bun.serve`:

```ts
Bun.serve({
  port: parseInt(process.env.PORT ?? '8080'),
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok\n');
    if (url.pathname === '/graphql' && req.method === 'POST') {
      return handleGraphQL(req);
    }
    return new Response('Not Found', { status: 404 });
  },
});
```

CORS: allow `localhost:*` and `127.0.0.1:*` during development (same rules as Go).

`handleGraphQL`: parse JSON body, extract `Authorization` header, call `parseJwtClaims`, build synthetic `ResolverEvent`, call `handler()`, return JSON.

### 12. Tests (`__tests__/`)

Port the Go test cases in `getcaseloadschedule_test.go`:
- Timezone boundary: UTC midnight schedule appears on correct local date
- Schedules at ±24 h boundary are included / excluded correctly
- Sorting: lastName → firstName → start → site
- Empty range returns `{ dates: [] }`
- FNV color: same site ID always returns same color

Use `bun test` (built-in, no external test runner needed).

---

## Environment Variables

Same as the Go service:

| Variable | Description |
|---|---|
| `APPSYNC_MYSQL_DSN` | Full DSN (highest precedence) |
| `MYSQL_DSN` | Alternative full DSN |
| `DB_HOST` | Host |
| `DB_USER` | User |
| `DB_NAME` | Database name |
| `DB_PORT` | Port (default 3306) |
| `DB_PASS` | Password |
| `APPSYNC_HTTP_ADDR` | Local server address (default `:8080`) |
| `PORT` | Fallback port |
| `APPSYNC_CORS_ORIGIN` | Extra allowed CORS origin (local dev) |
| `ENVIRONMENT` | `"dev"` or `"prod"` (baked at build or via env) |

---

## Dependencies

**Runtime:**
- `mysql2` — MySQL driver with promise API

**Dev / types:**
- `@types/aws-lambda` — Lambda handler types
- `bun-types` — Bun global types

No GraphQL server library (Yoga, Apollo, etc.) — AppSync calls this service directly as a resolver Lambda, not as an HTTP GraphQL server.

---

## Build & Run

```bash
# Local dev (hot reload)
bun run --hot src/index.local.ts

# Run tests
bun test

# Build for Lambda (single file, targeting bun or node runtime)
bun build src/index.ts --target=bun --outfile=dist/bootstrap --compile
```

Lambda packaging: zip `dist/bootstrap` and update the function code the same way `buildspec.yml` does today.

---

## Critical Porting Notes

| Go detail | TypeScript equivalent |
|---|---|
| `time.In(loc)` for TZ conversion | `Intl.DateTimeFormat` with `timeZone` |
| `hash/fnv` uint32 | `Math.imul` + `>>> 0` for unsigned |
| Build tags (`// +build local`) | Separate entry point files, different `bun run` scripts |
| `-ldflags -X` for baked vars | `process.env` at startup; Lambda env vars set in console/buildspec |
| `init()` for DB pool | Module-level `const pool = createPool(...)` |
| `mapstructure` for argument parsing | Plain `as` cast after zod-lite validation or manual check |
| `zap` logger | `console` with structured objects (or `pino` if structured logs needed) |

---

## Risks

- **FNV hash parity** — if the color algorithm diverges from Go, existing clients see different site colors. Write the unit test against known Go outputs before shipping.
- **Timezone edge cases** — `Intl.DateTimeFormat` behavior must match Go's `time.In(loc)` exactly at DST boundaries. The existing Go tests cover these; port them first.
- **mysql2 vs Go driver date parsing** — ensure `mysql2` returns `Date` objects in UTC, not local server time. Set `timezone: '+00:00'` in pool config.
- **Bun Lambda compatibility** — Bun's Lambda support (`bun build --compile`) targets a Bun runtime. If AWS Lambda doesn't support Bun natively in the target region/arch, compile to Node-compatible output instead and use the Node.js 22 runtime.

---

## Milestones

1. **Scaffold** — repo layout, `package.json`, `tsconfig.json`, empty entry points compile.
2. **DB + queries** — `getUserRole` and `getAgencySchedulesInRange` return correct types against local MySQL.
3. **Auth + dispatch** — handler validates claims, loads UserRole, dispatches to resolver stub.
4. **Date utils + colors** — `bucketSchedulesByLocalDate` and `colorForSite` pass all ported Go test cases.
5. **Resolver wired** — end-to-end `getCaseloadSchedule` returns correct JSON from local DB.
6. **Local HTTP server** — `bun run dev` accepts a valid GraphQL POST and returns data.
7. **Lambda build** — `bun build` produces a zip that can be uploaded and invoked via AppSync.
8. **Parity test** — run both Go and Bun services against the same DB and diff responses for identical inputs.
