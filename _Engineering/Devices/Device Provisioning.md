---
type: reference
tags: [devices, hardware, provisioning]
owner: Chris
updated: 2026-04-21
status: current
---
- Allow super users to download `.sdimg` from platform
    
    - Allow “warehouse” role to download from platform
    - MVP: email it, thumb drive at factory
- Warehouse user has access to a computer
    
    - Uses standard flasher to burn image to SD
        - Todo: provide step by step
    - Uses heylo app to get a unique activation/env file, copies it to SD card
        - MVP?
        - Has a **unique HubID** tied to customer order — how/when can we access the hub id to put it in our database
        - Optionally include Wi-Fi credentials, customer ID, or region-specific settings in the same env file.
            - How do we handle wifi in factory vs wifi on site?
        - Scalable option: factory runs a script `heylo-provision.sh` that pulls the next available activation from the backend and writes it to the SD card before sealing the unit.
        - Use AWS creds
    - Test Suite suggestions?
        - make sure firmware is working
            - wifi/z wave dongle
    - Run script to verify in SSM
        - validate GPIO, sensors, connectivity
            - validate sensor connection in factory?
    - What do you mean by Customer receives a device that will **auto-call home** on first power-up in the field.
- **Pre-Built Image**
    
    - Yocto build produces a hub image with:
        - Heylo software stack baked in.
        - AWS SSM + CloudWatch Agent Yocto layers.
        - Default systemd units to handle SSM registration and telemetry.
        - Placeholders for activation credentials.
    - Output is a single `.sdimg` file the factory flashes.
- **Flashing at Factory**
    
    - Factory technician uses a standard flasher (e.g., `balenaEtcher`, `rpi-imager`, `Win32DiskImager`, or our own `flash-hub.sh`) to burn the image onto the SD card / eMMC.
    - No customization needed yet.
- **Inject Activation & Identity (per-unit):** After flashing, each unit gets its **unique activation/env file** dropped onto the boot partition (FAT32, accessible from any OS):
    
    - `/boot/heylo/ssm-activation.env`:

```
ACTIVATION_CODE="XYZ123"
ACTIVATION_ID="abcd-1234-efgh-5678"
AWS_REGION="us-east-2"
HUB_ID="HUB-${SERIAL}"

```

- Optionally include Wi-Fi credentials, customer ID, or region-specific settings in the same env file.
- This can be **auto-generated** via the backend → CSV → QR-code → factory tool.
- Scalable option: factory runs a script `heylo-provision.sh` that pulls the next available activation from the backend and writes it to the SD card before sealing the unit.
- **First Boot Auto-Registration:** On power-up:
- systemd runs `ssm-register.service`:
- Reads `/etc/heylo/ssm-activation.env` (copied from `/boot/heylo/`).
- Calls `amazon-ssm-agent -register`.
- Marks the unit as a **managed instance** in AWS SSM.
- Renames `ssm-activation.env` → `.applied` (so it can’t re-run accidentally).
- CloudWatch Agent service runs:
- Fetches config from Parameter Store (`/agency/<name>/cloudwatch/config`).
- Starts sending metrics/logs.
- Device tags itself in SSM (via startup script):
- Example: `Name=HeyloHub`, `HubID=HUB-<CPU ID>`, `FactoryBatch=2025-09-001`.
- **Factory Test / Burn-In**
- SSM lets you **remotely run commands** (AWS-RunShellScript).
- A QA operator runs a test suite:
- Verify device online in SSM.
- Pull CPU/mem metrics from CloudWatch.
- Run a health script (`hub-selftest.sh`) to validate GPIO, sensors, connectivity.
- Results logged centrally. Pass/Fail shown in factory dashboard.
- **Ship-Ready State**
- Once QA passes, the hub:
- Is already SSM-managed.
- Reports metrics to CloudWatch.
- Has a **unique HubID** tied to customer order.
- Customer receives a device that will **auto-call home** on first power-up in the field.