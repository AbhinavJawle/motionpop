import { APP_CONFIG_DEFAULTS, costOf, exportCost } from '@motionpop/schemas';

/**
 * Every word on the marketing site (spec 34), in page order, so the copy can be read and edited
 * in one place. Claims match the product: graphic types from `GRAPHIC_TYPES`, prices from the
 * config defaults.
 */

const cfg = APP_CONFIG_DEFAULTS;
const credits = (n: number) => (n === 0 ? 'Free' : `${n} credits`);

export const REPO = 'https://github.com/AbhinavJawle/motionpop';
export const FREE_CREDITS = cfg.freeCredits;

export const NAV = [
  { href: '#how', label: 'How it works' },
  { href: '#looks', label: 'Looks' },
  { href: '#hybrid', label: 'Hybrid AI' },
  { href: '#pricing', label: 'Pricing' },
] as const;

export const HERO = {
  lines: ['You talk.', 'We make it move.'],
  body: 'Record a thought, drop in a voiceover or paste a script. Pip, our friendly ghost, finds the moments in what you say and lands motion graphics on the exact word.',
  secondary: 'Watch it work',
  note: `${cfg.freeCredits} free credits to start. Quick edits are free forever.`,
};

/** What you say, and the graphic Pip puts on it. */
export const TICKER: readonly { said: string; graphic: string }[] = [
  { said: 'revenue grew forty percent', graphic: 'Stat punch' },
  { said: 'we landed in Tokyo', graphic: 'Map' },
  { said: 'sales doubled since 2020', graphic: 'Chart story' },
  { said: 'three reasons why', graphic: 'List stack' },
  { said: 'cash versus index funds', graphic: 'Versus' },
  { said: 'from 1969 to today', graphic: 'Timeline' },
  { said: 'as she put it', graphic: 'Quote' },
  { said: 'here’s the thing', graphic: 'Hook statement' },
];

/** Hand-written notes pinned to the product screenshot. */
export const FRAME_NOTES = {
  slot: 'each graphic sits right above the words it belongs to',
  edit: 'tweak it with a sentence. free, on your device',
  formats: '16:9, 9:16 or 1:1 in one click',
};

export const HOW = {
  title: 'One take. Three beats.',
  body: 'From a voice memo to a finished video, without touching a single keyframe.',
  beats: [
    {
      time: '00:00',
      title: 'Say the thing',
      body: 'Record in the browser, upload a voiceover, or paste a script and pick a voice. The ums and long pauses come out on their own.',
    },
    {
      time: '00:02',
      title: 'Pip finds the moments',
      body: 'Every word gets a timestamp. Every number, place and name gets a slot, with the reason written on it.',
    },
    {
      time: '00:04',
      title: 'It lands on the word',
      body: 'Graphics fill in while you watch, timed to the syllable. Change one with a sentence, or let Pip direct the lot.',
    },
  ],
  reason: 'You said “revenue grew forty percent”',
  words: ['Our', 'revenue', 'grew', 'forty', 'percent', 'since', '2020.'],
} as const;

export const LOOKS = {
  title: 'One sentence. Four personalities.',
  body: 'Same voice, same words. Pick a look and every chart, title and caption changes its clothes.',
  cta: 'Try a look',
  items: [
    {
      id: 'editorial-explainer',
      name: 'Editorial Explainer',
      about: 'Clean, confident, highlighter in hand.',
    },
    { id: 'field-notes', name: 'Field Notes', about: 'Red pen, handwriting, notebook energy.' },
    { id: 'newsprint', name: 'Newsprint', about: 'Serif headlines, scissors and glue.' },
    { id: 'paper-collage', name: 'Paper Collage', about: 'Torn card stock and bold blocks.' },
  ],
  save: 'Found the one? Save it as your style and Pip directs every video that way.',
} as const;

export const HYBRID = {
  title: 'Free when it’s small. Cloud when it’s big.',
  body: 'Motionpop runs AI in two places, and it always tells you which one before you click.',
  device: {
    title: 'Right here, in your browser',
    body: 'Gemini Nano runs inside Chrome through Firebase AI Logic. Quick edits, frame notes and the first draft of every graphic cost nothing, never leave your machine and keep working offline.',
    input: 'make it slower',
    chip: 'free · on-device',
  },
  cloud: {
    title: 'In the cloud, when it counts',
    body: 'A polished graphic, a custom one or a voice for your script goes to Gemini in the cloud. The price is on the button before you press it, and a failed job gives the credits back.',
    button: 'Generate',
  },
  bubble: 'No surprise bills. Ghost’s honour.',
} as const;

export const PLANS = {
  title: 'Ask for the whole video.',
  body: 'Talk to Pip like a teammate. Big requests come back as a plan you can read, apply in one go, or undo in one step.',
  ask: 'Use my brand colours everywhere and make the titles punchier.',
  planTitle: 'Here’s the plan',
  steps: [
    'Swap the accent to your orange in 6 graphics',
    'Rewrite 3 titles, shorter and louder',
    'Match the captions to your brand',
  ],
  apply: 'Apply all',
  undo: 'Undo',
  bubble: 'On it, boss.',
} as const;

export const FEATURES = {
  title: 'The fiddly bits, handled.',
  body: 'Everything between “nice idea” and “posted”.',
  items: {
    notes: {
      title: 'Draw on the frame',
      body: 'Circle what bugs you and scribble a note. Pip reads it and fixes that frame.',
      scribble: 'make this slower',
    },
    formats: {
      title: 'Every format',
      body: 'Switch between 16:9, 9:16 and 1:1. Every graphic lays itself out again, nothing cropped off.',
    },
    captions: {
      title: 'Captions, word by word',
      body: 'Three caption styles that light up as you speak.',
    },
    custom: {
      title: 'Custom graphics from a sentence',
      body: 'Not in the library? Describe it. The AI writes a new graphic in your look and tests it in a sandbox before it reaches your timeline.',
    },
    film: {
      title: 'Make it a film',
      body: 'One button turns a voiceover into a directed piece: a storyboard, scenes built side by side, and a critic that checks every shot.',
    },
    sound: {
      title: 'Sound, made in code',
      body: 'Pops and whooshes land on every entrance, tucked under your voice. No stock libraries.',
    },
    versions: {
      title: 'Every change is a version',
      body: 'Go back to any of them. Undo always works.',
    },
  },
} as const;

export const AUDIENCES = {
  title: 'Not a video editor? Perfect.',
  body: 'You bring the point of view. Pip brings it to life.',
  items: [
    {
      title: 'Explainer creators',
      body: 'Finance, tech, history, science. Your numbers turn into charts while you’re still talking.',
    },
    {
      title: 'Video editors',
      body: 'Consistent graphics in minutes, exported ready to drop into your own cut.',
    },
    {
      title: 'Founders and marketers',
      body: 'Launch videos and data stories without hiring a studio or learning one.',
    },
  ],
} as const;

export const STITCHED = {
  title: 'Stitched together. Brought to life.',
  body: 'Motionpop is a friendly monster made of very different parts, sewn into one creative tool. It’s open source, so you can count the stitches.',
  parts: [
    { name: 'Whisper', job: 'hears every word, in a worker on your machine' },
    { name: 'Gemini Nano', job: 'free edits in the browser, through Firebase AI Logic' },
    { name: 'Gemini in the cloud', job: 'plans, voices and custom graphics' },
    { name: 'Our motion engine', job: 'every frame is a pure function of time' },
    { name: 'HyperFrames', job: 'renders the same composition to MP4' },
    { name: 'Kiro', job: 'specs, steering and agents built it, one task at a time' },
  ],
  bubble: 'It’s alive!',
  cta: 'Read the source',
} as const;

export const PRICING = {
  title: 'Start free. Pay only for the cloud.',
  body: 'No plans to compare. Credits pay for cloud work, and everything on your device is free.',
  plan: 'Free plan',
  planNote: `${cfg.freeCredits} credits on sign-up`,
  perks: [
    'Every look and every graphic type',
    'Unlimited quick edits on your device',
    'Exports up to 1080p with captions',
  ],
  rows: [
    { label: 'Quick edits and auto-fill on your device', cost: 'Free' },
    { label: 'Generate a graphic in the cloud', cost: credits(costOf('generate', 1, cfg)) },
    { label: 'Custom graphic from a sentence', cost: credits(costOf('custom', 1, cfg)) },
    { label: 'Voice from a script, per minute', cost: credits(costOf('tts', 1, cfg)) },
    {
      label: 'Export 1080p MP4, per minute of video',
      cost: credits(exportCost('1080p', 60_000, cfg.exportCredits)),
    },
  ],
  footnote: 'The cost is on every button before you click. Failed generations are refunded.',
};

export const FAQ = {
  title: 'Good questions.',
  body: 'Straight answers. Pip insists.',
  items: [
    {
      q: 'Do I need to know animation?',
      a: 'No. You talk, Pip places the graphics, and you tweak them with words. There isn’t a keyframe in sight.',
    },
    {
      q: 'Can I use my own voice?',
      a: 'That’s the whole idea. Record in the browser or upload an MP3, WAV or M4A. Rather type? Paste a script and pick a generated voice.',
    },
    {
      q: 'Which browser works best?',
      a: 'Desktop Chrome, where the on-device AI lives. Other browsers work too: edits go to the cloud there, and Motionpop tells you when that happens.',
    },
    {
      q: 'Can I change what Pip makes?',
      a: 'Every word, number, colour and timing. Edit the fields, write a quick edit, or draw on the frame.',
    },
    {
      q: 'What do I get at the end?',
      a: 'An MP4 up to 1080p in 16:9, 9:16 or 1:1, with captions and sound if you want them, plus a link to share it.',
    },
    {
      q: 'Is it really open source?',
      a: 'Yes, under Apache-2.0. Read it, fork it, send a ghost.',
    },
  ],
} as const;

export const CLOSER = {
  title: 'Give that idea a little afterlife.',
  body: 'Pip’s waiting by the mic.',
};

export const FOOTER = {
  tagline: 'Bring your voice. We’ll bring the motion.',
  small: 'Open source under Apache-2.0. Works best in desktop Chrome.',
};
