---
type: overview
tags: [hub, hardware, embedded, yocto, reference]
owner: Mike
updated: 2026-04-23
status: current
---
# Hub — High Level Overview

The Heylo Hub is a custom embedded Linux distribution built with **Yocto Project 5.2 ("Walnascar")** and deployed on **Raspberry Pi 5** hardware. It is the on-premise intelligence hub at each care site — running a local MQTT broker, Home Assistant, Zigbee/Z-Wave bridges, video streaming, and AWS cloud integrations. The `hub/` repo contains the full build system: Yocto layers, BitBake recipes, kas configuration, CI/CD pipeline, and build scripts. It produces two artifacts: a flashable `*.sdimg` for new device provisioning and a `*.mender` OTA update package for in-place upgrades.

---

## 1. Concise architectural overview

### Stack

- **Build system:** Yocto Project 5.2, kas (reproducible build orchestration)
- **Board:** Raspberry Pi 5, ARM64 (`meta-raspberrypi` BSP)
- **Init system:** systemd
- **Rootfs:** Read-only with `tmpfiles.d` overlays for runtime-mutable paths
- **OTA:** Mender client, dual A/B partition scheme
- **Containers:** systemd-nspawn (Home Assistant), Podman quadlets (Zigbee2MQTT, Z-Wave JS UI)
- **Cloud:** AWS IoT (MQTT bridge + fleet provisioning), AWS SSM, AWS CloudWatch, AWS KVS
- **Custom layer:** `meta-heylo` — all Heylo-specific recipes, configs, and services
- **Build env:** WSL2 + Ubuntu 24.04 LTS; CI via AWS CodeBuild

### Partition layout

```
┌──────────────────────────────────┐
│  Partition 1 — Boot (FAT)        │
│  Partition 2 — RootfsA (ext4, RO)│  ← active
│  Partition 3 — RootfsB (ext4, RO)│  ← inactive (OTA target)
│  Partition 4 — Data  (ext4, RW)  │  ← /data — certs, HA data, logs
└──────────────────────────────────┘
```

Mender swaps A/B on OTA; `/data` persists across updates.

### Repo structure

```
hub/
├── kas/
│   ├── base/heylo-base.yml        # Yocto 5.2 layers, repos, distro
│   ├── base/secrets.yml           # Secrets/defaults
│   ├── boards/rpi5.yml            # RPi5 machine config
│   └── products/heylo-os-rpi5.yml # Product overrides (UART, WiFi/BT, DTB)
├── meta-heylo/
│   ├── conf/distro/heylo-os.conf  # Distro version + build settings
│   ├── conf/layer.conf
│   ├── classes/
│   │   └── heylo-rootfs-hooks.bbclass  # File install, permissions, tmpfiles
│   └── recipes-heylo/heylo-*/     # All Heylo-specific BitBake recipes
│       ├── heylo-utils/           # CLI tools + MQTT client service
│       ├── heylo-provision/       # AWS IoT fleet provisioning
│       ├── heylo-ha/              # Home Assistant container
│       ├── heylo-mosquitto/       # MQTT broker
│       ├── heylo-z2m/             # Zigbee2MQTT container
│       ├── heylo-zui/             # Z-Wave JS UI container
│       ├── heylo-cw/              # CloudWatch agent integration
│       ├── heylo-ssm/             # AWS SSM agent
│       ├── heylo-logging/         # Centralized log dirs + logrotate
│       └── go2rtc/                # Video streaming (RTSP/ONVIF/Reolink)
├── heylo-utils/                   # Python CLI source + tests + certs
├── build.sh / clean.sh / export.sh / upload.sh  # Build automation
├── buildspec.yml                  # AWS CodeBuild CI/CD
├── CHANGELOG.md                   # Release history (current: v0.24.0)
└── README.md                      # Complete Yocto build reference
```

---

## 2. Services running on the Hub

### Native services

| Service | Unit | Purpose |
|---------|------|---------|
| `heylo-mqtt-client` | `heylo-mqtt-client.service` | MQTT request/response handler; receives platform commands |
| Mosquitto | `mosquitto.service` | Local MQTT broker; bridges to AWS IoT via certs |
| go2rtc | `go2rtc.service` | RTSP/ONVIF/Reolink camera streaming proxy |
| CloudWatch Agent | `amazon-cloudwatch-agent.service` | Log + metric shipping to AWS CloudWatch |
| SSM Agent | `amazon-ssm-agent.service` | AWS Systems Manager for remote config/access |
| Mender Client | `mender-client.service` | OTA update polling + dual-partition swap |

### Containerized services

| Service | Runtime | Purpose |
|---------|---------|---------|
| Home Assistant | systemd-nspawn | Core home automation platform; camera registry, device automations |
| Zigbee2MQTT | Podman quadlet | Zigbee device bridge (USB serial adapter) |
| Z-Wave JS UI | Podman quadlet | Z-Wave device bridge (USB serial adapter) |

---

## 3. heylo-utils CLI tools

Installed to `/usr/bin/` on the device:

| Tool | Purpose |
|------|---------|
| `get-hub-id` | Print this device's Hub ID |
| `heylo-mqtt-client` | Send/receive MQTT messages (also runs as a daemon) |
| `heylo-provision` | Provision device with AWS IoT certs and SSM activation |
| `check-hub-update` | Check Mender for available OTA updates |
| `heylo-health-check` | Report health of all services to the platform |

Private helpers (in `/usr/libexec/heylo-utils/`): AWS IoT fleet provisioner, KVS streaming, ONVIF/Reolink discovery, Z2M/ZUI helpers, stream manager.

---

## 4. AWS integrations

- **AWS IoT:** Device certificate-based MQTT bridge (`mosquitto-bridge-aws.conf.tmpl`). Fleet provisioning via `heylo-provision generate/apply`.
- **AWS KVS:** Camera video streams pushed via `_aws_kvs_stream.py`.
- **AWS SSM:** Remote parameter store access + session manager. Config injected at runtime via `setup-ssm.sh`.
- **AWS CloudWatch:** Log groups per device; `heylo-cw` fetches CW config from SSM and injects Hub ID at service start.

---

## 5. Data flow (key scenarios)

**Platform command arrives:**
Backend → AWS IoT MQTT → Mosquitto bridge → local `heylo-mqtt-client` service → dispatches to local service (e.g., trigger camera discovery, get device state).

**Camera stream requested:**
Platform → MQTT → `heylo-mqtt-client` → `_aws_kvs_stream.py` starts go2rtc → KVS stream ingested.

**Device provisioned:**
`heylo-provision generate` (generates `provision.env`) → `heylo-provision apply` (materializes certs, runs AWS IoT fleet provisioner, registers with SSM) → Mosquitto bridge starts → device appears online.

**OTA update:**
Mender client polls → downloads `.mender` artifact → writes to inactive partition → reboots → swaps active partition → services restart on new rootfs.

---

## 6. Build artifacts

| Artifact | Description |
|----------|-------------|
| `heylo-image-rpi5-*.sdimg` | Flashable SD card image (new device) |
| `heylo-image-rpi5-*.mender` | OTA update artifact (existing device) |
| `img-files/`, `boot-files/` | Component artifacts |
| `.manifest`, `.ext4`, `.dtb` | Build metadata |

Current version: **0.24.0** (see `CHANGELOG.md`).
