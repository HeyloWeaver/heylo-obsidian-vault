---
type: index
tags: [tablet, domains]
owner: Mike
updated: 2026-04-22
status: current
---
# Tablet — Domain Playbooks

Index of domain-specific playbooks for targeted Tablet work.

- **Calls:** [[Tablet/Domain - Calls]]
- **Chat:** [[Tablet/Domain - Chat]]
- **Kiosk & Device:** [[Tablet/Domain - Kiosk]]

Pairs with [[Tablet/Agent Work Guide]], [[Tablet/High Level Overview]], and [[Tablet/Onboarding Walkthrough]] for broader architecture context.

For cross-cutting reference material:
- [[Tablet/Bootstrap & Module Wiring]] — startup sequence, no-DI pattern.
- [[Tablet/WS Contract]] — backend ↔ tablet WebSocket event contract.
- [[Tablet/Stream Patterns Cookbook]] — rxdart recipes used throughout the codebase.
- [[Tablet/DataState Pattern]] — the Result/Either pattern returned by every HTTP wrapper.
- [[Tablet/Kiosk Service Reference]] — platform channel surface to native Android.
- [[Tablet/Native Layer]] — Java-side reference (KioskManager, Watchdog, receivers).
- [[Tablet/Logging Stack]] — CloudWatch + Waypoint paths.
- [[Tablet/Update Service]] — Play Store + self-hosted sideload OTA mechanisms.

For deeper feature traces:
- [[Tablet/Chat Pipeline]] — end-to-end conversation flow.
- [[Tablet/Video Call View]] — Daily SDK event handlers + the four timers in the call screen.
- [[Tablet/Voice Commands]] — wake-word + STT/TTS state machine.

For incident response:
- [[Tablet/Diagnostic Runbook]] — symptom → cause → fix lookup.
