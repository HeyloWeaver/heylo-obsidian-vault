---
type: guide
tags: [hub, agents, embedded, yocto]
owner: Mike
updated: 2026-04-23
status: current
---
# Hub — Agent Work Guide

## What the Hub owns

- Yocto 5.2 embedded Linux build system for Raspberry Pi 5.
- Custom `meta-heylo` layer with all Heylo-specific BitBake recipes.
- All on-device services: MQTT broker, Home Assistant, Zigbee2MQTT, Z-Wave JS UI, go2rtc, CloudWatch, SSM.
- `heylo-utils` Python CLI tools: provisioning, health check, MQTT client, KVS streaming, camera discovery.
- AWS IoT fleet provisioning and certificate management (`heylo-provision`).
- Mender OTA dual-partition update pipeline.
- CI/CD via AWS CodeBuild (`buildspec.yml`).

---

## High-signal files to read first

### Build configuration
- `hub/kas/products/heylo-os-rpi5.yml` — top-level product config; overrides for UART, WiFi/BT firmware, DTB.
- `hub/kas/base/heylo-base.yml` — Yocto 5.2 layer repos and distro declaration.
- `hub/meta-heylo/conf/distro/heylo-os.conf` — distro version (`DISTRO_VERSION`) and build settings.

### Core recipes
- `hub/meta-heylo/recipes-heylo/heylo-utils/heylo-utils.bb` — CLI tools, MQTT client service, Python deps.
- `hub/meta-heylo/recipes-heylo/heylo-provision/heylo-provision.bb` — AWS IoT provisioning service.
- `hub/meta-heylo/recipes-heylo/heylo-ha/heylo-ha.bb` — Home Assistant container + seed config.
- `hub/meta-heylo/recipes-heylo/heylo-mosquitto/heylo-mosquitto.bb` — MQTT broker config.
- `hub/meta-heylo/recipes-heylo/heylo-z2m/heylo-z2m.bb` — Zigbee2MQTT container.
- `hub/meta-heylo/recipes-heylo/heylo-zui/heylo-zui.bb` — Z-Wave JS UI container.
- `hub/meta-heylo/recipes-heylo/heylo-cw/heylo-cw.bb` — CloudWatch agent gating + prestart.

### CLI tool source
- `hub/heylo-utils/` — Python source for all `heylo-*` CLI tools and private helpers.
- `hub/heylo-utils/README-heylo-provision.md` — Complete `heylo-provision` CLI reference.

### Build scripts
- `hub/build.sh` — Local build wrapper (`kas build`).
- `hub/export.sh` — Copy artifacts from Yocto `tmp/deploy/images/` to `artifacts/`.
- `hub/upload.sh` / `hub/upload-hub-update.sh` — Upload artifacts to S3 / Mender server.
- `hub/buildspec.yml` — AWS CodeBuild pipeline (480-min timeout, 200 GB storage).

### Release history
- `hub/CHANGELOG.md` — Full release notes; current version is v0.24.0.

---

## Fast change recipes

### 1. Update a Python CLI tool in heylo-utils

1. Edit the relevant file in `hub/heylo-utils/` (private helpers are in the same folder).
2. If you add a new Python dependency: add to `hub/heylo-utils/requirements.txt` **and** declare it in `hub/meta-heylo/recipes-heylo/heylo-utils/heylo-utils.bb` under `RDEPENDS` or the appropriate `recipes-python/` entry.
3. Bump `DISTRO_VERSION` in `hub/meta-heylo/conf/distro/heylo-os.conf`.
4. Build and test: `./build.sh` → `./export.sh`.
5. Update `hub/CHANGELOG.md` with a new entry.

### 2. Add or change a systemd service unit

1. Place the `.service` (and any `.conf` override) in `hub/meta-heylo/recipes-heylo/<recipe>/files/`.
2. Reference it in the recipe `.bb` file: add to `SRC_URI` and install via `do_install` (or the `heylo-rootfs-hooks.bbclass` hook pattern).
3. If the service should auto-enable: add `SYSTEMD_AUTO_ENABLE = "enable"` and declare `SYSTEMD_SERVICE:<recipe> = "<name>.service"` in the recipe.
4. For gating (service should only start after provisioning): follow the `heylo-cw` pattern with a `00-heylo-gating.conf` drop-in.
5. Bump `DISTRO_VERSION` and `CHANGELOG.md`.

### 3. Change Mosquitto MQTT configuration

1. Edit config fragments in `hub/meta-heylo/recipes-heylo/heylo-mosquitto/files/`.
2. If editing the AWS bridge template (`mosquitto-bridge-aws.conf.tmpl`): variables are rendered at runtime by `heylo-mosquitto-render.sh` using values from `provision.env`.
3. Do not hardcode cert paths — they are injected from `/data/certs/` at runtime.
4. Rebuild and flash a dev device to verify bridge reconnects to AWS IoT.

### 4. Change Home Assistant seed configuration

1. Edit seed files in `hub/meta-heylo/recipes-heylo/heylo-ha/files/`:
   - `seed-configuration.yaml` — core HA settings.
   - `seed-core.config_entries.json` — integration entries.
   - `cameras_registry_responder.yaml` / `devices_registry_responder.yaml` — automations.
   - `onvif_to_mqtt_bridge.yaml` — ONVIF→MQTT blueprint.
2. Seed files are only applied on first boot (when `/data/homeassistant/` is empty). To re-apply, the data partition must be cleared or the file explicitly replaced via the recipe's install step.
3. If adding a new template variable to `heylo-ha-render.sh`: verify the variable is present in `provision.env` at render time.

### 5. Cut a new release / OTA image

1. Bump `DISTRO_VERSION` in `hub/meta-heylo/conf/distro/heylo-os.conf`.
2. Update `hub/CHANGELOG.md` with the new version entry.
3. Run `./build.sh` locally (or trigger CodeBuild).
4. Run `./export.sh` to collect artifacts.
5. Flash `*.sdimg` for a full test on a dev device; verify all services come up.
6. Run `./upload-hub-update.sh` to push the `.mender` artifact to the OTA server.
7. Confirm Mender shows the new artifact available; push to a test device and verify rollback succeeds if needed.

See [[Hub/Domain - OTA]] for the full OTA workflow.

### 6. Add a new recipe/package to the image

1. Create `hub/meta-heylo/recipes-<category>/<name>/<name>.bb`.
2. Add the package to `IMAGE_INSTALL` in the relevant image recipe under `meta-heylo/recipes-core/images/`.
3. If it's a Python package, check if it already exists in `meta-openembedded`; if not, create a recipe under `hub/meta-heylo/recipes-python/<name>/`.
4. Run `./build.sh` and verify the package appears in the image manifest.

---

## Gotchas and drift risks

- **Read-only rootfs.** The rootfs is mounted read-only. Any file that needs to be written at runtime must be declared in a `tmpfiles.d` config (see `heylo-rootfs-hooks.bbclass` pattern) so systemd creates the overlay on `/data` at boot. Writing to rootfs paths will silently fail or cause a readonly filesystem error.
- **`provision.env` is the runtime source of truth.** Services like Mosquitto, CloudWatch, and HA render their configs from `/data/provision/provision.env` at start time. If `provision.env` is missing or incomplete, services will not start correctly — check provisioning before debugging service failures.
- **`DISTRO_VERSION` drives the build version.** Forgetting to bump it means the new `.mender` artifact has the same version string as the previous one — Mender will reject it as already-installed.
- **Seed config only applies on empty `/data`.** HA seed files from `heylo-ha` are installed once. If you change seed config and need it re-applied to a live device, you must either clear `/data/homeassistant/` manually or deploy a migration recipe.
- **Container networking uses the data partition.** HA, Z2M, and ZUI containers write persistent state to `/data/`. Never recipe-install files to those paths directly — they will be masked by the runtime data partition mount.
- **kas cache invalidation.** After changing layer URLs or branch pins in `kas/base/heylo-base.yml`, run `./cleansstate.sh` or `./cleanall.sh` to avoid stale build artifacts. Partial state cache mismatches cause confusing build failures.
- **USB serial adapter enumeration is non-deterministic.** Z2M and ZUI reference specific serial device paths. If the adapter USB port changes, the container configs must be updated. Prefer `udev` rules for stable device names.
- **Mender artifact format must match the Mender client version.** If upgrading the Mender client in the image, also update the `MENDER_ARTIFACT_NAME` and confirm the `.mender` artifact was built with a compatible `mender-artifact` tool version.
- **CodeBuild has a 480-min timeout and requires 200+ GB disk.** Full clean builds from scratch take 3–4 hours. Use sstate cache (S3-backed) for incremental builds in CI — without it, every PR build is a multi-hour full rebuild.
- **Secrets in `kas/base/secrets.yml` are not committed.** This file holds default secret values. In CI, secrets are injected via environment variables. Do not add real credentials to any committed kas file.

---

## Claude skills and commands

Hub skills and commands for debugging and operations — invoke inside Claude Code when working in `hub/`:

| Type | Invoke with | Purpose |
|---|---|---|
| Skill | `hub-logs <agency_id> <hub_id> [hours]` | Fetch and analyze CloudWatch logs for a hub |
| Command | `/hub-mqtt` | MQTT topic quick reference for CLI debugging |

- See [[Hub/Skills/Skills]] for the full skills reference.
- See [[Hub/Commands/Commands]] for the full commands reference.

---

## Done checklist for Hub tasks

- `DISTRO_VERSION` bumped in `meta-heylo/conf/distro/heylo-os.conf`.
- `CHANGELOG.md` updated with a new version entry describing the change.
- Any new runtime-writable paths declared in a `tmpfiles.d` config — not hardcoded rootfs writes.
- New Python dependencies added to both `requirements.txt` (heylo-utils) and the recipe's `RDEPENDS`.
- New systemd services declared with `SYSTEMD_SERVICE` and `SYSTEMD_AUTO_ENABLE` in the recipe.
- Services that depend on provisioning gated with the `00-heylo-gating.conf` drop-in pattern.
- Build tested locally (`./build.sh` + `./export.sh`) or CI passed before declaring done.
- If OTA path changed: `.mender` artifact tested on a dev device (update + rollback).
- If Mosquitto/HA/Z2M config changed: verified service came up cleanly on a freshly flashed device.
- `_Engineering/Hub/*` notes updated if architecture, service contracts, or provisioning flow changed.
