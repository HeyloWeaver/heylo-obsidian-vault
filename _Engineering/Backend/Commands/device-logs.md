---
type: command
tags: [backend, commands, claude, cloudwatch, devices]
owner: Mike
updated: 2026-04-27
status: current
command_path: backend/.claude/commands/device-logs.md
---
# Command — device-logs

Search the device ingestion CloudWatch logs for any device event by payload identifier.

**Invoke with:** `/device-logs <search term> [env] [time range] [limit]`

---

## Usage

```
/device-logs 0x282c02bfffeac1b8              # Zigbee IEEE address
/device-logs "Front Door" 7d                 # device name, last 7 days
/device-logs camera-abc123 dev 1h            # camera device_id, dev, last hour
/device-logs Smoke_Alarm prod 24h 50         # event type, 50 results
```

Defaults: prod environment, last 24 hours, 20 results.

---

## What it does

1. Reads `.aws-resources.json` for the target log group, profile, and region.
2. Runs a CloudWatch Logs Insights query filtered by the search term.
3. Parses and presents results with key fields per event type:
   - **Zigbee**: action, battery, link quality, contact, occupancy
   - **Camera**: camera list with online status, battery levels
   - **Smoke/CO**: alarm type, state value, node ID
   - **Device status**: status, battery, metadata
4. Summarizes patterns if multiple events are returned.

---

## Common search patterns

| Device type | Search by |
|---|---|
| Zigbee device | IEEE address (`0x282c02bfffeac1b8`) |
| Camera | Reolink `device_id` hash or `device_name` |
| Smoke detector | `Smoke_Alarm`, `co_alarm`, or node ID |
| Any device | Any unique string in the payload |

---

## Important: log format limitation

`Device_ingestion_logs` captures **payload only** — hub physical device IDs are not in the payload and cannot be searched. Search by any identifier from inside the payload instead.

---
**Up:** [[Backend/Commands/Commands]]
