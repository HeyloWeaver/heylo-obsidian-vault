---
type: skill
tags: [hub, skills, claude, cloudwatch, logs]
owner: Mike
updated: 2026-04-27
status: current
skill_path: hub/.claude/skills/hub-logs/SKILL.md
---
# Skill — hub-logs

Fetch and analyze Hub device logs from AWS CloudWatch to diagnose connectivity, service, and camera issues.

**Invoke with:** `hub-logs` · `check hub logs` · `fetch hub logs`

---

## Arguments

```
hub-logs <agency_id> <hub_id> [hours]
```

| Argument | Required | Default | Example |
|---|---|---|---|
| `agency_id` | yes | — | `e99758ff-7414-491d-bd44-da51b88eddcf` |
| `hub_id` | yes | — | `18d88f6fe24fcfdc4a9582b214622379` |
| `hours` | no | 6 | `24` |

---

## What it does

1. Verifies the CloudWatch log group `/{agency_id}/hub` exists.
2. Lists available log streams for the hub. Known stream suffixes: `-heylo`, `-homeassistant`, `-mosquitto`, `-ssm-agent`, `-cw-agent`.
3. Fetches error/warning events across all streams (errors, disconnects, crashes, timeouts, etc.).
4. Fetches heylo service lifecycle events (starts, connects, reconnects, MQTT bridge).
5. Drills into specific streams based on error type:
   - DNS/network issues → `-cw-agent`, `-ssm-agent`
   - MQTT disconnects → `-mosquitto`, `-heylo`
   - Camera issues → `-heylo` (Reolink/KVS errors)
   - Service crashes → `-heylo`, `-homeassistant`
6. Produces a structured summary.

---

## Output format

**Timeline** — key events in chronological order.

**Issues by category:**
- **Network/DNS** — DNS resolution failures, connectivity drops, timeouts
- **Services** — service restarts, crashes, SSM/CW agent registration failures
- **MQTT/Connectivity** — bridge disconnects, protocol errors (these cause the hub to appear offline)
- **Cameras** — Reolink connectivity issues, KVS stream errors, port unreachable

**Root cause hypothesis** — most likely primary cause.

**Recommendations** — actionable next steps.

---

## When to use

- Hub is offline or not reporting to the platform
- Camera streams dropped or not starting
- Provisioning failed and you need to see the apply/generate steps
- After an OTA update to verify services came up cleanly
- Debugging Mosquitto bridge or Z2M/ZUI container issues

---
**Up:** [[Hub/Skills/Skills]]
