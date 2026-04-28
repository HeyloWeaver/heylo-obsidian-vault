---
type: command
tags: [backend, commands, claude, code-review]
owner: Mike
updated: 2026-04-27
status: current
command_path: backend/.claude/commands/code-review.md
---
# Command — code-review

Review a pull request or branch for code quality, correctness, and project-specific rules.

**Invoke with:** `/code-review [branch | PR number | PR URL]`

---

## Usage

```
/code-review                        # review current branch vs main
/code-review my-feature-branch      # specific branch
/code-review 142                    # PR number
/code-review https://github.com/... # PR URL
```

---

## What it does

1. Gets the diff via `gh pr diff <number>` (PR) or `git diff main...<branch>` (branch).
2. Reviews for correctness, missing error handling, security concerns, N+1 queries, and consistency with existing patterns.
3. Enforces project-specific rules (see below).
4. Returns findings grouped as **Blockers**, **Warnings**, and **Nits**.

---

## Project-specific rules enforced

| Rule | Detail |
|---|---|
| No `deviceCapability` | Use `deviceType.name` with `DeviceTypeName` enum — `deviceCapability` is deprecated and being removed |
| No bare `throw new Error()` | Use NestJS exceptions (`BadRequestException`, `ForbiddenException`, etc.) for proper HTTP status codes |
| No sensitive data in logs | Log entity IDs only — not physical device IDs, secrets, or credentials |
| Agency auth via `contextSvc` | Use `contextSvc.agencyId` — do not look up user and read `userRoles[0].agencyId` |
| Role changes are restricted | Only admin ↔ support professional transitions allowed; others require delete + recreate |
| Agency changes not allowed | Delete and recreate the user — do not update agency on an existing user |

---
**Up:** [[Backend/Commands/Commands]]
