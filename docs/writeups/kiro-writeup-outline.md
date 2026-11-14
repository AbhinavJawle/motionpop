# Kiroween write-up outline (fill only with true details from DEV_LOG)

Judges want "next-level understanding of Kiro features". Be specific: names, numbers, examples, what failed.

## 1. What Motionpop is (3–4 sentences)
## 2. Why Frankenstein
Gemini Nano on-device + Gemini cloud + (Claude) + in-browser Whisper + a custom deterministic motion engine + headless-Chrome rendering + Firebase, stitched into one creature.

## 3. How we used Kiro
- **Kiro IDE vs CLI (vs Claude Code, if used):** what each was used for, how they differed.
- **Steering:** list of N steering docs and which made the biggest difference (e.g. motion-principles.md raised component quality; component-contract.md kept every component deterministic). Inclusion modes used (always vs fileMatch).
- **Specs:** N specs; example of one end to end (requirements EARS → design → tasks); how spec-driven compared to vibe coding for big systems (audio pipeline, slot detection, timeline).
- **Hooks:** each hook, its trigger, a concrete moment it saved us (e.g. motion check caught text overflow in 9:16).
- **MCP:** Figma (design → UI), Context7 (fresh Firebase AI Logic docs), Chrome DevTools (visual verification) — what became possible.
- **Property-based testing:** which invariants, which real bug PBT caught that unit tests missed.
- **Powers / custom agents:** if used, what they bundled.
- **Honest friction:** where specs felt slow, where we switched to vibe mode, credit usage strategy.

## 4. Numbers
Specs, tasks completed, hooks, steering docs, property tests, bugs caught by PBT, sessions logged, lines of code.

## 5. What's next
