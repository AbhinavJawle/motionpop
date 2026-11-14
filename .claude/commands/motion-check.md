Run the motion quality check for component: $ARGUMENTS

1. Run `pnpm motion:check $ARGUMENTS` (all formats, fixture + random params).
2. Open the generated stills in `tmp/motion-check/$ARGUMENTS/` and the JSON report.
3. Review against `.kiro/steering/motion-principles.md` and `component-library.md`: overflow, overlaps, safe areas, contrast, hierarchy, timing (key moment lands on time), data honesty.
4. List problems by severity, fix them in the component, re-run until clean. Summarise what changed.
