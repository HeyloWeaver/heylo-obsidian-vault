---
type: reference
tags: [hub, skills, claude, cloudwatch, logs]
owner: Mike
updated: 2026-04-23
status: current
---
# Skill: hub-logs

Fetches and analyzes Hub device logs from AWS CloudWatch to diagnose connectivity, service, and camera issues.

**Location:** `hub/.claude/skills/hub-logs/SKILL.md`

**Invocation:** `/hub-logs` in Claude Code (or via the skill runner)

## What it does

- Takes a Hub ID as input
- Queries CloudWatch log groups for the specified device
- Surfaces relevant errors, warnings, and service lifecycle events
- Helps diagnose: MQTT disconnects, provisioning failures, HA container health, camera stream issues, OTA failures

## When to use

- Hub is offline or not reporting to the platform
- Camera streams dropped or not starting
- Provisioning failed and you need to see the apply/generate steps
- After an OTA update to verify services came up cleanly
- Debugging Mosquitto bridge or Z2M/ZUI container issues

---
**Up:** [[Hub/Skills/Skills]]
