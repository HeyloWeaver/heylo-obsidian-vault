---
type: proposal
tags:
  - engineering
  - go
  - typescript
  - appsync
  - decision
owner: Mike
updated: 2026-04-22
status: current
related:
  - "[[Go/Agent Work Guide]]"
  - "[[Go AppSync to Bun TypeScript Port]]"
---

# AppSync: TypeScript over Go

We just finished a line-for-line TypeScript/Bun port of the Go AppSync service (`appsync/`). The two implementations are functionally identical — same SQL, same auth logic, same FNV-32a color hashing, same timezone bucketing, same GraphQL schema. The TS version passes the same test cases as the Go version. That puts us in a good position to compare them honestly.

---

## The core argument

Go is not pulling its weight here. The service is a thin resolver: validate a JWT claim, run two SQL queries, bucket rows by timezone-aware date, return JSON. None of that requires a compiled, statically-typed systems language. The complexity is in the **business logic** (timezone edge cases, FNV hash, role-gating), not the infrastructure — and TypeScript handles that equally well.

Meanwhile, Go imposes real ongoing costs on a team that writes TypeScript everywhere else.

---

## Developer experience

| | Go | TypeScript/Bun |
|---|---|---|
| Language the team already writes | No | Yes |
| Onboarding a new engineer | Learn Go toolchain, module system, build tags, ldflags | Open the repo and go |
| Local dev startup | `go build -tags local -ldflags ...` + overlay file generation | `bun run dev` |
| Hot reload | Manual kill-and-restart via `appsync-local-dev.mjs` | `bun run --hot` |
| IDE support across the whole codebase | Split: Go tools for this file, TS tools everywhere else | Unified |
| Adding a second resolver | Write Go, context-switch, different error patterns | Same patterns as NestJS backend |

The Go local dev wrapper (`appsync-local-dev.mjs`) is a ~130-line Node script that exists purely to paper over the Go toolchain from a JS monorepo. That wrapper goes away entirely with the TS version.

---

## Operational complexity

The Go service requires a **separate build pipeline**: CodeBuild compiles to a `bootstrap` binary, bakes env vars via `-ldflags -X`, zips, and deploys. The TS version uses `bun build --compile` and produces the same zip artifact with a one-line script — no `-ldflags`, no overlay files, no build tags.

The Go service also requires the team to maintain:
- `buildspec.yml` (AWS CodeBuild config)
- `.devgen/overlay.json` + `main.overlay.go` (tooling shim)
- `appsync-local-dev.mjs` (dev runner wrapper)
- A separate Go module (`go.mod`, `go.sum`, Go version pinning)

The TS version replaces all of that with one `package.json`.

---

## Risk comparison

**Go risks:**
- No other Go in the codebase — a Go bug or security issue requires someone to context-switch entirely.
- Go version upgrades are isolated; easy to fall behind.
- The Lambda cold start for a compiled Go binary is fast, but the TS/Bun compiled binary is comparable — both are single-executable deploys, not interpreted.

**TS/Bun risks:**
- Bun on Lambda requires the custom `provided.al2` runtime (same as the Go binary today — both ship a `bootstrap` executable). No regression there.
- `mysql2` is a mature, widely-used driver. The Go driver (`go-sql-driver/mysql`) is not more proven at our scale.
- Timezone handling via `Intl` is well-tested in modern runtimes (Node 16+, Bun). We ported all Go timezone edge-case tests and they pass.

---

## What the port revealed

The Go service is **92 lines of business logic** (`getcaseloadschedule.go`) plus plumbing. The TypeScript port is comparable in size. There was no Go-specific feature that required Go — no goroutines, no channels, no cgo, no memory management. The service is I/O-bound (two DB queries) so Go's concurrency model offers nothing here that `async/await` doesn't.

The only nuance in the entire port was FNV-32a hashing: JavaScript's bitwise ops are signed 32-bit, so we needed `Math.imul(hash, prime) >>> 0` to match Go's `uint32` overflow. One line. The pinned hash tests verify parity.

---

## The monorepo argument

Every other service — `frontend` (Next.js), `backend` (NestJS), `tablet` (React Native) — is TypeScript. Shared types, shared utilities, and eventually shared packages become possible when AppSync moves to TS. Right now the Go service is an island: its types can't be imported anywhere, its DB models can't be shared with the NestJS backend, its errors can't be caught by shared middleware.

Moving to TS doesn't immediately unlock all of that, but it removes the wall that makes it impossible.

---

## Performance

The most common objection is "Go is faster." That's true in general. It does not apply here.

### Latency

**This service is I/O-bound.** It validates a JWT claim and runs two SQL queries. CPU time — JSON parsing, the FNV hash, sorting a slice of rows — is 1–2ms. The rest is waiting on MySQL.

For a warm invocation, the breakdown is:

| Phase | Go | Bun | Difference |
|---|---|---|---|
| JSON parse + route | ~0.2ms | ~0.5ms | 0.3ms |
| MySQL queries × 2 | 5–50ms | 5–50ms | 0ms |
| JSON serialize | ~0.1ms | ~0.3ms | 0.2ms |
| **Total** | **5–50ms** | **5–50ms** | **<1ms** |

The runtime contributes less than 1ms to a response dominated by 5–50ms of database I/O. That difference is not user-visible at any scale.

**Lambda's concurrency model makes this even more irrelevant.** Each Lambda instance handles exactly one request at a time — Go's goroutine scheduler, which shines when a single process juggles thousands of concurrent requests, never comes into play. Concurrency is handled by Lambda spinning up more instances. Both runtimes perform identically under load.

**Cold start is the one real gap:**

| | Go | Bun |
|---|---|---|
| Binary size | ~8 MB | ~35 MB |
| Cold start | ~50–80ms | ~150–250ms |
| Warm invocation overhead | <1ms | <5ms |

Cold starts are real — Go initializes faster. But a Lambda behind a live product stays warm. Cold starts happen on first deploy, after 15+ minutes of zero traffic, or during a burst scale-out. For a scheduling tool used by staff during business hours, this is rarely user-visible, and never more than a one-time 200ms delay on first load.

**When Go's speed would actually matter:** compute-heavy workloads — bulk data transformation, cryptography, tight loops over large datasets. For a resolver that joins four tables and groups rows by timezone, the language is irrelevant to performance.

### Cost

Lambda is billed per GB-second. The only cost difference between Go and Bun is memory: Go sits around 30–50MB resident; Bun around 80–120MB. In the worst case, Go fits in a 128MB Lambda setting and Bun needs 256MB.

For a caseload scheduling tool, a realistic usage ceiling is 10 page loads per user per workday, 20 workdays a month:

| Users | Requests/month | Go (128MB) cost | Bun (256MB) cost | Difference |
|---|---|---|---|---|
| 1,000 | 200,000 | free tier | free tier | **$0** |
| 5,000 | 1,000,000 | $3.75 | $7.08 | **$3.33** |
| 10,000 | 2,000,000 | $7.50 | $14.17 | **$6.67** |
| 50,000 | 10,000,000 | $37.50 | $70.83 | **$33.33** |

At 50,000 users making 10 million calls a month — 10× the realistic ceiling — the difference is **$33/month**.

The MySQL instance sized to handle that load costs $200–500/month on its own. The Lambda memory delta is noise on top of the actual infrastructure spend.

**Neither latency nor cost makes Go the right choice for this service.** The gap exists on paper; it does not exist in production.

---

## Recommendation

Ship the `appsync/` TypeScript service. Run both in parallel for one release cycle against the same DB, diff the responses, then decommission the Go service. The Go code stays in the repo under `go/` until we're confident — no flag day.

The ongoing cost of maintaining a Go island in a TypeScript monorepo is not justified by any performance, safety, or capability advantage for a service of this size and shape.
