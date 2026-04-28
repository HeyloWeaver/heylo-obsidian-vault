---
type: command
tags: [hub, commands, claude, mqtt, debugging]
owner: Mike
updated: 2026-04-27
status: current
command_path: hub/.claude/commands/hub-mqtt.md
---
# Command — hub-mqtt

MQTT quick reference for debugging hub topics from the CLI using Mosquitto.

**Invoke with:** `/hub-mqtt`

This command loads the MQTT topic reference into context — useful when debugging hub connectivity, cameras, or Zigbee from an SSH session on the hub.

---

## Topics

### Camera Registry

```bash
# Subscribe to camera list response (run first)
mosquitto_sub -t cameras/list/resp | jq .

# Request camera list (no wake — skips sleeping battery cams)
mosquitto_pub -t cameras/list/get -m ""

# Request camera list (wakes battery cams first)
mosquitto_pub -t cameras/list/get/wake -m ""
```

Response: JSON on `cameras/list/resp` with `cameras[]`, `count`, `time`, `reolink_hub_online`.

---

### Stream Control

```bash
mosquitto_sub -t stream/control/resp | jq .
mosquitto_pub -t stream/control/set -m '{"enable":true,"rtsp_url":"rtsp://...","stream_name":"my_cam","codec":"h264"}'
mosquitto_pub -t stream/control/set -m '{"enable":false,"rtsp_url":"rtsp://..."}'
```

---

### SSM Registration

```bash
mosquitto_sub -t ssm/resp | jq .
mosquitto_pub -t ssm/get -m ""
```

Returns contents of `/var/lib/amazon/ssm/registration` (ManagedInstanceID, Region).

---

### Hub Client Status

```bash
mosquitto_sub -t hub-client/status | jq .
```

Payload: `{"status":"online"|"offline","time":<epoch_ms>}` (retained topic).

---

### Zigbee Permit Join

```bash
mosquitto_pub -t zigbee/permit_join/set -m '{"enable":true,"duration":120}'
mosquitto_pub -t zigbee/permit_join/set -m '{"enable":false}'
```

---

### Doorbell Talk-Back

```bash
mosquitto_sub -t doorbell/talk/resp | jq .
mosquitto_pub -t doorbell/talk/send -m '{"audio_base64":"...","rtsp_url":"rtsp://...","stream_name":"doorbell"}'
```

---

## Key source files

- `meta-heylo/recipes-heylo/heylo-ha/files/cameras_registry_responder.yaml` — HA automation for `cameras/list/get`
- `meta-heylo/recipes-heylo/heylo-utils/files/heylo-mqtt-client.py` — MQTT client dispatcher

---
**Up:** [[Hub/Commands/Commands]]
