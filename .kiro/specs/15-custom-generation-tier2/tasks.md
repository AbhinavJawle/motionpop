# Spec 15 · tasks

- [x] 1. `custom` component: params, guarded build, helpers, scoped CSS, registry entry; seek-purity test with the example script. — R2.4, R3.1
- [x] 2. `lintCustom` + table test. — R2.2
- [x] 3. `custom.compose` task, prompt v1 with the example, JSON schema, `check` → repair; tests. — R2.1, R2.3, R4.1
- [x] 4. `generateCustom` + `applyCustom` command, refund on failure, fake-router answer; tests. — R1.2, R3.3
- [x] 5. Prompt box "Custom" button with the cost chip, generating copy; preview opaque sandbox when a custom slot exists. — R1.1, R1.3, R3.2
- [ ] 6. **[kiro]** Export parity: a project with a custom slot renders the same stills in preview and render (spec 08 parity cases); motion:check accepts custom slots. — R3.1

_Built (Claude Code, 2026-11-16): tasks 1–5 with the fake router end to end (screenshots in 16:9 and 9:16). Not yet: a run-time determinism probe in the sandbox at generation time (lint + shadowed globals only), the Claude server route (R4), and a real model call (needs the founder's go-ahead)._
