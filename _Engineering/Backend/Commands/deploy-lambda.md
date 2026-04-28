---
type: command
tags: [backend, commands, claude, lambda, deploy]
owner: Mike
updated: 2026-04-27
status: current
command_path: backend/.claude/commands/deploy-lambda.md
---
# Command — deploy-lambda

Deploy a lambda function to dev or prod.

**Invoke with:** `/deploy-lambda <lambda-name> <env>`

---

## Usage

```
/deploy-lambda camera-pinger dev
/deploy-lambda event-processor prod
/deploy-lambda device-checker dev
/deploy-lambda daily-camera-registry prod
```

---

## What it does

1. Reads the env file (`src/config/development.env` or `src/config/production.env`) to extract DB credentials and AWS config.
2. Selects the AWS profile: `heylo-dev` (dev) or `heylo` (prod).
3. Finds and runs the matching deploy script under `scripts/`:

| Lambda | Script |
|---|---|
| `camera-pinger` | `scripts/deploy-camera-pinger.sh` |
| `event-processor` | `scripts/deploy-event-processor.sh` (dev) / `deploy-event-processor-prod.sh` (prod) |
| `device-checker` | `scripts/deploy-lambda-standalone.sh device-checker` |
| `daily-camera-registry` | `scripts/deploy-daily-camera-registry.sh` |
| Other | Check `scripts/deploy-*.sh` or `scripts/deploy-*.js` |

4. Runs the script via `env` to inject credentials without polluting the shell.

---

## Notes

- **Always confirms before deploying to prod.**
- The env file uses `DB_PASS`; deploy scripts expect `DB_PASSWORD` — the command handles this mapping.
- DB password may contain special characters (`|`, `[`, `>`) — the command quotes it with single quotes.
- If a script fails with `--no-cli-pager` errors, that flag is incompatible with AWS CLI v1 and should be removed from the script.

---
**Up:** [[Backend/Commands/Commands]]
