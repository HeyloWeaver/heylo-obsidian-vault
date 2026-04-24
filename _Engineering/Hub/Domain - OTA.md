---
type: playbook
tags: [hub, ota, mender, yocto, build, ci, domains]
owner: Mike
updated: 2026-04-23
status: current
---
# Hub — Domain: OTA & Build

Covers the Mender OTA pipeline, Yocto build system, kas config, and CI/CD.

---

## Mender OTA overview

Mender uses a **dual A/B partition** scheme:

```
Boot → RootfsA (active) ↔ RootfsB (inactive)
                              ↑
                         Mender writes here
                         then reboots + swaps
```

1. Mender client on the device polls the Mender server for new artifacts.
2. On update available: downloads `.mender` artifact to scratch space.
3. Writes to the inactive partition.
4. Reboots; bootloader activates the new partition.
5. If services come up cleanly within the commit window: Mender commits the update.
6. If commit fails: Mender rolls back to the previous partition automatically.

`/data` (partition 4) is never touched by OTA — provisioning certs, HA state, logs, and container data persist across updates.

---

## Build system: Yocto + kas

**kas** is the build orchestration tool. It reads YAML config files and:
- Fetches all layer repositories at the pinned commits.
- Sets up the Yocto build environment.
- Invokes `bitbake` with the correct machine/distro settings.

### Config hierarchy

```
kas/products/heylo-os-rpi5.yml   ← top-level, includes ↓
kas/base/heylo-base.yml          ← layer repos, distro declaration
kas/boards/rpi5.yml              ← MACHINE = raspberrypi5
kas/base/secrets.yml             ← default secrets (not committed in prod)
```

Product config (`heylo-os-rpi5.yml`) adds RPi5-specific overrides: UART device tree, WiFi/BT firmware (`bcmfmac` / BCM4345c0), DTB file, and any product-specific `IMAGE_INSTALL` additions.

---

## Local build

Requires WSL2 + Ubuntu 24.04 LTS, 8+ cores, 16–32 GB RAM, 120 GB+ disk.

```bash
# First-time setup
sudo apt install -y gawk wget git diffstat unzip texinfo gcc build-essential \
     chrpath socat cpio python3 python3-pip python3-pexpect \
     xz-utils debianutils iputils-ping python3-git python3-jinja2 \
     libegl1-mesa libsdl1.2-dev pylint xterm zstd
sudo apt install docker.io && sudo usermod -aG docker $USER

# Build
./build.sh           # runs: kas build kas/products/heylo-os-rpi5.yml

# Export artifacts to artifacts/
./export.sh

# Flash a dev device
# Use Balena Etcher or dd to write artifacts/heylo-image-rpi5-*.sdimg
```

### Incremental builds

Yocto's `sstate-cache` (backed by S3 in CI) makes incremental builds fast. If you change a single recipe, only that recipe and downstream dependencies rebuild. A full clean build from scratch takes 3–4 hours.

```bash
./cleansstate.sh     # clear sstate cache (slow next build, but fixes stale cache issues)
./cleanall.sh        # full clean — nuke build directory
./purge.sh           # remove everything including downloads
```

---

## CI/CD: AWS CodeBuild

**File:** `hub/buildspec.yml`

- Triggered on push to main or manually via the AWS console.
- Runs `./build.sh` inside the CodeBuild environment (Ubuntu, Docker-in-Docker).
- Timeout: 480 minutes.
- Requires 200+ GB EBS storage for the Yocto build directory.
- sstate cache is pulled from/pushed to S3 for fast incremental CI builds.
- On success: artifacts are uploaded to S3 and the Mender server.

See `hub/CODEBUILD_SETUP.md` for the full CodeBuild project configuration guide.

---

## Cutting a release

1. Bump `DISTRO_VERSION` in `hub/meta-heylo/conf/distro/heylo-os.conf`.
2. Update `hub/CHANGELOG.md` with a new version entry.
3. Build: `./build.sh && ./export.sh`.
4. Flash `*.sdimg` to a dev device; verify all services start cleanly.
5. Test OTA: upload `.mender` to the Mender server (`./upload-hub-update.sh`) and push to the dev device via Mender UI.
6. Verify rollback: induce a failure in a test build; confirm Mender rolls back to the previous partition.
7. Push the validated `.mender` to production devices via Mender deployment.

---

## Artifact files

| File | Created by | Use |
|------|-----------|-----|
| `heylo-image-rpi5-*.sdimg` | `./export.sh` | Flash new devices |
| `heylo-image-rpi5-*.mender` | `./export.sh` | OTA update existing devices |
| `heylo-image-rpi5-*.manifest` | Yocto | Package list for auditing |
| `heylo-image-rpi5-*.ext4` | Yocto | Raw rootfs image (debug use) |
| `heylo-image-rpi5-*.dtb` | Yocto | Device tree blob |

All artifacts land in `hub/artifacts/` after `export.sh`.

---

## meta-heylo layer structure

```
meta-heylo/
├── conf/
│   ├── layer.conf                     # Layer registration, LAYERDEPENDS
│   └── distro/heylo-os.conf           # DISTRO_VERSION, build settings
├── classes/
│   └── heylo-rootfs-hooks.bbclass     # File install helpers, tmpfiles patterns
└── recipes-<category>/
    ├── heylo-heylo/                   # All Heylo-specific services + tools
    ├── recipes-core/                  # Base image, packagegroups, systemd units
    ├── recipes-connectivity/          # Mosquitto, OpenSSH, CloudWatch agent
    ├── recipes-networking/            # WiFi, networkd, radio, zeroconf
    ├── recipes-kernel/                # Kernel config, WiFi/BT modules
    ├── recipes-python/                # Python package recipes
    ├── recipes-security/              # Audit config
    └── recipes-extended/              # sudo, shadow hardening
```

### heylo-rootfs-hooks.bbclass

The `heylo-rootfs-hooks` class provides helpers used by Heylo recipes:
- Install files to specific rootfs paths with correct permissions.
- Generate `tmpfiles.d` entries for runtime-mutable directories (e.g., `/data/log/`, `/data/certs/`).
- Set ownership and modes without writing a full `do_install` in each recipe.

Use `inherit heylo-rootfs-hooks` in a recipe and call the provided macros instead of manual `install` commands.

---

## Debugging a bad OTA

1. Check Mender client status: `journalctl -u mender-client`.
2. If update failed to commit: Mender will have already rolled back — `mender show-artifact` shows the current artifact name.
3. If services failed post-update: check `journalctl` for failing units; `heylo-health-check` reports service health.
4. If device went offline: use `hub-logs` skill to pull CloudWatch logs from the last-known state — see [[Hub/Skills/hub-logs]].
5. To force a re-provision after a bad image: reflash with `*.sdimg` and re-copy `provision.env`.

---

**Up:** [[Hub/Domain Playbooks]] · [[Hub/Agent Work Guide]]
