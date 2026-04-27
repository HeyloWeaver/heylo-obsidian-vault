---
type: standup
tags: [standup]
owner: Mike
created: 2026-04-27
status: current
---

Invited [Shivani Patel](mailto:spatel@heylo.tech) [ritwik@buildvessel.com](mailto:ritwik@buildvessel.com) [Brian Hart](mailto:bhart@heylo.tech) [Christopher Baron](mailto:cbaron@heylo.tech) [mweaver@heylo.tech](mailto:mweaver@heylo.tech)

### Summary

First week review with Michael Weaver confirmed good progress, with updates on the inventory platform and provisioning application development prioritized for upcoming customer installs.

Michael Weaver is successfully onboarding and has pushed initial code, with current work focused on the second version of case loads, estimated about 75% complete. Case loads proved more complex than anticipated, and Christopher Baron and Michael Weaver may need to re-evaluate some implementation aspects. Super users now have the calendar view, which is being enhanced.

The inventory platform backend is merged and ready to go live once QR code generation for the ZPL barcode system is finalized. The provisioning platform is being developed to automatically link devices during customer onboarding via a provisioning plan, which is critical for reducing user errors and scaling installs.

The team is anticipating about seven new installs in the next two months, including three customers starting onboarding this week, which creates urgent need for help on provisioning. Major engineering priorities include iterating on case loads, fixing system roles, and improving customer support (ticket creation and tracking). Shivani Patel is working through contract details for offshore support, planning an operations dashboard for install visibility, and noted strong traction from the Anchor conference.

### Next steps

- [ ] [Ritwik Rastogi] Email Template: Forward the new email template copy to Shivani Patel.

- [ ] [Shivani Patel] Review Email: Look at the new email template provided by Ritwik.

- [ ] [Shivani Patel] Test Intake: Create one more intake form for testing purposes.

- [ ] [Shivani Patel] Share Link: Share the customer intake form link directly with customers after confirming functionality.

- [ ] [Ritwik Rastogi] QR Code: Finish the QR code generation implementation for the inventory system.

- [ ] [Michael Weaver, Christopher Baron] Wrap PRs: Finish Michael Weaver’s outstanding pull requests early this week.

- [ ] [Michael Weaver] Improve Support: Enhance the customer support ticket creation experience.

- [ ] [Michael Weaver] Track Tickets: Implement functionality enabling users to track existing support tickets.

- [ ] [Christopher Baron] Reassign Roles: Work on adding role reassignment functionality to the system.

- [ ] [Christopher Baron] Fix User Creation: Resolve the bug preventing the creation of non-agency-associated users early this week.

- [ ] [Christopher Baron] Tablet Call Feature: Begin developing the new tablet version to support forced night calls with a black screen.

- [ ] [Michael Weaver] Assist Tablet Testing: Help Christopher Baron test the new tablet update and become familiar with the relevant code.

- [ ] [Christopher Baron] Tablet Fixes: Implement tablet updates addressing the startup bricking bug, Wi-Fi resetting, and ensuring system apps are visible.

- [ ] [Ritwik Rastogi] Test Tablet Fixes: Test the implemented tablet updates including the startup bug fix and system app visibility.

- [ ] [The group] Track Bugs: Ensure all discovered bugs are tracked in Linear per development cycle.

- [ ] [Shivani Patel] Define Support UI: Provide front-end design and product input details for the customer support experience.

- [ ] [Shivani Patel] Create Ops Dashboard: Create an operations dashboard to provide visibility into upcoming customer installs and onboarding status.

- [ ] [Shivani Patel] Test Magnetic Mount: Test the magnetic camera mount in the office for camera stability improvement.

### Details

- Weather and informal open: Brief discussion of weather in Columbus; Fahrenheit/Celsius conversion came up in passing.

- Michael Weaver first week: Shivani Patel led a check-in; Michael reported a good first week, working hard to ramp up and already shipping code. Christopher Baron noted super users have the calendar view and that work continues there.

- Onboarding and case loads: Michael recapped onboarding (product familiarity, tablet setup), estimated case loads v2 at roughly 75% complete, and mentioned smaller tasks such as renaming devices and showing unread messages for administrators. Shift boundary behavior (when a user’s shift ends and another starts) still needs testing end-to-end with the rest of the system.

- Inventory platform: Ritwik Rastogi reported backend merged; platform largely finished and blocked on barcode flow. ZPL printing script works; QR generation and insertion into the ZPL layout remain. Going live on inventory depends on completing QR for the full provisioning flow.

- Provisioning platform: Ritwik described creating a provisioning plan (residents, devices) from onboarding, checklist-driven provisioning for provisioners, and automatic linking of devices to the plan. Christopher Baron emphasized value for auto-associating cameras with Reolink, Home Assistant, and inventory, reducing errors and improving tracking.

- Intake form and email: Shivani confirmed the customer-facing intake form is done; Ritwik added new email template copy for the form. Christopher mentioned an adjustment still needed for the SCES section of the onboarding email to sync with the team.

- Priorities this week: Christopher outlined continuing case load iteration toward create/assign and a shareable version by end of week, backend bug cleanup, and front-end speed. After Michael wraps open PRs, focus shifts to customer support UX (ticket form improvements, ticket tracking), with a PRD handoff from Shivani.

- System roles and tablet roadmap: Christopher prioritized fixing non-agency user creation and starting a new tablet build with forced night calls and a fully black screen to support IR/sleep-position monitoring. Ritwik asked for fixes for tablet startup bricking, Wi-Fi issues tied to hiding system apps, and system app visibility; Christopher committed to the work with Michael helping test and learn the tablet codebase.

- Process and support ops: Shivani stressed tracking all bugs in Linear per cycle. Design/product input for customer support front end is still pending from Shivani; backend direction for support workflows is clearer. Contract work continues on Philippines offshore support (three people). About seven installs expected over ~two months, with June called out for several; three customers onboarding this week including JCDS (MFA-related work). Regular IT team touchpoints begin (e.g., initial call for New York install under a large grant). Shivani asked Michael to ramp on full provisioning given install volume.

- Installs and hardware: Shivani plans an ops dashboard for install and onboarding dates; team expects heavy “all hands” around install windows as customers often transition in-home care staff when adopting Halo. Rail camera sticky pads failing at Hope (first customer); magnetic mount trial and a future customer accessories list (chargers, extension cords, etc.) were discussed.

- Anchor conference: Shivani reported the conference went very well, with expectation of more customer traction and workload ahead.

You should review Gemini's notes to make sure they're accurate. [Get tips and learn how Gemini takes notes](https://support.google.com/meet/answer/14754931)

How is the quality of these specific notes? [Take a short survey](https://google.qualtrics.com/jfe/form/SV_9vK3UZEaIQKKE7A?confid=FzvpOO4nnAuePaoxI0J7DxIPOAIIigIgABgBCA&detailid=standard&screenshot=false) to let us know your feedback, including how helpful the notes were for your needs.
