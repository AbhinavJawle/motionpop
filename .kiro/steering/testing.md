---
inclusion: always
---

# Testing strategy

- **Unit (Vitest)** for core logic, schemas, router, commands, compiler.
- **Property-based (fast-check)**, required for:
  - motion core: `seek(t)` determinism (same t twice → identical DOM state); random seek order equals sequential seeking.
  - eases: `ease(0) = 0`, `ease(1) = 1`, monotonic where expected.
  - slots: never overlap; always within transcript bounds; boundaries snap to word boundaries.
  - timeline commands: `undo(do(s)) == s`; any command sequence keeps the invariants.
  - layout: every text box inside the safe area for random params and every format.
  - credits: balance never negative under random concurrent operations.
  - quick-edit patches: a valid patch keeps params valid against the component schema.
  - time helpers: `msToFrame` / `frameToMs` round-trip within one frame.
- **Motion check** (`pnpm motion:check <id>`): renders stills at 0 %, key moment and 90 % for each format with random + edge-case params; asserts no overflow, no overlaps, text contrast ≥ 4.5:1, focal element visible at the key moment.
- **Rules tests** (`@firebase/rules-unit-testing` on the emulator) for Firestore and Storage.
- **E2E (Playwright):** demo path (sample voiceover → slots → generate → preview → export).
- **Design check:** UI screens screenshotted at 1440×900 and compared to `design/screens/*.png`.
- A bug found by a property test gets a regression test and a DEV_LOG note.
