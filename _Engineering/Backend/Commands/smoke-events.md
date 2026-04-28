---
type: command
tags: [backend, commands, claude, cloudwatch, devices, smoke]
owner: Mike
updated: 2026-04-27
status: current
command_path: backend/.claude/commands/smoke-events.md
---
# Command — smoke-events

Query smoke detector / CO alarm events from the device ingestion CloudWatch logs.

**Invoke with:** `/smoke-events [search term] [env] [time range]`

---

## Usage

```
/smoke-events                        # last 24h, prod
/smoke-events node-id-123            # filter by node ID
/smoke-events "Building A" 7d        # site fragment, last 7 days
/smoke-events dev 1h                 # dev environment, last hour
```

Arguments are optional and positional — pass a search term (node ID, device name, site fragment), environment (`dev`/`prod`), and/or time range (`1h`, `24h`, `7d`, or a specific time like `1:30am eastern`).

---

## What it does

1. Reads `.aws-resources.json` in `backend/` for the target log group, profile, and region.
2. Runs a CloudWatch Logs Insights query against `Device_ingestion_logs` filtered for `Smoke_Alarm`, `co_alarm`, and `CO_Alarm` events.
3. Returns a summary table with: timestamp (Eastern Time), node ID, event type, value and its meaning.

### Smoke alarm value reference

| Value | Meaning |
|---|---|
| 0 | Idle |
| 1 | Smoke detected |
| 2 | Smoke detected (unknown location) |
| 3 | Smoke alarm test |
| 6 | Alarm silenced |

---

## Important: log format limitation

`Device_ingestion_logs` captures **payload only** — the IoT topic (which contains the hub physical device ID) is not logged. Hub IDs cannot be searched. Search by node ID, device name, or other payload identifiers instead.

---
**Up:** [[Backend/Commands/Commands]]
