---
inclusion: always
---

# Hackathon compliance (both rulebooks)

## Both
- Public GitHub repo with an OSI licence visible in About (Apache-2.0, D-077).
- No secrets or PII in the repo, submission or test instructions.
- No third-party trademarks, logos, creator names or copyrighted music in the app, demo or video.
- Demo video < 3 min, public on YouTube, English.
- Free judge access: Firebase until Dec 16, 2026; Kiroween until Jan 29, 2027. Keep APIs funded.
- Disclose pre-existing work and third-party resources in `docs/third-party.md`.

## #BuildHybridAI (Firebase): Mon Nov 30, 2026, 23:00 CET (we submit by 18:00)
- Firebase AI Logic imported **and called at runtime** with Gemini Nano hybrid inference (Web/Chrome). App Check required.
- Auth, Firestore, Storage and Remote Config used meaningfully.
- Commits after the deadline are not evaluated: tag `buildhybridai-submission`, keep that deployment live until Dec 16.
- Write-up: how AI Logic is used, features, value proposition. Category bonus: Best Web/Chrome App.

## Kiroween: Fri Dec 4, 2026, 23:00 CET (we submit by 18:00)
- Must be built with Kiro; insufficient use = disqualification. Use Kiro genuinely and log every run in `KIRO_LOG.md`.
- `/.kiro` at the repo root, never gitignored. Category: **Frankenstein**.
- Write-up covers Kiro CLI, specs, steering, hooks, MCP, property-based tests, powers, custom agents, skills: what worked and what didn't.
- Bonuses: Best Startup, **Best Student Project** (solo student), blog post, social post (#KiroweenHackathon26).

## Tool honesty
- Write-ups describe what actually happened, including friction and where Claude Code and Figma AI were used. `DEV_LOG.md` and `KIRO_LOG.md` are the evidence.
- `.kiro` content written in Claude Code sessions is labelled as such in the logs. Kiro runs are never fabricated or back-dated.

## Judge access checklist
Hosted URL works without setup · judge test account (email/password) + Google sign-in · judge plan with generous credits · "Try a sample" voiceover · budgets funded and alerts on through Jan 29, 2027 · Nano flag instructions in the README with cloud fallback.
