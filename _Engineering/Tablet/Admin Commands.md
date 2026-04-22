---
type: reference
tags: [tablet, admin, websocket]
owner: Mike
updated: 2026-04-22
status: current
source: tablet/README.md
---
# Tablet — Admin Commands

Admin commands are sent to devices via WebSocket using the `admin_command` event.

| Command | Description |
|---------|-------------|
| `update-sideload` | Install APK from a URL (requires `url` field in data) |
| `restart` | Restart the app |
| `reboot` | Reboot the device |

See [[Tablet/Domain - Kiosk]] for the update and kiosk architecture, and [[Tablet/Skills/tablet-logs]] for fetching device logs from CloudWatch.
