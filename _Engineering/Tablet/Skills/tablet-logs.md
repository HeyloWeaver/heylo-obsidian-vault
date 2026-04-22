---
type: skill
tags: [tablet, skills, claude, logs, cloudwatch]
owner: Mike
updated: 2026-04-22
status: current
skill_path: tablet/.claude/skills/tablet-logs/SKILL.md
---
# Skill — tablet-logs

Fetch and analyze tablet device logs from AWS CloudWatch (`heylo-tablet-logs` log group, `heylo` AWS profile). Log streams are named `{agencyId}/{deviceId}`.

**Invoke with:** `tablet-logs` · `check tablet logs` · `view device logs` · `fetch cloudwatch logs` · `list log streams`

---

## Usage

### List available log streams

```
tablet-logs list [prefix]
```

Runs:
```bash
bash tablet/.claude/skills/tablet-logs/scripts/fetch-logs.sh --list [prefix]
```

Returns the 25 most recent streams (by last event time), optionally filtered by a prefix string (e.g., an agency ID fragment).

### Fetch logs for a device

```
tablet-logs <agencyId/deviceId>
```

Runs:
```bash
bash tablet/.claude/skills/tablet-logs/scripts/fetch-logs.sh <agencyId/deviceId> [--limit N]
```

Returns the most recent log events for that stream (default 200). Accepts optional `--start-time` and `--end-time` in epoch milliseconds.

---

## Timezone handling

Timestamps from the user are in **Eastern Time (America/New_York)**. CloudWatch stores timestamps in UTC epoch milliseconds. The skill converts correctly — when providing times, just say "10 PM" or "March 15 at 2 AM" and the skill handles the UTC conversion.

- EDT (March–November): UTC−4
- EST (November–March): UTC−5

---

## What the skill analyzes

After fetching, Claude analyzes the log output and looks for:

- **Errors and exceptions** — crashes, unhandled errors, stack traces
- **WebSocket issues** — connection failures, disconnects, reconnection loops
- **Voice recognition problems** — `error_language_unavailable`, recognition failures, retry loops
- **Network issues** — timeouts, failed API calls, connectivity drops
- **Patterns** — repeated errors, tight retry loops, state machine issues
- **Timing** — gaps in logs, long operations, event ordering problems

---

## Scripts

Scripts live at `tablet/.claude/skills/tablet-logs/scripts/`.

### `fetch-logs.sh`

Main entry point. Wraps `aws logs` CLI calls against the `heylo` profile.

```bash
# List streams
bash fetch-logs.sh --list [prefix]

# Fetch device logs
bash fetch-logs.sh <agencyId/deviceId> [--limit N] [--start-time MS] [--end-time MS]
```

- Uses `aws logs describe-log-streams` to list and validate streams.
- Uses `aws logs get-log-events` to fetch events.
- When no time range is given, defaults to the last 24 hours of the stream's activity.

### `format-events.py`

Reads the `get-log-events` JSON response from stdin, formats each event as `HH:MM:SS.mmm  <message>` in UTC.

### `format-streams.py`

Reads the `describe-log-streams` JSON response from stdin, formats each stream as a table with stream name and last-event timestamp in UTC.

---

## Notes

- Requires the `heylo` AWS CLI profile to be configured locally with appropriate CloudWatch read permissions.
- Log group: `heylo-tablet-logs`
- Stream naming: `{agencyId}/{deviceId}` — you need at least one of these identifiers to fetch device-specific logs.
- See [[Tablet/Domain - Kiosk]] for context on what events are logged and why.
