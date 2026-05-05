---
type: guide
tags: [engineering, agents, workflow]
owner: Mike
updated: 2026-05-05
status: current
---
# Agent Operating Loop

This is the default loop for coding agents in the Heylo vault. Use it after [[Agent Work - Start Here]] routes you to the right repo-specific guide.

The goal is not to preload the whole vault. The goal is to gather just enough context, make the smallest coherent change, and prove it with the narrowest useful checks.

---

## 1. Orient

1. Read `AGENTS.md` at the vault root.
2. Read [[Agent Work - Start Here]].
3. Start with the repo-specific guide for the primary surface; read additional guides when the task spans repos or contracts:
   - [[Frontend/Agent Work Guide]]
   - [[Backend/Agent Work Guide]]
   - [[Go/Agent Work Guide]]
   - [[Tablet/Agent Work Guide]]
   - [[Hub/Agent Work Guide]]
   - [[Customer Onboarding/Agent Work Guide]]
   - [[Inventory/Agent Work Guide]]
   - [[Infra/Agent Work Guide]]
   - [[CLI/Agent Work Guide]]
4. Open the concrete source files named by the task or by the guide.

Prefer current code over old notes when they disagree. Then update the stale note if the behavior changed or the note would mislead the next agent.

---

## 2. Explore

Search before assuming:

- Use `rg` for exact text, symbols, routes, event names, DTOs, and enum values.
- Use semantic/codebase exploration for broad questions like "where is this workflow implemented?"
- For cross-repo contracts, find producer and consumer before editing either side.
- For database work, inspect entity, migration, service query, DTO, and frontend/tablet consumer together.

Stop exploring once you can name:

- the files you will change
- the contract or behavior being changed
- the consumers that must remain aligned
- the command or manual check that will prove the change

---

## 3. Plan

For anything more than a one-file fix, write a short plan before editing:

1. What behavior changes.
2. Which repo(s) and contracts are touched.
3. What verification will run.
4. What docs need updating.

Keep plans small. If a change wants to become a refactor, split it from the requested fix unless the refactor is necessary for correctness.

---

## 4. Edit

Make the smallest coherent change that matches the local patterns:

- Prefer existing helpers, services, DTOs, enums, stores, and UI primitives.
- Do not add dependencies without explicit approval.
- Do not add new conventions beside existing ones.
- Use enums or constants instead of hardcoded discriminated strings.
- Keep generated files, migrations, and codegen outputs in the same change when the source requires them.
- Never revert unrelated user changes in the working tree.

When touching multiple repos, keep the contract names and enum values identical across all consumers.

---

## 5. Verify

Use [[Agent Verification Matrix]] for the repo-specific commands.

Default verification order:

1. Run the narrowest static check for touched files or package.
2. Run targeted tests for the changed behavior.
3. Run a broader build/test only when the touched surface is shared, risky, or lacks narrower coverage.
4. For UI work, verify the route manually in browser when practical.
5. For backend/database work, verify migration direction and tenancy/auth behavior before declaring done.

If a check cannot run because env, services, hardware, or credentials are missing, say so clearly and name the next best check.

---

## 6. Report

Final agent responses should include:

- what changed
- what was verified
- what could not be verified
- any remaining risk or follow-up that is directly relevant

Do not dump every file changed. Mention paths only when they help the human review the work.
