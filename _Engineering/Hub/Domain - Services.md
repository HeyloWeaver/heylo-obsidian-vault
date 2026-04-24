---
type: playbook
tags: [hub, services, mqtt, homeassistant, zigbee, zwave, cameras, domains]
owner: Mike
updated: 2026-04-23
status: current
---
# Hub — Domain: Services

Covers the on-device services: Mosquitto, Home Assistant, Zigbee2MQTT, Z-Wave JS UI, go2rtc, CloudWatch, and SSM.

---

## Service dependency order

```
provision.env present
  └── heylo-provision-apply (materializes certs)
        └── mosquitto (MQTT broker + AWS bridge)
              └── heylo-mqtt-client (platform command handler)
        └── heylo-cw (CloudWatch — fetches config from SSM)
        └── heylo-ha (Home Assistant container)
              └── zigbee2mqtt (Z2M container)
              └── zwave-js-ui (ZUI container)
        └── go2rtc (camera streaming)
```

All services that require provisioning gate on a systemd condition checking for `/data/provision/provision.env`.

---

## Mosquitto (MQTT broker)

**Recipe:** `hub/meta-heylo/recipes-heylo/heylo-mosquitto/`

- Runs natively as `mosquitto.service`.
- Config is rendered at service start by `heylo-mosquitto-render.sh` from templates in `/etc/mosquitto/conf.d/`.
- Key config fragments:
  - `00-heylo-gating.conf` — gates on provisioning complete.
  - `10-heylo-env-and-certs.conf` — loads `provision.env` and cert paths.
  - `mosquitto-bridge-aws.conf.tmpl` — AWS IoT bridge template (rendered with device endpoint + certs).
  - `mosquitto-logging.conf` — log level and output.
- Bridge connects to the AWS IoT endpoint from `provision.env` using the device cert.
- Local services publish/subscribe on `localhost:1883` (no TLS for local); bridge handles TLS to AWS.

**Debugging:** `journalctl -u mosquitto` — look for `Connected to` / `Disconnected from`.

---

## heylo-mqtt-client

**Recipe:** `hub/meta-heylo/recipes-heylo/heylo-utils/` (service files + Python daemon)

- Long-running Python service (`heylo-mqtt-client.service`).
- Subscribes to platform MQTT topics; dispatches commands to local services.
- Handles: camera discovery triggers, health check requests, stream start/stop, device state queries.
- Source: `hub/heylo-utils/` — `heylo-mqtt-client` CLI + private helpers for each domain.

**Debugging:** `journalctl -u heylo-mqtt-client`; or run `heylo-mqtt-client` manually on the device.

---

## Home Assistant

**Recipe:** `hub/meta-heylo/recipes-heylo/heylo-ha/`

- Runs as a systemd-nspawn container; persistent state in `/data/homeassistant/`.
- Seed config applied on first boot (empty `/data/homeassistant/`):
  - `seed-configuration.yaml` — core HA config.
  - `seed-core.config_entries.json` — integration entries (ONVIF, MQTT, etc.).
  - `cameras_registry_responder.yaml` — automation responding to camera registry MQTT messages.
  - `devices_registry_responder.yaml` — automation responding to device registry MQTT messages.
  - `onvif_to_mqtt_bridge.yaml` — blueprint bridging ONVIF events to MQTT.
- `heylo-ha-render.sh` templates any HA config that needs device-specific values.
- HA communicates with Mosquitto locally over MQTT.

**To re-apply seed config to a live device:** stop HA container, clear `/data/homeassistant/`, restart — this wipes all HA state.

**Debugging:** `journalctl -u heylo-ha`; or `systemd-run --machine homeassistant journalctl` inside the container.

---

## Zigbee2MQTT

**Recipe:** `hub/meta-heylo/recipes-heylo/heylo-z2m/`

- Runs as a Podman quadlet container (`zigbee2mqtt.container`).
- Config rendered by `heylo-z2m-render.sh` from `configuration.defaults.yaml`.
- Connects to Mosquitto locally and to the USB Zigbee adapter (CH341/CP210x/CDC-ACM/FTDI/PL2303 drivers included in the image).
- Persistent state in `/data/z2m/`.

**Common issues:**
- USB adapter not found: check `ls /dev/ttyUSB*` or `ls /dev/ttyACM*`; verify the kernel module loaded (`lsmod | grep ch341`).
- Z2M fails to start: check `journalctl -u zigbee2mqtt` and verify `/data/z2m/configuration.yaml` has the correct serial device path.

---

## Z-Wave JS UI

**Recipe:** `hub/meta-heylo/recipes-heylo/heylo-zui/`

- Runs as a Podman quadlet container (`zwave-js-ui.container`).
- Config rendered by `heylo-zui-render.sh` from `settings.json`.
- Connects to Mosquitto locally and to the USB Z-Wave adapter.
- Persistent state in `/data/zui/`.
- `_zui_helper.py` and `_get_zwave_last_seen.py` in heylo-utils support querying Z-Wave device state over MQTT.

---

## go2rtc (camera streaming)

**Recipe:** `hub/meta-heylo/recipes-heylo/go2rtc/`

- Runs natively as `go2rtc.service`.
- Config at `/etc/go2rtc.yaml`; handles RTSP, ONVIF, and Reolink sources.
- Camera streams are discovered via `_discover_reolink.py` / `_get_reolink_channels.py` and ONVIF helpers.
- `_aws_kvs_stream.py` sends camera streams to AWS Kinesis Video Streams (KVS).
- `_get_video_codec.py` detects codec before streaming.
- `_stream_manager.py` orchestrates multi-camera streaming sessions.

**To add a new camera source type:** update `_discover_reolink.py` or add a new discovery helper, then update `_stream_manager.py` and `go2rtc.yaml` template.

---

## CloudWatch Agent

**Recipe:** `hub/meta-heylo/recipes-heylo/heylo-cw/`

- Systemd overrides: `00-heylo-gating.conf` (gates on provisioning), `10-heylo-exec-override.conf`.
- `prestart-cw.sh`: fetches the CW agent config from AWS SSM Parameter Store and injects the Hub ID before the agent starts.
- Log groups are device-specific; use the `hub-logs` skill to query them — see [[Hub/Skills/hub-logs]].

---

## SSM Agent

**Recipe:** `hub/meta-heylo/recipes-heylo/heylo-ssm/`

- `setup-ssm.sh` runs as part of provisioning apply to register the device with AWS Systems Manager.
- Enables remote session access and parameter store reads from the device.
- CloudWatch agent fetches its runtime config from SSM at start.

---

**Up:** [[Hub/Domain Playbooks]] · [[Hub/Agent Work Guide]]
