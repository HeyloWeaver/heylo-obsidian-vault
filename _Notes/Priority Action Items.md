---
type: action-list
tags: [engineering, audit, action-items, frontend, backend]
owner: Mike
updated: 2026-04-21
status: current

source: "[[Codebase Audit – Full Stack Architecture Review]]"
related:
  - "[[Mike's Architecture Notes]]"
  - "[[Agent Work - Start Here]]"
---

- caseload beta fixture data — track the TODO to move to live GraphQL data; don't let it ship to production as a fixture
 
- Remove dead Redux/Jotai dependencies from frontend — bundle size and confusion tax
- Add/update READMEs
- ffmpeg.wasm — audit whether it's actually used; if not, remove (massive bundle weight)
