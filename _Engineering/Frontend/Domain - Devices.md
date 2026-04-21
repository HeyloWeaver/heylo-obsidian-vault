---
type: domain
tags: [frontend, devices]
owner: Mike
updated: 2026-04-21
status: current
---
# Frontend Domain - Devices

## Primary ownership

- Device status visualization and operational controls in UI.
- Site/device pages, banners, and health indicators.
- Realtime device connectivity/battery event presentation.

## Read these first

- `frontend/components/devices/`
- `frontend/components/ui/device-alert-banner.tsx`
- `frontend/components/ui/disconnect-banner.tsx`
- `frontend/services/deviceService.ts`
- `frontend/services/siteService.ts`
- `frontend/lib/models/device/`
- `frontend/context/socket-context.tsx`

## Common change patterns

1. Add/adjust device fields -> update models + service typing.
2. Update site/device UI components where status is shown.
3. Verify realtime event paths for online/offline/standby/battery.
4. Validate role access and navigation routes for impacted screens.

## Gotchas

- Device health signals can arrive from multiple event types.
- Device UI behavior may be split between page state and global banners.
- Naming drift between backend event labels and frontend labels is common.

## Done checklist

- Device status changes show correctly in all touched views.
- Battery/online/offline alerts still surface and clear correctly.
- No regressions in socket-driven banners/indicators.
- Service payload assumptions match backend response shape.