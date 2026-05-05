---
status: proposed
owner: Mike
created: 2026-05-05
tags:
  - plan
  - backend
  - frontend
  - agency
  - sales
related:
  - "[[Backend/Agent Work Guide]]"
  - "[[Frontend/Agent Work Guide]]"
  - "[[Backend/Domain Playbooks]]"
type: plan
---

# Interactive Demo Agency — Plan

Stand up an interactive demo experience for prospective customers: instead of shipping physical demo kits, a customer requests a link, we provision a **demo agency** (a real Heylo agency record flagged `isDemo = true`, with sample sites, residents, and alerts but **no hub/AWS provisioning**), and send them a normal login + temp password. They click the link, log in, and see in-app feature guides plus a "Test a live alert" button.

The wedge change is a single column on `agency` — `isDemo` — that gates everything else. Demo agencies skip the IoT / SSM / Secrets Manager provisioning path that real agencies go through, and the frontend uses the flag to render the guided overlay and the alert simulator.

## Goal

A super-admin (or sales op) calls `POST /agency/demo` with `{ customerName, contactName, emailAddress }`. The backend creates a demo agency, a sample site with sample residents (resident-role users), a few historical alerts, an Agency Admin user with a temp password, and emails the prospect a Heylo invitation link. They go through the standard Cognito complete-registration flow. Once inside, the operator console reads `agency.isDemo` from `/me` and renders:
- a top-bar "Test a live alert" button that triggers a simulated `Alert` row + WebSocket fanout, and
- per-tab feature-guide tooltips matching the PRD copy.

Real production usage is unchanged because every demo behavior is gated on `isDemo`.

## Definition of Done

- New column `agency.isDemo TINYINT(1) NOT NULL DEFAULT 0`, exposed on `Agency` entity and `AgencyModel`.
- New endpoint `POST /agency/demo` (super-admin only) creates: a demo `Agency` row (`isDemo = 1`), 1 sample `Site`, 4–6 sample residents (users with `RoleId.resident`), 3–5 sample `Alert` rows (mix of statuses + severities), and 1 Agency Admin user with a Cognito temp password.
- The demo provisioning path **does not call** `AwsService.createHubDevicePolicy`, `createIoTRoleAlias`, `createSSMCloudWatchParameter`, `createHomeAssistantAuthSecret`, or `createReolinkAuthSecret`. Demo agencies have `streamViewerRoleArn = null` and `ssm = null` and that's expected.
- The Agency Admin user receives the same invitation email used by `auth.service.sendInvitation` (existing flow — no new email template).
- `GET /me` (or whichever surface populates the frontend's current-agency state) includes `isDemo` so the UI can branch.
- New endpoint `POST /alerts/demo-trigger` creates a simulated alert against one of the demo agency's sample devices (or a sample-device-less variant); rejects with 403 if the caller's agency is not `isDemo`.
- Frontend renders a "Test a live alert" button in the top bar **only when `currentAgency.isDemo === true`**.
- Frontend renders feature-guide tooltips (one per top-level tab) **only when `currentAgency.isDemo === true`**, with copy lifted verbatim from the PRD.
- Provisioning is wrapped in a `repository.manager.transaction(...)` per project rules; create endpoints return `{ id }` only and the frontend re-fetches.

## Scope Boundaries (what we are NOT doing)

- **Not provisioning real device infrastructure.** Demo agencies have no hub, no IoT, no IAM/SSM/secret resources. If sales ever needs a "real-hardware demo," that's a separate plan.
- **Not building demo-agency self-service.** A super-admin or sales-ops person triggers creation through an internal endpoint or a tiny super-admin UI. We are not exposing a public "request demo" form on the marketing site (that can come later and call the same endpoint).
- **Not implementing demo-agency expiry / cleanup in v1.** Adding `demoExpiresOn` and a sweeper is a follow-up — see Open Questions. For v1 we accept that demo agencies live until manually deleted.
- **Not adding a tour library** (react-joyride / shepherd / driver.js). Per-feature copy is short and tab-scoped — render as simple dismissible MUI tooltips/banners next to each tab's main content. Revisit if product wants multi-step coachmarks.
- **Not changing customer-onboarding/.** Despite the name, that app is lead-intake (CustomerOnboarding entity, share-Cognito user); it does not provision agencies and is unrelated to this work.
- **Not touching `tablet/` or `hub/`.** Demo runs entirely in the operator console.
- **Not building bulk demo creation** (e.g. "spin up 10 demos for a trade show"). One at a time.

## Schema change (the "field in the DB")

Migration following the pattern in [`1773754398876-add-mfa-enabled-to-agency-and-user.ts`](backend/src/migrations/1773754398876-add-mfa-enabled-to-agency-and-user.ts):

```sql
-- up
ALTER TABLE agency ADD COLUMN isDemo TINYINT(1) NOT NULL DEFAULT 0;

-- down
ALTER TABLE agency DROP COLUMN isDemo;
```

Add to [`agency.entity.ts`](backend/src/entities/agency.entity.ts):

```ts
@Column({ default: false })
@AutoMap()
isDemo: boolean;
```

Mirror on `AgencyModel` (`backend/src/domain/models/agency.model.ts`) and any DTOs surfaced to the frontend `/me` payload.

> **Convention note.** The `agency` table has both PascalCase (`DeviceAlertEmails`) and camelCase (`isMfaEnabled`, `canShiftabilityAccess`) columns — the most recent additions (MFA, shiftability) use camelCase to match the entity property names. We follow that recent pattern with `isDemo`. CLAUDE.md prescribes PascalCase as the global rule — flagging in Open Questions whether to backfill or accept the drift.

## Backend implementation

### 1. Migration + entity

- New migration `<timestamp>-add-isdemo-to-agency.ts` mirroring the MFA migration shape.
- Column on [`agency.entity.ts`](backend/src/entities/agency.entity.ts) per snippet above.
- Surface on `AgencyModel` and on whatever the frontend reads from `/me`. Audit `agency-mapper`/profile registrations to ensure the new field flows through AutoMapper.

### 2. New service: `DemoAgencyService`

New file [`backend/src/services/demo-agency.service.ts`](backend/src/services/demo-agency.service.ts). Reuses primitives from `AgencyService`, `UserService`, and `AwsService.touchCognitoUser`, but does **not** call the AWS hub/IoT methods. Pseudocode:

```ts
async provision({ customerName, contactName, emailAddress }): Promise<{ id: string }> {
  return this.dataSource.transaction(async (manager) => {
    // 1. Agency row
    const agency = manager.create(Agency, {
      name: `${customerName} (Demo)`,
      contactName,
      emailAddress,
      phoneNumber: '',
      address: '',
      isDeleted: false,
      isMfaEnabled: false,
      isDemo: true,                      // ← the gate
      createdById: this.contextSvc.userId,
      updatedById: this.contextSvc.userId,
      createdOn: new Date(),
      updatedOn: new Date(),
    });
    await manager.save(agency);

    // 2. Sample site
    const site = manager.create(Site, { agencyId: agency.id, name: 'Sample Site', /* … */ });
    await manager.save(site);

    // 3. Sample residents (users with RoleId.resident, assigned to site)
    const residents = await this.seedResidents(manager, agency.id, site.id);

    // 4. Sample alerts (mix of resolved + active)
    await this.seedAlerts(manager, agency.id, site.id, residents);

    // 5. Agency Admin user + Cognito temp password
    const adminUser = await this.userSvc.createWithRole(manager, {
      agencyId: agency.id,
      roleId: RoleId.agencyAdmin,
      emailAddress, firstName: contactName, /* … */
    });
    const tempPassword = await this.awsSvc.touchCognitoUser(adminUser.id, emailAddress);

    // 6. Standard invitation email — same template real agencies use
    await this.authSvc.sendInvitation(adminUser, tempPassword);

    return { id: agency.id };
  });
}
```

Sample data lives in a fixtures helper [`backend/src/services/demo-agency-fixtures.ts`](backend/src/services/demo-agency-fixtures.ts) (resident names, alert types, severities) — keep it readable, not procedurally generated.

### 3. Endpoint

[`backend/src/controllers/agency.controller.ts`](backend/src/controllers/agency.controller.ts) — add:

```ts
@Post('demo')
@RequireRoles(RoleId.superAdmin)
async createDemo(@Body() dto: CreateDemoAgencyDto): Promise<{ id: string }> {
  return this.demoAgencySvc.provision(dto);
}
```

DTO: `customerName`, `contactName`, `emailAddress` (validated). Returns `{ id }` per project rules.

### 4. Test-alert endpoint

Adapt [`backend/scripts/test-alert.ts`](backend/scripts/test-alert.ts) into a service method and expose:

```
POST /alerts/demo-trigger
```

- Reads caller's `agencyId` from context, loads the agency, **rejects with 403 if `agency.isDemo !== true`**.
- Picks one of the seeded sample devices (or a sample-device-less Alert variant — check whether `Alert` requires `deviceId` non-null) and inserts a row with `Active` status.
- Emits the same realtime event a real device alert would (whatever `websocket.service` currently fans out from device ingestion) so the existing toast/audio path works without UI changes.

If the existing alert ingestion pipeline is too coupled to device payloads, a thinner option is to write the `Alert` row directly and trigger the same `EventHub` event the frontend already listens for. Pick whichever is smaller — confirm in implementation by tracing the production path from a real alert insert to the WS emit.

### 5. `/me` payload

Confirm the endpoint that hydrates `currentAgency` on the frontend (likely `/me` or `/auth/session`) includes `isDemo`. If not, add it — small addition, no breaking change.

## Frontend implementation

### 1. Read `isDemo` from current-agency state

Plumb `isDemo` through whatever Redux slice / context holds the current agency. Single boolean.

### 2. "Test a live alert" button

A top-bar button rendered iff `currentAgency.isDemo`. On click → `POST /alerts/demo-trigger` → rely on the existing realtime listener to surface the alert toast / bottom-left card the PRD describes ("When an alert occurs, it will appear initially at the bottom left corner"). No new UI for the alert itself — that path already exists.

### 3. Feature-guide tooltips

For each top-level tab (Dashboard, Users, Alerts, Communication, Sites, Caseload Management, My Schedule, Heylo Support) and the Account/Profile menu, render a small dismissible info banner or MUI `Tooltip` next to the tab's primary heading with the PRD copy verbatim. Gated on `currentAgency.isDemo`.

Persistence: dismissals can be local-only (`localStorage` keyed by `${agencyId}:${tabId}`) for v1 — the demo agency itself is short-lived, so server-side dismissal tracking is not worth it.

Where to put the copy: a single map `frontend/lib/demo-guide-copy.ts` mapping tab identifier → string, lifted directly from the PRD. One source of truth makes tweaks trivial.

### 4. Sample alert + resolution thread

The PRD calls out "Sample alert and resolution" as a requirement. The seeded historical alerts (Backend §2 step 4) cover this — at least one should already be in `Resolved` status with a resolution note so users navigating to the Alerts tab see a complete worked example without having to click the "Test a live alert" button first.

## Implementation order

1. **Migration + entity + AgencyModel + `/me`** (smallest unblocking change — the "field in the DB" the user named).
2. **`DemoAgencyService.provision` + `POST /agency/demo`** — manually verify by hitting the endpoint and logging in as the seeded admin.
3. **`POST /alerts/demo-trigger`** + frontend top-bar button.
4. **Feature-guide copy + tooltips.**
5. **Polish:** seeded "resolved" alert, copy review with Chris/Shivani, super-admin UI for triggering demo creation if Mike doesn't want to keep curl-ing.

Each step is shippable independently — step 1 alone is the field-in-the-DB foundation; step 2 makes the field useful; steps 3–4 deliver the experience.

## Open Questions

1. **Column naming convention.** `agency` has historical drift — recent migrations use camelCase (`isMfaEnabled`), older ones use PascalCase (`DeviceAlertEmails`). CLAUDE.md prescribes PascalCase. This plan picks `isDemo` (camelCase) to match the recent pattern and the entity property. Worth a quick decision before merging — alternative is `IsDemo` and updating the entity property to match.
2. **Demo expiry / cleanup.** Demo agencies will accumulate. Do we want `demoExpiresOn DATETIME NULL` + a daily sweep that soft-deletes expired demos and revokes their Cognito users? Likely yes, but not v1. Add a follow-up plan if we ship and start hitting noise.
3. **Demo agency naming collisions.** If the same prospect requests two demos, do we suffix `(Demo 2)`, error out, or silently re-issue credentials to the existing demo? Default: error with "demo already exists for this email — contact mike@heylo.tech to reset." Easy to relax later.
4. **Alert simulator fidelity.** Does the existing realtime fanout require `deviceId` / `eventLogId` references on `Alert`? If yes, the demo trigger needs sample devices/events seeded too — small addition, but worth confirming before writing the trigger endpoint. Trace one real alert insert end-to-end during step 3.
5. **Sales-ops UX.** Is curl / a Postman call enough for sales to trigger a demo, or do we want a tiny super-admin form in the operator console? Skipping in v1 — add in step 5 polish if it becomes friction.
6. **Sample resident PII.** Use obviously-fake names (e.g. "Sample Resident — Alex M."). Don't reuse real customer data. Confirm with product before shipping copy.
