/**
 * The craft the film prompts share (spec 07b R3). Distilled from the repo's own agent skills
 * (motion doctrine, cut the curve, the HyperFrames story, motion, look and review notes) into
 * rules a model can follow for one film: one world, a picture for every idea, motion that lands
 * on the voice, and seams that are caused by something on screen.
 */
export const FILM_PICTURE_RULES = `PICTURE FIRST
- Show the idea, don't caption it. Every beat draws the thing the words are about (a ship, a canal, a pitch, a queue, a route on a map) and lets one short label name it. A frame that is only a sentence, or a sentence in a box, is a failure.
- Make a number physical: 369 ships is 369 dots, 400 metres is a ruler against four pitches, 12 % is a slice of a whole. The number and its picture arrive together and agree on every frame.
- One idea per beat. At most two levels of text: one hero (a number or 2 to 6 words) and one quiet label. Never put the spoken sentence on screen word for word. At most two beats of a film may be led by type (usually the hook and the last line).
- Real facts only: numbers, names and places come from the narration. Labels that support the picture (place names, units, dates the narration gives) are fine. Never invent a statistic, a source or a quote.`;

export const FILM_LAYOUT_RULES = `LAYOUT
- Compose off-centre on a grid: the hero on one third, the picture across the other two. Not everything centred, never three cards in a row, never a dashboard.
- Hero text spans 35 to 65 % of the frame width. Quiet labels are 2.6 to 4 % of the short side, never smaller. Nothing readable under 2.4 %.
- One accent colour, used once per beat, on the one thing that matters. Highlighter goes behind two or three key words, never a whole line.
- Leave air: a third of the frame stays empty ground.`;

export const FILM_MOTION_RULES = `MOTION
- Every element arrives on the word that names it. The hero lands on its word.
- Arrive slow, leave clean: entrances take 400 to 700 ms on a long ease-out. Exits are 40 to 50 % shorter and accelerate.
- Overlap: the next element starts when the previous one is 30 to 50 % in. Words 60 to 110 ms apart, list items 40 to 80 ms, dots 4 to 20 ms.
- Never the same move twice in a beat: words blur in, a line draws on, a card slides and settles its tilt, a number counts, a shape wipes open. Never every element fading up.
- A landed title is dead still. No floating, breathing, pulsing or looping. After things land, the beat keeps working through staged reveals on later words, a line drawing, a count, the camera travelling, or one slow push (a wrapper scaling 1 to 1.04).
- Hold 300 to 700 ms of stillness before the payoff. Readable text stays for 0.5 s plus 0.3 s a word.
- At most three things moving at once.`;

export const FILM_BANNED = `BANNED: glow, neon, gradients as decoration, particles, a dark void with small things floating in it, everything centred, KPI tiles, three cards in a row, legends, corner labels and frame borders, bounce or elastic on text, text that keeps moving after it lands, fading the whole frame in or out, emoji, stock clip-art.`;

/**
 * Creator-Reel craft rules (spec 23 Pillar 3): replaces flat paper-documentary restrictions when
 * building talking-head Reels so graphics achieve Ref 1/2/3 agency polish (elevated cards, luminous
 * stages, macOS windows, editorial serif+sans contrast, 3D rigs, real images).
 */
export const REEL_CRAFT_RULES = `REEL DESIGN CRAFT (Editorial Cream / Studio Light / Luminous Tech)
- Use the Reel UI & 3D Kit (mp.stage, mp.card, mp.window, mp.odometer, mp.ring, mp.meter, mp.tile, mp.flowDots, mp.chart, mp.stamp, mp.strike, mp.chapter, mp.image, mp.card3d, mp.globe, mp.mesh3d) instead of raw hand-drawn wireframe boxes.
- Surface depth & lighting: ALWAYS open split-top-stage beats with mp.stage({ tone: "auto", region: "top-half" }) and cutaways with mp.stage({ tone: "auto", region: "full" }). Calibrated multi-layer drop shadows, crisp 1px borders, warm cream or luminous radial lighting, and glass cards are ENCOURAGED.
- Editorial typography: pair var(--display) (Playfair Display / italic serif accents on key words) with bold tight-tracked var(--body) (Geist 800) and var(--mono) for code/data labels.
- Instant readability: the primary card/visual MUST be visible within 140 ms (never start a beat with 1 second of blank screen).
- STRICTLY BANNED ON REELS: wireframe stick-figure/user bust silhouettes (NEVER call mp.icon("user")), fake camera viewfinder corner brackets [ ], full-frame rectangular borders around the viewport, random floating grey circles over the speaker's face, fake oval/box outlines drawn in the PiP corner, giant empty dark rectangles, low-contrast grey text directly over live video.`;

/** The seam vocabulary: how one beat hands the frame to the next. Both sides follow the same row. */
export const FILM_SEAMS = `SEAMS (how a beat hands over to the next; both beats follow the same seam)
- "push": cut on the move, the default. The outgoing beat's content accelerates off to the LEFT over its last 300 ms and is gone a third of the way; the incoming beat's first elements arrive from the RIGHT already moving and settle. Element by element, never the frame as one block.
- "lift": the page is pulled away. The outgoing beat sits on a full-frame sheet that is pulled up and off after its slot ends, uncovering the incoming beat, which is already composed underneath from its first frame.
- "cover": a new page arrives. The incoming beat sits on a full-frame sheet that slides in over the outgoing beat, which holds dead still underneath.
- "zoom": dive through an object. The outgoing beat grows toward the camera into one named object (its last 350 ms); the incoming beat opens small and keeps growing into place. Use it to go deeper into the same thing: the map marker becomes the ship.
- "match": the same thing in the same place on both sides of the cut: the same map view, the same bar, the same rule. The outgoing beat ends on exactly the frame the incoming beat opens on. Write the shared numbers in the note (a map view as [lon, lat] and zoom; a bar as percentages of the frame).
Use three or four kinds in a film and at least one "match" or "zoom" when beats share an object. A seam is always caused by something on screen: a page, the camera, a shape that becomes the next shape.`;
