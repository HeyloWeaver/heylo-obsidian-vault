---
status: in_progress
owner: Mike
created: 2026-04-24
updated: 2026-04-24
tags:
  - plan
  - backend
  - frontend
  - devices
  - caseload
type: plan
related:
  - "[[Agent Work - Start Here]]"
  - "[[Backend/Agent Work Guide]]"
  - "[[Frontend/Agent Work Guide]]"
  - "[[Frontend/Domain - Devices]]"
  - "[[04-24-26 - Notes]]"
  - "[[04-23-66 - HEY-352 - Fix device naming]]"
---

# 04-24-26 End of Day Work Plan

## Goal

Finish the work an AI agent can directly do from the repo and local environment, with the first implementation slice focused on **HEY-352 device naming migration** now that local MySQL is running.

Use this plan as the handoff surface for agents. Start with [[Agent Work - Start Here]], then use [[Backend/Agent Work Guide]] and [[Frontend/Agent Work Guide]] for repo-specific conventions.

## Priority Order

1. **HEY-352 device naming migration** - first focus.
2. **Local database / migration runner cleanup** - supports HEY-352 and future backend work.
3. **HEY-376 caseload updates** - UI/data-shape work after the naming slice.
4. **Local auth investigation** - understand AWS-coupled local dev pain before implementing stubs.
5. **Create schedule update** - inspect, implement, and test after caseload read/display changes are clearer.

---

## 1. HEY-352 - Device Naming Migration

### Desired Naming Rules

From [[04-23-66 - HEY-352 - Fix device naming]]:

- Remove duplicate "door" in sensor names.
- Rename user-facing "motion sensor" labels to just "sensor".
- Do not expose "indoor" or "outdoor" in camera names. Keep indoor/outdoor as internal metadata only.

Examples:

- `Downstairs LR Motion Sensor` -> `Downstairs LR Sensor`
- `Back Yard Indoor Camera` -> `Back Yard Camera`
- `Back Yard Outdoor Camera` -> `Back Yard Camera`
- `Front Door Door Sensor` -> `Front Door Sensor`

### Known Code Entry Points

Backend create/edit paths:

- `backend/src/controllers/device.controller.ts`
- `backend/src/services/device.service.ts`
- `backend/src/domain/dto/device-create-request.dto.ts`
- `backend/src/domain/dto/device-update-request.dto.ts`
- `backend/src/domain/enums/device-type-name.ts`

Hub/event-ingest paths that can auto-create devices:

- `backend/lambda/eventProcessor.mjs`
- `backend/src/controllers/device-status.controller.ts`
- `backend/src/domain/dto/device-status-update-request.dto.ts`
- `backend/src/domain/dto/camera-status-update-request.dto.ts`
- `backend/src/services/device.service.ts`

Frontend display/contract sanity checks:

- `frontend/services/deviceService.ts`
- `frontend/lib/models/device/`
- `frontend/components/devices/`

### Current Behavior to Change

`DeviceService.create()` builds common-area names as:

- `${commonAreaName}'s ${deviceType.name}`
- for cameras, `Indoor Camera` or `Outdoor Camera`

`DeviceService.update()` can preserve existing names unless destination/common area changes, and camera `isOutdoor` changes currently replace `Indoor Camera`/`Outdoor Camera` in the stored name.

`DeviceService.updateCameraStatusFromHub()` auto-creates camera devices as `Indoor Camera`, `Outdoor Camera`, `Video Doorbell`, or `Camera Hub`.

`DeviceService.updateDeviceStatusFromHub()` auto-creates Zigbee/smoke devices using raw `DeviceTypeName` values such as `Door Sensor`, `Motion Sensor`, and `Smoke Detector`.

### Implementation Plan

1. Add one backend naming helper, preferably near device domain code rather than inline in `DeviceService`.
   - Candidate path: `backend/src/domain/utils/device-display-name.ts`.
   - Inputs should cover destination label, device type, capability, and metadata flags.
   - Keep `metadata.isOutdoor` as the source of truth for camera placement.
   - Return customer-facing names that strip `Indoor`/`Outdoor`, collapse duplicate words, and convert `Motion Sensor` to `Sensor`.

2. Replace create/edit inline naming in `DeviceService`.
   - Common-area create should call the helper instead of building `${commonAreaName}'s ${deviceTypeName}` directly.
   - Resident create/update should use the same helper with the resident first name.
   - Hub devices with `DestinationType.None` can keep their existing hub-specific names; do not expand scope without a code-level reason.
   - Updating camera `isOutdoor` should update metadata without rewriting the user-facing name to `Indoor Camera` or `Outdoor Camera`.

3. Replace auto-created event-ingest names.
   - In `updateCameraStatusFromHub`, auto-created normal cameras should store `Camera`, not `Indoor Camera` / `Outdoor Camera`.
   - Video doorbells should avoid `Door Door` if paired with a common-area or friendly name containing `Door`.
   - In `updateDeviceStatusFromHub`, auto-created motion devices should store `Sensor` where customer-facing, while retaining type/capability as `MotionSensor`.

4. Write a data migration for existing rows.
   - Path: `backend/src/migrations/{timestamp}-normalize-device-display-names.ts`.
   - Migration should update `device.name` only.
   - Keep it idempotent with string replacements such as:
     - `Indoor Camera` -> `Camera`
     - `Outdoor Camera` -> `Camera`
     - `Motion Sensor` -> `Sensor`
     - duplicate `Door Door` -> `Door`
   - Do not change `deviceType.name`, `physicalDeviceId`, `metadata`, or Kinesis stream names.

5. Add focused tests.
   - Unit test the naming helper with the examples above.
   - Add service-level coverage where practical for create/update naming and camera `isOutdoor` metadata behavior.
   - Add or adjust device auto-creation tests if they already cover event-ingest names.

6. Validate locally against Docker MySQL.
   - Show migration state:
     - `npm run typeorm:migrate:show:local -w heylo-api`
   - Run migrations:
     - `npm run typeorm:migrate:local -w heylo-api`
   - Run focused tests:
     - `npm run test:device-auto-creation -w heylo-api`
     - Add the new helper/service test command once the test file exists.

### Definition of Done

- Existing devices are migrated to the cleaned user-facing names.
- New devices created through REST create/edit use the same naming rules.
- Devices auto-created from hub/camera list responses use the same naming rules.
- Camera indoor/outdoor state still exists internally as metadata, but no customer-facing name exposes it.
- No frontend contract changes are required unless UI code has hardcoded assumptions about the old names.
- Local MySQL migration run succeeds.

### Agent Assumptions

- Keep `Video Doorbell` as-is unless the generated name duplicates words, such as `Front Door Door Sensor`.
- Keep `Smoke Detector` as-is because the note only calls out sensors, camera indoor/outdoor labels, and duplicate `door`.
- Preserve the existing possessive naming style (`Kitchen's Camera`) for this slice; only normalize the device-type portion.

---

## 2. Local Database / Migration Runner Cleanup

### Current Context

Local MySQL is up. The root package has local TypeORM wrappers:

- `db:migrate:show`
- `db:migrate`
- `db:revert`

The root dev service picker also has DB profile support through `.env.local` and `.env.dev`, and accepts `--db local|dev`.

### Plan

1. Verify the local scripts work against the current Docker MySQL:
   - `npm run db:migrate:show`
   - `npm run db:migrate`
2. Keep `.env.local` and `.env.dev` untracked unless intentionally adding example templates.
3. If backend workspace migration scripts are kept, align them with the working root scripts or document root scripts as canonical.
4. Document the final commands in [[Dev Environment Setup]] after verifying them locally.

### Definition of Done

- There is a clear command for migration show/run against local MySQL.
- The command cannot accidentally hit dev RDS when local was intended.
- The docs tell future agents which command to use.

---

## 3. HEY-376 - Caseload Updates

### Requested Behavior

- Roll multiple site shifts into one card when the same staff member has the same time window.
- Display a compact count like `5 sites`, then show a pill for each site.
- Add visual indication when shifts bleed into adjacent cards or time ranges.
- Remove custom previous/next caching and consider Apollo caching instead.
- Add more site color-wheel colors.

### Agent Context

Use:

- [[Frontend/Domain - Caseload]]
- [[Backend/Domain - Caseload]]
- [[Go/Domain - Caseload]]
- [[Caseload Redesign v1]]

### Plan

1. Inspect current source of truth for the caseload schedule payload: frontend fixture, Nest REST, or Go/AppSync.
2. Normalize the schedule view model so grouping is deterministic:
   - key by staff member + start time + end time + shift/day identity.
   - aggregate sites into an ordered array.
3. Update card rendering to show one staff/time card with site count and site pills.
4. Add bleed-over indication in CSS/component logic after the grouping model is stable.
5. Replace custom prev/next cache only after measuring what the current cache is preventing.
6. Extend site colors through the existing frontend constants/token pattern.

### Definition of Done

- Same staff/same time/site-multiple shifts render as one card.
- Overlapping or bleed-over shifts remain legible.
- Navigation between date ranges does not regress.
- Color additions follow [[Frontend/Agent Work Guide]] token/constant rules.

---

## 4. Local Auth Investigation

### Problem

Backend local dev is still coupled to AWS Cognito and the managed WebSocket endpoint. When localhost logs in, it can connect to dev websocket infrastructure and cause dev-side connection rows.

### Plan

1. Read and trace:
   - `backend/src/guards/auth.guard.ts`
   - `backend/src/services/context.service.ts`
   - `backend/src/controllers/connection.controller.ts`
   - `backend/src/services/websocket.service.ts`
   - `frontend/context/socket-context.tsx`
   - `frontend/lib/api.ts`
2. Document the exact local login -> token validation -> websocket connection flow.
3. Identify the smallest local-only seam:
   - local JWT issuer/validator stub,
   - local websocket endpoint stub,
   - or disabled websocket registration in local mode.
4. Do not implement until the behavior is understood and written down in `_Engineering/`.

### Definition of Done

- There is a short architecture note describing current auth/websocket coupling.
- A concrete implementation option is selected before coding.
- Local dev no longer writes accidental connection state to dev AWS once implemented.

---

## 5. Create New Schedule Update

### Requested Behavior

Change weekly schedule creation so users select a day and can create overnight ranges, such as `4pm` to `5am`.

### Plan

1. Inventory current create/edit schedule flow in frontend and backend.
2. Inspect and choose the smallest compatible backend representation for overnight shifts:
   - same row with end time logically next day, or
   - split rows by day boundary.
3. Update validation so end time earlier than start time is allowed only when it means overnight.
4. Add UI copy and tests for overnight behavior.
5. Reuse any overlap/bleed-over display work from HEY-376.

### Definition of Done

- A user can create an overnight shift from a selected start day.
- Backend stores or expands the shift consistently.
- Caseload display makes overnight shift boundaries clear.

