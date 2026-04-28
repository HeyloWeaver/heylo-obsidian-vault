---
type: command
tags: [backend, commands, claude, cloudwatch, cameras]
owner: Mike
updated: 2026-04-27
status: current
command_path: backend/.claude/commands/camera-registry.md
---
# Command — camera-registry

Query camera registry events from the device ingestion CloudWatch logs.

**Invoke with:** `/camera-registry <search term> [env] [time range]`

---

## Usage

```
/camera-registry "Front Entrance"         # camera device_name or friendly_name
/camera-registry abc123def 7d             # Reolink device_id hash
/camera-registry "Building B" dev 1h     # site fragment, dev env
```

Defaults: prod environment, last 24 hours.

---

## What it does

1. Reads `.aws-resources.json` for the target log group, profile, and region.
2. Queries `Device_ingestion_logs` filtered for `cameras` events matching the search term.
3. Parses each result's JSON payload (`{"payload": {"cameras": [...], "count": N, "reolink_hub_online": bool, "time": epoch}}`).
4. Returns a summary table per camera: name, `device_id`, `friendly_name`, `found_by_reolink`, `reolink_online`, `battery_level`, `sleep_status`.
5. Notes changes between events if multiple results are returned.

---

## Important: log format limitation

`Device_ingestion_logs` captures **payload only** — hub physical device IDs are not logged. If you only have a hub ID, ask for a camera `device_id` or `device_name` from that hub's registry, or query the database to find camera physical device IDs for the hub.

---
**Up:** [[Backend/Commands/Commands]]
