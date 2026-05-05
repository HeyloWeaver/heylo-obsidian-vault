---
status: proposed
owner: Mike
created: 2026-05-05
branch: mw/hey-304
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

> **Working branch:** `mw/hey-304` in both `frontend/` and `backend/`. All commits for this plan land there until the feature ships.

Stand up an interactive demo experience for prospective customers: instead of shipping physical demo kits, a customer requests a link, we provision a **real Heylo agency flagged `isDemoAgency = true`** with sample sites, residents, and alerts seeded in, and send them a normal login + temp password. They click the link, log in, and see in-app feature guides plus a "Test a live alert" button.

A demo agency is a **fully provisioned, real agency** — same `AgencyService.create` path as any other customer (full AWS / IoT / SSM / Secrets Manager). The `isDemoAgency` flag is a UX-only gate. When the prospect signs as a customer, sales flips `isDemoAgency = false` and the live experience takes over instantly with no backend reprovisioning needed: their data, team members, and infrastructure all carry forward.

The wedge change is a single column on `agency` — `isDemoAgency` — that gates the demo-only UI affordances (feature guides + alert simulator).

## Goal

A super-admin (or sales op) calls `POST /agency/demo` with `{ customerName, contactName, emailAddress }`. The backend creates a real agency (full AWS provisioning) flagged `isDemoAgency = true`, plus a sample site, sample residents (resident-role users), a few historical alerts (including at least one `Resolved` alert with a resolution note), and an Agency Admin user with a Cognito temp password. The prospect receives the standard invitation email and goes through the normal complete-registration flow. Once inside, the operator console reads `agency.isDemoAgency` from the current-agency state and renders:
- a top-bar "Test a live alert" button that inserts an `Alert` row directly and fans out the same realtime event a real device alert would, and
- per-tab feature-guide tooltips matching the PRD copy.

When the prospect converts: super-admin calls `PATCH /agency/:id/demo` with `{ isDemoAgency: false }`. The flag flips, the demo UI affordances disappear, and the same agency continues as a regular customer. No data migration, no reprovisioning, no new credentials.

Real production usage for non-demo agencies is unchanged because every demo behavior is gated on `isDemoAgency`.

## Definition of Done

- New lookup table `agencystatus` (`Id INT AUTO_INCREMENT`, `Name VARCHAR(100) UNIQUE`) seeded with rows `'Live'` and `'Demo'`. IDs are not hardcoded anywhere — code looks rows up by `name` via the `AgencyStatusName` enum.
- New column `agency.statusId INT NOT NULL` with FK to `agencystatus(Id)`. Existing agencies are backfilled to `Live` in the same migration.
- `Agency` entity exposes `statusId` and an eager-loaded `status: AgencyStatus` relation; `AgencyModel` carries both. Because [`userrole.entity.ts:49`](backend/src/entities/userrole.entity.ts#L49) already eager-loads `agency`, the new eager-loaded `status` flows through `/user/my` to the frontend without service changes.
- New endpoint `GET /agency/statuses` (super-admin) returns all status rows so the UI can build a dropdown by name (no hardcoded IDs in the client).
- New endpoint `PATCH /agency/:id/status` (super-admin) accepts `{ statusId: number }` and updates the FK. This is the "convert demo to live" / "convert live to demo" toggle. Returns `{ id }` per project rules.
- New agencies created via `AgencyService.create` default to `Live` (looked up by name inside the create transaction).
- Super-admin agency-update modal renders a Status dropdown populated from `GET /agency/statuses`. When the operator changes status from `Live` → `Demo`, a confirmation modal blocks submit until they confirm; cancel reverts the dropdown.
- A user whose current agency has `status.name === 'Demo'` sees an in-product Demo Tour Step 1 dialog the first time they land on `/dashboard`, explaining the profile/account menu (PRD copy lifted verbatim). State is **not** persisted in v1 — every dashboard mount triggers it. Persistence is a follow-up.
- Future endpoints in the broader plan (demo provisioning, alert simulator, feature guides on other tabs) gate on `agency.status.name === AgencyStatusName.Demo` instead of a boolean flag.

## Status of this plan vs. shipped work

**Shipped (this PR):** lookup table + migration, entity/model/mapping wiring, status default on create, `GET /agency/statuses`, `PATCH /agency/:id/status`, super-admin Status dropdown with Live→Demo confirmation, dashboard Demo Tour Step 1.

**Not shipped yet (covered later in this plan):** `POST /agency/demo` provisioning endpoint, sample-data seeding, alert simulator (`POST /alerts/demo-trigger`), per-tab feature guides beyond Step 1.

## Scope Boundaries (what we are NOT doing)

- **Not building public demo self-service.** Super-admin / sales-ops triggers creation through an internal form on the existing super-admin agencies page (see Frontend §5). We are not exposing a public "request demo" form on the marketing site — that can come later and call the same endpoint.
- **Not implementing demo-agency expiry / cleanup.** Demo agencies are real agencies. Either the prospect converts (flip `isDemoAgency` off, agency continues as a paying customer) or the demo is no longer wanted (super-admin soft-deletes via existing agency delete path). No automated sweep or `demoExpiresOn` column.
- **Not adding a tour library** (react-joyride / shepherd / driver.js). Per-feature copy is short and tab-scoped — render as simple dismissible MUI tooltips/banners next to each tab's main content. Revisit if product wants multi-step coachmarks.
- **Not changing customer-onboarding/.** Despite the name, that app is lead-intake (CustomerOnboarding entity, share-Cognito user); it does not provision agencies and is unrelated to this work.
- **Not touching `tablet/` or `hub/`.** Demo runs entirely in the operator console. Demo agencies *can* in principle have a real hub paired later (post-conversion) since they were fully provisioned, but we don't ship one for the demo itself.
- **Not building bulk demo creation** (e.g. "spin up 10 demos for a trade show"). One at a time.

## Schema change (the "field in the DB")

Migration [`1778000000000-add-agencystatus-table-and-agency-statusid.ts`](backend/src/migrations/1778000000000-add-agencystatus-table-and-agency-statusid.ts) follows the lookup-table-plus-FK pattern from [`1761006971793-add-alerttype-table-and-alert-alerttypeid.ts`](backend/src/migrations/1761006971793-add-alerttype-table-and-alert-alerttypeid.ts):

```sql
-- up
CREATE TABLE agencystatus (
  Id INT NOT NULL AUTO_INCREMENT,
  Name VARCHAR(100) NOT NULL,
  PRIMARY KEY (Id),
  UNIQUE KEY UQ_agencystatus_Name (Name)
);

INSERT INTO agencystatus (Name) VALUES ('Live'), ('Demo');

ALTER TABLE agency ADD COLUMN StatusId INT NULL;
UPDATE agency SET StatusId = (SELECT Id FROM agencystatus WHERE Name = 'Live');
ALTER TABLE agency MODIFY COLUMN StatusId INT NOT NULL;
ALTER TABLE agency ADD CONSTRAINT FK_agency_agencystatus FOREIGN KEY (StatusId) REFERENCES agencystatus(Id);
```

The auto-increment IDs are intentional (matches the `alerttype` precedent) — no UUID hardcoding, and the backfill `UPDATE` looks up the `Live` row by `Name` so no migration code references a literal ID. Application code references statuses via the `AgencyStatusName` enum and looks up rows by name.

Entity additions:
- New [`agency-status.entity.ts`](backend/src/entities/agency-status.entity.ts) (numeric `id`, `varchar(100) name`, `OneToMany → Agency`).
- [`agency.entity.ts`](backend/src/entities/agency.entity.ts) gains `statusId: number` plus `@ManyToOne(() => AgencyStatus, { eager: true })` so `/user/my` carries the status name to the client through the existing eager `userrole.agency` chain.
- [`agency-status-name.ts`](backend/src/domain/enums/agency-status-name.ts) enum with `Live`, `Demo` — used everywhere status is compared by name in code.

Add to [`agency.entity.ts`](backend/src/entities/agency.entity.ts):

```ts
@Column({ default: false })
@AutoMap()
isDemoAgency: boolean;
```

Mirror on `AgencyModel` (`backend/src/domain/models/agency.model.ts`) and any DTOs surfaced to the frontend `/me` payload.

> **Convention note.** New column is camelCase (`isDemoAgency`) to match the dominant pattern on the `agency` table (`isMfaEnabled`, `canShiftabilityAccess`, `isDeleted`, `createdOn`) and across other entities (`agencyId`, `siteId`, `deviceId`, `reportedOn`). [`CLAUDE.md`](CLAUDE.md) and [`_Engineering/Backend/Agent Work Guide.md`](_Engineering/Backend/Agent Work Guide.md) previously prescribed PascalCase — both have been corrected as part of this plan to match actual codebase convention.

## Backend implementation

### 1. Migration + entity

- New migration `<timestamp>-add-isdemo-to-agency.ts` mirroring the MFA migration shape.
- Column on [`agency.entity.ts`](backend/src/entities/agency.entity.ts) per snippet above.
- Surface on `AgencyModel` and on whatever the frontend reads from `/me`. Audit `agency-mapper`/profile registrations to ensure the new field flows through AutoMapper.

### 2. New service: `DemoAgencyService`

New file [`backend/src/services/demo-agency.service.ts`](backend/src/services/demo-agency.service.ts). Composes the existing real-agency provisioning path — does **not** fork it.

```ts
async provision({ customerName, contactName, emailAddress }): Promise<{ id: string }> {
  // 1. If a demo already exists for this email, re-issue credentials instead
  //    of creating a duplicate agency. touchCognitoUser already creates-or-resets,
  //    so this is just: find existing admin user → re-touch → re-send invitation.
  const existing = await this.findExistingDemoForEmail(emailAddress);
  if (existing) {
    const tempPassword = await this.awsSvc.touchCognitoUser(existing.adminUserId, emailAddress);
    await this.authSvc.sendInvitation(existing.adminUser, tempPassword);
    return { id: existing.agencyId };
  }

  // 2. Real agency (full AWS provisioning) via the existing path.
  //    AgencyCreateRequestDto already accepts isDemoAgency via the new flag plumbing.
  const agency = await this.agencySvc.create({
    name: `${customerName} (Demo)`,
    contactName,
    emailAddress,
    phoneNumber: '',
    address: '',
    isMfaEnabled: false,
    isDemoAgency: true,                       // ← only differentiator vs. a normal agency
    deviceAlertEmails: null,
    thirdPartyUsername: contactName,
  });

  // 3. Seed sample data + admin user inside one transaction.
  return this.dataSource.transaction(async (manager) => {
    const site = manager.create(Site, { agencyId: agency.id, name: 'Sample Site', /* … */ });
    await manager.save(site);

    const residents = await this.seedResidents(manager, agency.id, site.id);
    await this.seedAlerts(manager, agency.id, site.id, residents); // includes one Resolved w/ resolutionNote

    const adminUser = await this.userSvc.createWithRole(manager, {
      agencyId: agency.id,
      roleId: RoleId.agencyAdmin,
      emailAddress, firstName: contactName, /* … */
    });
    const tempPassword = await this.awsSvc.touchCognitoUser(adminUser.id, emailAddress);
    await this.authSvc.sendInvitation(adminUser, tempPassword);

    return { id: agency.id };
  });
}

// Lookup: find a non-deleted Agency where isDemoAgency = 1 and contactEmail matches,
// joined to its Agency Admin user. If found, return ids. Otherwise null.
private findExistingDemoForEmail(emailAddress: string): Promise<{ agencyId, adminUser, adminUserId } | null>
```

The collision path uses [`AwsService.touchCognitoUser`](backend/src/services/aws.service.ts#L851-L908) which already handles "create or reset to a fresh temp password" — so re-issuing credentials is a single call, not a new flow.

Sample data lives in a fixtures helper [`backend/src/services/demo-agency-fixtures.ts`](backend/src/services/demo-agency-fixtures.ts) (resident names, alert types, severities, the resolution note) — keep it readable, not procedurally generated.

> **AWS provisioning is intentional.** Demo agencies get the full hub/IoT/SSM/secrets stack from `AgencyService.create` so flipping `isDemoAgency = false` later is a one-column update with zero infrastructure follow-up. The cost is a few unused IAM/SSM resources per outstanding demo — accept it for the conversion ergonomics. If demo volume gets noisy, revisit cleanup.

### 3. Endpoints

[`backend/src/controllers/agency.controller.ts`](backend/src/controllers/agency.controller.ts) — add:

```ts
@Post('demo')
@RequireRoles(RoleId.superAdmin)
async createDemo(@Body() dto: CreateDemoAgencyDto): Promise<{ id: string }> {
  return this.demoAgencySvc.provision(dto);
}

@Patch(':id/demo')
@RequireRoles(RoleId.superAdmin)
async setDemoFlag(
  @Param('id') id: string,
  @Body() dto: SetDemoFlagDto,
): Promise<{ id: string }> {
  return this.agencySvc.setDemoFlag(id, dto.isDemoAgency);
}
```

DTOs: `CreateDemoAgencyDto` = `{ customerName, contactName, emailAddress }` (validated); `SetDemoFlagDto` = `{ isDemoAgency: boolean }`. Returns `{ id }` per project rules. The `PATCH` is the "convert to live customer" toggle — single-column update inside a `manager.transaction(...)`, no other side effects.

### 4. Test-alert endpoint

```
POST /alerts/demo-trigger
```

Approach: **direct insert of an `Alert` row, then emit the same realtime event the production path emits.** No fork of the device ingestion pipeline.

- Reads caller's `agencyId` from context, loads the agency, **rejects with 403 if `agency.isDemoAgency !== true`**.
- Inserts an `Alert` directly with `deviceId = null` ([`alert.entity.ts:27-29`](backend/src/entities/alert.entity.ts#L27-L29) confirms the column is `char` nullable, so no sample device seeding is required), `agencyId` from context, `siteId` = the seeded sample site, `status = AlertStatus.Active`, `priority = AlertPriority.High`, `reportedOn = new Date()`, `number` from whatever sequence the production alert insert uses.
- Calls into [`websocket.service.ts`](backend/src/services/websocket.service.ts) to emit the same event shape device-originated alerts currently emit (trace from a real alert insert to the WS emit during implementation — confirm the event name and payload before wiring). The frontend's existing `EventHub` listener handles the rest: toast, audio, bottom-left card.
- Adapts the logic in [`backend/scripts/test-alert.ts`](backend/scripts/test-alert.ts) (which already does most of this for a script context) into a service method.

### 5. `/me` payload

Confirm the endpoint that hydrates `currentAgency` on the frontend (likely `/me` or `/auth/session`) includes `isDemoAgency`. If not, add it — small addition, no breaking change.

## Frontend implementation

### 1. Read `isDemoAgency` from current-agency state

Plumb `isDemoAgency` through the Zustand store or existing provider that holds the current agency. Single boolean.

### 2. "Test a live alert" button

A top-bar button rendered iff `currentAgency.isDemoAgency`. On click → `POST /alerts/demo-trigger` → rely on the existing realtime listener to surface the alert toast / bottom-left card the PRD describes ("When an alert occurs, it will appear initially at the bottom left corner"). No new UI for the alert itself — that path already exists.

### 3. Feature-guide tooltips

For each top-level tab (Dashboard, Users, Alerts, Communication, Sites, Caseload Management, My Schedule, Heylo Support) and the Account/Profile menu, render a small dismissible info banner or MUI `Tooltip` next to the tab's primary heading with the PRD copy verbatim. Gated on `currentAgency.isDemoAgency`.

Persistence: dismissals can be local-only (`localStorage` keyed by `${agencyId}:${tabId}`) for v1 — the demo agency itself is short-lived, so server-side dismissal tracking is not worth it.

Where to put the copy: a single map `frontend/lib/demo-guide-copy.ts` mapping tab identifier → string, lifted directly from the PRD. One source of truth makes tweaks trivial.

### 4. Sample alert + resolution thread

The PRD calls out "Sample alert and resolution" as a requirement. The seeded historical alerts (Backend §2 step 4) cover this — at least one should already be in `Resolved` status with a resolution note so users navigating to the Alerts tab see a complete worked example without having to click the "Test a live alert" button first.

### 5. Super-admin "Create demo agency" form

Drop a new modal next to the existing super-admin agency tooling on [`frontend/app/(private)/agencies/`](frontend/app/(private)/agencies/), reusing the patterns from [`frontend/components/agency/create-modal.tsx`](frontend/components/agency/create-modal.tsx):

- New file [`frontend/components/agency/create-demo-modal.tsx`](frontend/components/agency/create-demo-modal.tsx) — three fields (`customerName`, `contactName`, `emailAddress`), submit calls `agencyService.createDemo(...)` → `POST /agency/demo`. On success, toast `"Demo created — invitation sent to {emailAddress}"` and close.
- Add a "Create demo" button to the agencies list page header alongside the existing "Create agency" button.
- Re-issue path (existing email): the backend returns `{ id }` for the existing demo agency too (see Backend §2). Show a toast `"Demo already existed for {emailAddress} — fresh credentials sent"` so the operator knows nothing new was created. Distinguish via a small `wasReissued: boolean` on the response, or by comparing `agencyId` to a pre-call lookup — pick whichever is simpler when wiring (`wasReissued` is probably cleaner since it's one extra boolean).
- "Convert demo to live" affordance: on the agency details page (`frontend/components/agency/details/`), when `agency.isDemoAgency`, render a small banner `"This is a demo agency. [Convert to live customer]"`. The link calls `PATCH /agency/:id/demo` with `{ isDemoAgency: false }` and re-fetches.

## Implementation order

1. **Migration + entity + AgencyModel + current-agency payload** — smallest unblocking change (the "field in the DB").
2. **`DemoAgencyService.provision` + `POST /agency/demo` + `PATCH /agency/:id/demo`** — manually verify by curl-ing the endpoint and logging in as the seeded admin. Confirm full AWS provisioning runs (hub policy, IoT alias, SSM, secrets) so the conversion path is a no-op.
3. **`POST /alerts/demo-trigger`** + frontend top-bar button. Trace the production WS event during this step.
4. **Feature-guide copy + tooltips.** Lift PRD copy verbatim into [`frontend/lib/demo-guide-copy.ts`](frontend/lib/demo-guide-copy.ts); render dismissible MUI banners on each tab gated by `currentAgency.isDemoAgency`.
5. **Super-admin "Create demo" modal + "Convert to live" banner** on the agencies super-admin pages (Frontend §5).

Each step is shippable independently — step 1 is the field-in-the-DB foundation; step 2 makes the field useful; steps 3–5 deliver the prospect-facing experience and the sales-ops UX.

## Resolved Decisions

1. **Column naming.** `isDemoAgency` (camelCase). Follows actual codebase convention; CLAUDE.md and Backend Agent Work Guide have been corrected to match.
2. **Demo lifecycle = real-agency lifecycle.** Demo agencies get full AWS provisioning and convert to paying customers via `PATCH /agency/:id/demo` flipping the flag. No `demoExpiresOn`, no sweeper, no separate cleanup job. If a demo never converts, super-admin soft-deletes it through the existing agency delete flow.
3. **Alert simulator approach.** Direct `Alert` row insert with `deviceId = null` + emit the same realtime event the production path emits. No sample-device seeding required (column is nullable per [`alert.entity.ts:27-29`](backend/src/entities/alert.entity.ts#L27-L29)). Trace the production WS event during implementation and reuse it verbatim.
4. **Collision policy: re-issue credentials.** If a demo already exists for the requested email, the endpoint re-touches the existing admin's Cognito user (fresh temp password) and re-sends the invitation email — no new agency created. Response includes `wasReissued: true` so the super-admin UI can render the right toast.
5. **Sales-ops UX: super-admin form.** New "Create demo" modal on the existing super-admin agencies page ([`frontend/app/(private)/agencies/`](frontend/app/(private)/agencies/)) plus a "Convert to live customer" banner on the agency details page when `isDemoAgency === true`. Detailed in Frontend §5.
6. **Sample resident PII: obviously-fake names.** Use names like "Sample Resident — Alex M." in [`backend/src/services/demo-agency-fixtures.ts`](backend/src/services/demo-agency-fixtures.ts). Never reuse real customer data.
