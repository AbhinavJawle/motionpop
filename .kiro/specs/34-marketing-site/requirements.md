# Spec 34 · Marketing site (requirements)

> Written in a Claude Code session (`claude-opus-5-5`), 2026-11-22. Founder ask: "write the marketing copy for our marketing site. both hackathon relevant … design our marketing site. heavily inspired by capy.ai … use the animated Pip files … use the pip-cta button in the hero. make the main site very good."

## R1 Direction
- R1.1 THE landing page SHALL follow capy.ai's comic-panel language (white paper, black ink outlines, condensed caps headlines, monospace body, hard-shadow buttons, slanted panels, halftone, speech bubbles, a mascot breaking out of frames), translated into a storyboard for video: film-strip nav, timecodes on panels, our ember and Pip blue.
- R1.2 Pip SHALL appear animated: the plush Pip on the hero sign-up button (`SignupCTA`), the clapperboard Pip on the product frame and in the closing call, and the juggling Pip in the how-it-works strip.

## R2 Content
- R2.1 THE copy SHALL live in one module (`components/landing/copy.ts`) and cover hero, phrase ticker, product frame notes, how it works, looks, hybrid AI, Pip plans, features, audiences, the stitched-together build story, pricing, FAQ, closing call and footer.
- R2.2 THE copy SHALL be relevant to both hackathons: hybrid on-device + cloud AI through Firebase AI Logic (#BuildHybridAI) and a friendly ghost, "stitched together" build made with Kiro (Kiroween, Frankenstein).
- R2.3 Every claim SHALL match the product (only built graphic types, formats, prices from `APP_CONFIG_DEFAULTS`; no transparent export claim).

## R3 Behaviour
- R3.1 Signed out, every call to action SHALL go to `/sign-in?next=/start`; signed in, to `/dashboard`, and "Sign in" is hidden.
- R3.2 Animated Pips SHALL be transparent loops (VP9 alpha WebM) with a still fallback where the browser can't show alpha video or the visitor prefers reduced motion.
- R3.3 THE page SHALL work from 390 px to 1920 px wide, with visible keyboard focus and no horizontal scroll.

## R4 Verification
- R4.1 Unit tests cover the call-to-action targets and the price list; typecheck and lint clean.
- R4.2 Screenshots at 1440 and 390 are reviewed.
