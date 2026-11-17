// Film lab, setup S2: the craft rules distilled from the repo's own agent skills
// (.claude/skills/motion-doctrine, cut-the-curve, hyperframes/references/{story,motion,look,review}.md),
// rewritten for one graphic at a time. Setup S3 and film mode reuse them.
export const CRAFT_RULES = `Craft rules. They decide whether the graphic looks designed or generated.

PICTURE FIRST
- Show the idea, don't caption it. Draw the thing the words are about (a ship, a canal, a pitch, a stack of coins, a route on a map) and let one short label name it. A frame that is only a sentence, or a sentence in a box, is a failure.
- Make a number physical: 369 ships is 369 dots, 400 metres is a ruler against four pitches, 12 % is a slice of a whole. The number and its picture arrive together and agree on every frame.
- One idea per graphic. At most two levels of text: one hero (a number or 2 to 6 words) and one quiet label. Never put the spoken sentence on screen word for word.

LAYOUT
- Compose off-centre on a grid: the hero on one third, the picture across the other two. Not everything centred, not three cards in a row.
- Hero text spans 35 to 65 % of the frame width. Quiet labels are 2.6 to 4 % of the short side, never smaller.
- One accent colour, used once, on the one thing that matters. Highlighter goes behind two or three key words, never a whole line.

MOTION
- Every element arrives on the word that names it. The hero lands on its word; keyMomentMs is that time.
- Arrive slow, leave clean: entrances take 400 to 700 ms on a long ease-out. Exits are 40 to 50 % shorter and accelerate.
- Overlap: the next element starts when the previous one is 30 to 50 % in. Words 60 to 110 ms apart, list items 40 to 80 ms.
- Never the same move twice. In one graphic use different entrances: words blur in, a line draws on, a card slides and settles its tilt, a number counts, a shape wipes open. Never every element fading up.
- A landed title is dead still. No floating, breathing, pulsing or looping. After things land the frame keeps working through staged reveals, a line drawing, a count, or one slow camera push (a wrapper scaling 1 to 1.04).
- Hold 300 to 700 ms of stillness before the payoff. Readable text stays for 0.5 s plus 0.3 s a word.
- At most three things moving at once.

SEAMS
- Never fade the whole frame in or out. Enter through motion (slide and settle, wipe, draw). Exit by accelerating off in ONE direction (left by default) over the last 300 ms, so the next graphic can carry the move on.

BANNED: glow, neon, gradients as decoration, particles, everything centred, KPI tiles, three cards in a row, legends, bounce or elastic on text, text that keeps moving after it lands, emoji.`;
