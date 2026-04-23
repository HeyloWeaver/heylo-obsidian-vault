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

## Recommendation

Ship the `appsync/` TypeScript service. Run both in parallel for one release cycle against the same DB, diff the responses, then decommission the Go service. The Go code stays in the repo under `go/` until we're confident — no flag day.

The ongoing cost of maintaining a Go island in a TypeScript monorepo is not justified by any performance, safety, or capability advantage for a service of this size and shape.
