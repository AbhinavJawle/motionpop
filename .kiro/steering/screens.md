---
inclusion: fileMatch
fileMatchPattern: ["apps/web/app/**", "apps/web/components/**"]
---

# Screens and states

Written from `design/screens/*.png` and `design/figma-export.css` (2026-11-14). The designs win over this file. Copy in quotes is exact.

| Design | Route |
|---|---|
| `projects.png`, `projects-empty.png`, `projects-drag-over.png` | `/dashboard` |
| `start.png` | `/start` |
| `recording.png` | `/start/record` |
| `editor.png`, `editor-generating.png` | `/editor/[id]` |
| `pip-empty.png`, `pip-conversation.png` | editor left panel "AI" |
| `export.png`, `export-ready.png` | modals in the editor |
| CSS frames "Styles", "Styles · Clean Minimal" | `/styles` (1440×1000) + detail drawer |

Not designed (build in the same language from existing components): Processing, Paste script, Sign in, Landing, Share, Settings, Out of credits, 9:16 editor, on-device/cloud/offline toasts and banner, failed slot.

---

## Dashboard `/dashboard`
- **Top bar:** Pip logo + "motionpop" · nav "Projects" (active, ember underline) · "Styles" · credits chip "✦ 120 credits" (ember sparkle, mono) · "+ New project" (ember, glow) · avatar (Pip face).
- **Header:** eyebrow "YOUR CREATIVE SPACE" (ember) · time-aware greeting: "Good morning/afternoon/evening, {name}" and after 23:00 "Working late, {name}?" · subline (night: "Pip's still up. Let's make something."). Pip floats top-right with an ember glow under him; violet nightcap at night; eyes follow the cursor.
- **Capture bar** (pill, full width): mic in an ember ring + "Hold to record" · divider · "…or paste a script, or drop audio anywhere" · "MP3 · WAV · M4A" (mono, dim) · "⌘K" key. Hold mic → record. Paste text → script flow. Drop anywhere → upload.
- **With projects:**
  - "Continue where you left off": wide card. Left: live looping preview of the last project with "↻ 0:06" chip. Right: "LAST OPENED" (ember), title, "3 of 4 slots ready" + slot dots (mint, last dashed), "Edited 12 minutes ago" (mono), "Resume →" (ember). Pip holding popcorn sits on the card's top edge.
  - Stats strip: 3 tiles with sparklines: "3 videos this week" (ember line), "42 graphics generated" (violet), "~1h 10m saved" (ember).
  - "Your projects" + count badge · search "Search projects" · sort "Last edited ▾" · grid/list toggle · tabs "All projects" / "Shared with me".
  - Project card: thumbnail (plays on hover, "↻ 0:06"), title, duration (mono) · "Edited …", status chip ("Draft" grey, "Exported" mint, "Rendering 64%" violet with spinner), slot dots, ⋯ menu. 3-column grid.
- **Empty:** big card: Pip asleep on a lavender cloud with nightcap and "z z z" · "Your first video is 2 minutes away" · "Hold the mic, paste a script, or just drop your audio here." · "+ Create your first project" (ember) · "No editing experience needed. Just something to say." Hover Pip → one eye opens; click → wakes and points at the capture bar.
- **Drag over:** whole page gets a dashed ember border (rounded, inset). The card turns ember-tinted: pill "Drop it, I'll catch it!" on top, Pip awake with arms open, "Your first video is 2 minutes away", "Release your audio anywhere. Pip will take it from here.", "MP3 · WAV · M4A".
- **Try a style** (all states): "A new point of view for your next story." · "Explore styles ↗" (violet) · 5 cards with live previews: Editorial Explainer "A point of view for every idea." · Dark Money "Make the numbers tell a story." · Clean Minimal "Less noise. More meaning." · Paper Collage "A little rough. Full of character." · Neon Data "Big signals. Bold energy."
- **Footer:** "Made for the stories only you can tell." · "Help & shortcuts".

## Start `/start`
- **Top bar (project):** logo · "‹ Home" · "Untitled Project" + pencil · format pills 16:9 / 9:16 / 1:1 · Brand kit chip · credits chip "⚡ 120" · "? Help" · avatar.
- Pip with ember sound arcs and glow · eyebrow "A LITTLE VOICE. A LOT OF POSSIBILITY." · headline "Bring your voice. We'll bring the motion." · subline "Record, upload or paste a script, and graphics will follow every word."
- Three cards:
  - **Record** (ember icon tile, ember border): "Your voice, in the moment.", ember waveform, "Start recording →" (ember).
  - **Upload voiceover** (violet icon): "Already have the perfect take?", dashed drop zone "Drop your audio or browse" / "MP3, WAV, M4A".
  - **Paste script** (violet T icon): "Start with the words.", input "Every great story starts with…", "We'll generate the voice →" (violet).
- "Or just make a single graphic →" · "No timeline to tame. Just a story to tell."

## Recording `/start/record`
Same top bar. Pip listening (sound arcs) · "PIP IS LISTENING" · "Your voice is the starting point." · "Keep talking. Pip is catching every word." Card: "● RECORDING" (ember) · mic selector "Built-in microphone ▾" · big round stop button (ember fill + ring) "Click to stop" · live waveform (recorded ember, live tail violet) · timer "00:12.8" (mono, large) · feedback "Nice and clear. Keep going." / "A bit quiet, move closer" · "Pause" button · "Discard" link. Below: "Your recording stays here until you're ready." · "Nothing is uploaded until you finish."

## Editor `/editor/[id]`
- **Top bar:** logo · "‹ Home" · "Untitled Project" + pencil · format pills (centre) · undo · redo · history · Brand kit chip · credits chip "⚡ 120" · "Export" (ember gradient, upload icon, ▾) · avatar. (No on-device chip here; route state shows in chips and toasts.)
- **Rail (72):** Voice · AI (active: violet pill) · Styles · Media · Audio · Fonts · Brand · Projects. Bottom: Pip + bubble "3 slots ready" / "Pip is thinking…".
- **Preview:** glass toolbar (pen tool · "CC Captions" toggle · "Safe zone" · zoom "75% ▾") · frame card with badge "● Ready in 4.2s" (mono, mint dot) or "● Generating…" · frame notes: violet ellipse on the target + numbered bubble ("1 Make this bar slower") with a leader line · footer row "SCENE 02 / 04" (mono) · style name (centre) · "● All changes saved" (mint) / "● Generating motion…".
- **Inspector (360, slot selected):** "GRAPHIC" · "Slot 2 · Bar chart" · "0:04.2 – 0:07.8" (mono) · ⋯ · "You said" card ("revenue grew forty percent since 2020", violet left bar) · prompt box ("A clean, animated bar chart with warm orange bars and an editorial feel.") with "✦ Generate" (violet) + "☁ 3" chip · "Quick edit… e.g. make it slower" + "⚡ free · on-device" (mint) · CONTENT ▾: title field, data table (label · value mono · colour dot) · STYLE: mini preview + "Editorial Explainer ▾" · TIMING: slider + "3.6s" (mono), "Ease in-out" curve picker, "Fade" toggle · VERSIONS: ‹ thumbnails › "v3" (current outlined).
- **Generating state:** the progress panel **replaces the inspector**: "MOTION IN THE MAKING" · "Bringing it to life" · "A few moments. A little magic." · Pip with sparkles · step cards "Finding moments ✓", "Choosing graphics ✓", "3 Animating slot 3…" (active, violet border) · "YOUR NEXT MOMENT" · "Slot 3 · Finding the bigger picture" · "Matching the motion to your words." · card "Keep your ideas moving. You can keep editing while Pip works." The preview frame shows a thin progress line along its top edge. Slots read "Preparing motion…" / "Animating…".
- **Timeline:** see `editor-timeline.md`.

### Pip panel (rail "AI", 340 wide)
- Header: "Pip ▾" · "Style" pill · "+". Collapse chevron on the panel's right edge. The preview shrinks (zoom 62 %); the inspector stays.
- **Empty:** Pip in a glowing orb · "What should we make move?" · "I can see your whole timeline. Ask for one graphic or change the whole video." · chips: "Fill the 2 empty slots", "Use brand colours everywhere", "Add an opening title at 0:00", "Tighten graphics to match my pace", "Translate captions to German" · scope chips "Whole video" (active violet) / "@Slot 2 · Bar chart" · input "Ask Pip anything…" with attach, mic, "Style" chip, ember send button · hint "⚡ free · on-device".
- **Conversation:** user message card · "Pip  Here's the plan" · plan card (numbered steps with mint ✓, "…in progress" pill, "Apply all" violet + "Edit plan") · action card "Updated 3 slots" (thumbnails, "Undo", "View on timeline") · hint "☁ ~3 credits".

### Other left panels
Voice (waveform, re-record/replace, cleanup toggles with results, editable transcript, removed fillers struck through) · Styles (gallery + detail, as `/styles`) · Media, Audio, Fonts, Brand (may ship as "coming soon" per the cut list) · Projects (recent projects).

### Editor variants (not designed)
- **9:16:** vertical frame, content re-laid out, safe-zone overlay (striped platform-UI areas right and bottom), toast "Re-laid out for vertical · 0.8s".
- **Toasts:** "On-device AI ready · Small edits run instantly on your device, free and private." (mint) · "Using cloud AI · Your browser doesn't support on-device AI yet. Everything still works." (violet).
- **Offline:** banner over the preview "You're offline. On-device edits still work. New graphics will generate when you're back." Generate disabled ("Needs connection"); quick edit active.
- **Failed slot:** red outline, "Couldn't generate", "Retry" · "Use a template".

## Export modal
"Export video" · "A little voice. Ready for the world." · close ✕ · project card (thumbnail, "Untitled Project", "18 sec · 4 scenes" mono, "Editorial Explainer") · "Format": 16:9 / 9:16 / 1:1 cards with icons (selected: ember tint + border) · "Resolution": 720p / 1080p / 4K · toggles (violet): "Captions", "Transparent background (for editors)" + "Exports as WebM with alpha when enabled.", "Include music" · divider · "Cost: 5 credits" (ember mono) · "120 available" (mono) · "Export video" (ember gradient, upload icon) · "MP4 · H.264 · 30 fps" (mono). Progress state: Pip working + percentage.

## Ready modal
Pip celebrating in a dark ember oval with confetti (ember, violet, mint, pink) · "Your video is ready" · "From your voice to something worth sharing." · file card (thumbnail, "Untitled Project.mp4", "1080p · 16:9 · 18 sec" mono, "Ready to download" mint) · "Download video" (ember gradient) · "Copy share link" (link icon violet, outline button) · "Made with your voice. Finished with motionpop."
Deliberate deviation: the design shows an upload icon on "Download video"; we use a download icon.

## Styles `/styles` (CSS only)
Header "motionpop / STYLES" + close · "Find your motion language." · "A point of view for every story. Pick a style, then make it yours." · search "Search styles, moods, or use cases" + "⌘ K" · filter chips: All styles, Charts, Maps, Titles, Explainer, Minimal, Dark, Playful · "5 curated styles" · gallery cards (live preview, "↻ 0:06", tags e.g. "Explainer · Charts", "Dark · Charts", "Minimal · Titles", "Playful · Explainer", favourite star) · side card "How styles work": "Not just a preset." / "A director for your next story. Explore the thinking behind each style, from the opening shot to the final beat." / "Select a style to read its director skill →" · footer "A style is more than a look." / "Every style includes a director skill: the rhythm, framing, and rules behind the motion." / "Live previews · sound off".
**Detail drawer** (over a scrim): "STYLE DETAILS" + close · preview · "DIRECTOR SKILL" · "The thinking behind the motion" · Intent · Shot list with "SHARE OF DURATION" segmented bar and numbered beats (e.g. "01 Establish the idea 20%", "02 Introduce one element 30%", "03 Reveal the relationship", "04 Resolve to the message") · Camera · Emphasis · Rules · "Edit style" · "Save as my style". Read exact copy from the CSS frame "Styles · Clean Minimal".

## Not-designed screens (same language)
- **Processing `/processing/[id]`:** Pip thinking in a glow · "PIP IS WORKING" · "Turning your voice into motion" · step cards like the generating panel: Cleaning audio ("Removed 7 ums and 3 long pauses") · Transcribing ("214 words · 18.0s") · Finding moments · Suggesting graphics ("4 slots found") · mini timeline where dashed slots drop in → transition to the editor.
- **Paste script `/start/script`:** script editor (word count + estimated duration mono, moments underlined violet) · voice cards (play + waveform, selected ember border) · speed · "Generate voice and continue" (ember) + "☁ 2".
- **Sign in:** glass card, Pip waving, "Welcome to Motionpop", "Continue with Google", email + password (sign in / create account).
- **Settings:** Account · AI & models (prefer on-device toggle, on-device status, usage chart on-device mint vs cloud violet) · Credits.
- **Out of credits:** Pip with empty pockets, "Pip needs a recharge", "You can still make small edits on your device for free.", "Keep editing".
- **Share `/share/[id]`:** centred player, title, duration, "Made with motionpop" + "Make your own".
- **Landing:** hero "Bring your voice. We'll bring the motion." + editor shot with Pip peeking, how it works, styles row, CTA "Your next video is a voice memo away."

## Global UX rules
- Every async action shows state (spinner, shimmer, progress) and ends in success or a clear error with a next step.
- Cost/route chip shown before any credited action.
- Keyboard accessible; visible focus ring (violet 2 px); contrast AA.
- `prefers-reduced-motion` respected everywhere.
