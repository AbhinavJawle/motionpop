Check UI fidelity for: $ARGUMENTS (a route or component)

1. Find the matching screenshot(s) in `/design` and the relevant sections of `.kiro/steering/design-system.md` and `screens.md`.
2. Use the Chrome DevTools MCP (or Playwright screenshot) to capture the running page at 1440×900.
3. Compare: layout, spacing (8 px grid), typography, colours/tokens, glows/highlights, states, copy.
4. List differences ranked by visibility, then fix them. Re-capture and confirm.
