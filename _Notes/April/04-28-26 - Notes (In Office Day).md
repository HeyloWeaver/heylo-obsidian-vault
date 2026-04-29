### Hub Work
In-office to set up hub w/ Shivani
Follow directions for provisioning a new hub
https://docs.google.com/document/d/1yCiwXeAYnSbHdlcmMivtPL3_H93JRM8FxVzTcQTBRP4/edit?tab=t.0#heading=h.cadsil9fqrrq

Got a hub, camera, etc. to set up at home
Used separate wifi at home, `heylo-provisioning` 
#### mac-specific sh command for imaging
Can't use current workflow on mac, can vibe something for mac-specific
`inject-wic.sh` depends on Linux `losetup` and ext4 mounts, which do not work on stock macOS - we fixed it.
https://github.com/heylo-tech/hub/pull/33
##### @follow-up ^ show to chris

---
### Caseloads
Chris is going to provide a new "create" endpoint
We can use our changes from old PR: https://github.com/heylo-tech/frontend/pull/53

#### Update: Requirements
https://linear.app/heylo-tech/issue/HEY-366/caseload-creation-redesign
Working branch: https://github.com/heylo-tech/frontend/compare/mw/caseloads-add?expand=1

Need `isOvernight`
WIP: Did some guessing on UI based on schema

### Ticketing
https://linear.app/heylo-tech/issue/HEY-330/update-customer-support-ticketing-system-ui
Review code, and Plan: [[Support Ticketing UX v2]]
#### Working branches
https://github.com/heylo-tech/backend/compare/mw/support-updates?expand=1
https://github.com/heylo-tech/frontend/compare/mw/support-updates?expand=1

#### @TODO
need a way to see the status of current tickets 
- New Page
Note: we send agencyId and it translates to backend to get data from intercom
###### In code
KEEP critical - pull descriptions from form in intercom
###### In intercom
Need to **add** "Recency" field to every ticket type
Need to remove stub @todo in frontend PR

---
### Notifications Messages
First PR merged WOO!

#### Requested updates
https://linear.app/heylo-tech/issue/HEY-390/add-unread-badge-to-active-chats-right-panel
PR: https://github.com/heylo-tech/frontend/pull/60/changes

---
## Backlog

### Device Normalization
@todo follow up with chris

### Tablet Work (RE: Standup)
will come later this week