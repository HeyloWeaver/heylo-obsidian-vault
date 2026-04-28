---
type: command
tags: [backend, commands, claude, reporting]
owner: Mike
updated: 2026-04-27
status: current
command_path: backend/.claude/commands/weekly-update.md
---
# Command — weekly-update

Generate a weekly summary of work across all Heylo repos since a given date.

**Invoke with:** `/weekly-update [start date]`

---

## Usage

```
/weekly-update                  # defaults to most recent Thursday
/weekly-update 2026-04-21       # ISO date
/weekly-update last-thursday
/weekly-update 7d
```

---

## What it does

1. Resolves the start date (defaults to the most recent Thursday).
2. For each repo, collects merged-to-main commits since the start date and in-progress branches with recent activity.
3. Summarizes each commit/PR in one sentence — not raw commit messages, but *what it enables*.
4. Groups output by repo → **Merged to Main** / **In Progress**.
5. Adds a top-level **Summary** with 3–5 major themes.
6. Saves the output to a `weekly-update-<date>.md` file.

## Repos covered

- `backend` — NestJS API
- `frontend` — Web console
- `heylo-tablet` — Android tablet app
- `hub` — Hub firmware
- `heylo-infra` — Azure DevOps / infra-as-code
- `customer-onboarding` — Onboarding frontend
- `customer-support` — Support app

---

## Notes

- Branch ownership is typically encoded in the branch name (`cbaron/…` → Chris, `ritwik/…` → Ritwik, `akshayp/…` → Akshay).
- `heylo-infra` uses Azure DevOps — commit messages start with `Merged PR <number>:`.
- **Repo paths are hardcoded** in the command to the machine where it was authored. If running on a different machine, update the paths in `backend/.claude/commands/weekly-update.md`.

---
**Up:** [[Backend/Commands/Commands]]
