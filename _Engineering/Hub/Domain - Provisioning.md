---
type: playbook
tags: [hub, provisioning, aws-iot, domains]
owner: Mike
updated: 2026-04-23
status: current
---
# Hub — Domain: Provisioning

Covers AWS IoT fleet provisioning, certificate management, and the `heylo-provision` tool.

---

## What provisioning does

Provisioning binds a physical Hub to the Heylo platform:

1. **Generate** — creates `provision.env` containing the AWS IoT endpoint, agency ID, device certificates, and SSM activation code.
2. **Apply** — reads `provision.env`, materializes cert files to `/data/certs/`, derives the client/thing ID, runs the AWS IoT fleet provisioner (`_aws_iot_fleet_provisioner.py`), and registers with AWS SSM.
3. **Copy** — injects `provision.env` and certs into the data partition of a WIC image (for pre-provisioning new SD cards) or a live device.

After apply, the Mosquitto bridge to AWS IoT can start and the device appears online.

---

## Key files

| File | Purpose |
|------|---------|
| `hub/heylo-utils/_aws_iot_fleet_provisioner.py` | Core provisioning logic — fleet provisioning template + cert registration |
| `hub/heylo-utils/_get_hub_id.py` | Derives Hub ID from hardware identifiers |
| `hub/heylo-utils/_get_device_identifiers_map.py` | Maps hardware IDs to provisioning parameters |
| `hub/heylo-utils/_env_helper.py` | Parses and validates `provision.env` |
| `hub/heylo-utils/README-heylo-provision.md` | Full CLI reference for `heylo-provision` |
| `hub/meta-heylo/recipes-heylo/heylo-provision/files/heylo-provision-apply.path` | systemd path unit — triggers apply when `provision.env` appears |
| `hub/meta-heylo/recipes-heylo/heylo-provision/files/heylo-provision-apply.service` | Runs `heylo-provision apply` on path trigger |
| `hub/meta-heylo/recipes-heylo/heylo-provision/files/heylo-logging-tmpfiles.conf` | Creates `/data/provision/` at boot |

---

## heylo-provision CLI

```bash
# On a dev machine — generate provision.env for a device:
heylo-provision generate --agency-id <id> --output /tmp/provision.env

# On the device — apply provision.env:
heylo-provision apply --env /data/provision/provision.env

# Pre-provision a WIC image before flashing:
heylo-provision copy --env /tmp/provision.env --wic /path/to/image.sdimg

# Pre-provision a raw SD card (Linux):
heylo-provision copy --env /tmp/provision.env --device /dev/sdX

# Pre-provision a Windows volume:
heylo-provision copy --env /tmp/provision.env --drive D:
```

See `hub/heylo-utils/README-heylo-provision.md` for all flags.

---

## Provisioning flow (automated on-device)

1. SD card is flashed. Data partition is empty.
2. `heylo-provision-apply.path` watches for `/data/provision/provision.env`.
3. Operator copies `provision.env` + certs to `/data/provision/` (via SSH, USB, or the `copy` subcommand).
4. Path unit triggers `heylo-provision-apply.service`.
5. Apply script materializes certs, registers with AWS IoT (fleet provisioning template), creates SSM activation.
6. Mosquitto bridge starts and device comes online.
7. CloudWatch agent fetches its config from SSM and begins shipping logs.

---

## AWS IoT fleet provisioning

- Uses AWS IoT **fleet provisioning** (not just JITP): a claim certificate + provisioning template creates a unique device certificate per Hub.
- The provisioning template name and claim cert paths are baked into the image via `heylo-provision` recipe defaults.
- After provisioning, the claim cert is discarded; only the device-specific cert (in `/data/certs/`) is used.

---

## Debugging provisioning

1. Check `/data/provision/provision.env` exists and is complete.
2. Check `journalctl -u heylo-provision-apply` for apply errors.
3. Check `/data/certs/` for materialized cert files (`device.crt`, `device.key`, `ca.crt`).
4. Verify Mosquitto bridge is connected: `journalctl -u mosquitto` — look for `Connected to` AWS IoT endpoint.
5. Use `hub-logs` skill to pull CloudWatch logs for the device once it's online.

---

**Up:** [[Hub/Domain Playbooks]] · [[Hub/Agent Work Guide]]
