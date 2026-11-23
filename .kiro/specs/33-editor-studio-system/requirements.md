# Spec 33 · Editor studio system (requirements)

> Written in a Claude Code session (`claude-opus-5-5`), 2026-11-22. Founder ask after spec 32: "you kinda only did the timeline … do a complete overhaul and make the ui as masterclass". The design PNGs are old; screenshots of `/editor/demo` are the reference (D-081).

## R1 Tokens
- R1.1 THE SYSTEM SHALL use one neutral graphite ramp (bg, raised, panel, card, card-2, card-3) with no purple tint on surfaces, tracks, selection fills or dialogs.
- R1.2 THE SYSTEM SHALL use radii 8 (chip), 10 (card), 18 (modal) and hairline inset rings instead of heavy borders and glows.
- R1.3 Section labels SHALL be sentence case (no letter-spaced caps) across the editor.

## R2 Chrome
- R2.1 THE top bar SHALL be 48 px: Pip mark, breadcrumb (Projects / title, rename on hover), save status, format pills, history actions, brand kit, credits, Export, account.
- R2.2 THE tool rail SHALL be 64 px with neutral icons; the active tool is a quiet pill, never violet.
- R2.3 Every rail panel SHALL share one header (48 px, 14 px title, hairline) and 16 px gutters.

## R3 Panels and inspector
- R3.1 Styles SHALL be a two-column gallery with a sample in each look's colours.
- R3.2 The Pip panel SHALL have quiet suggestion rows, scope tabs and a composer with a focus ring and a neutral send button (ember stays for Export).
- R3.3 Panel primary actions inside the editor (Brand "Use on this video", Voice confirm) SHALL use the white `solid` button.
- R3.4 The inspector SHALL show "Graphic n · start – end · secs" above a 17 px type picker, a "You said" quote card, the prompt box, quick edit, a hairline value table, Picture, Style, Timing and Versions with consistent 32 px rows.

## R4 Dialogs and dock
- R4.1 Export option cards SHALL be neutral with a white ring for the selection; the Export button stays ember.
- R4.2 Pip's dock bubble SHALL show while Pip works, on hover, or for 4 s after a new message, not permanently.

## R5 Verification
- R5.1 Typecheck, lint and unit tests stay green (pre-existing failures excepted and named).
- R5.2 The editor design check SHALL compare against a studio baseline captured from this build, with tight thresholds.
- R5.3 Screens are checked at 1440×900, 1920×1080 and in 9:16.
