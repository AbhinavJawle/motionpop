// AI-written reel scenes (spec 30): the runtime inside one custom scene's frame (bundled to
// dist/reel-custom.js). It builds the generated graphic with the film kit and draws the frame the
// reel asks for. It only ever runs inside that frame: sandboxed in the editor, in the isolated
// render container for the export.
import type { StylePack } from '@motionpop/schemas';
import type { BuildContext, Composition } from '../contract';
import { buildCustom } from '../components/custom/build';
import { inspectBeat } from '../film/critic';
import creatorDark from '../styles/creator-dark.json' with { type: 'json' };
import type {
  CustomInspectMessage,
  CustomReplyMessage,
  CustomSeekMessage,
  ReelCustomScene,
} from './custom';

declare global {
  interface Window {
    __MP_SCENE__?: ReelCustomScene;
  }
}

const family = (stack: string): string =>
  stack
    .split(',')[0]!
    .trim()
    .replace(/^['"]|['"]$/g, '');

function styleOf(scene: ReelCustomScene): StylePack {
  const p = scene.palette;
  const base = creatorDark as unknown as StylePack;
  return {
    ...base,
    colors: {
      bg: p.bg,
      ink: p.ink,
      muted: p.muted,
      accent: p.accent,
      accent2: p.accent2 ?? p.link,
      highlight: p.accent,
      positive: '#22C55E',
      negative: '#EF4444',
      chart: [p.accent, p.accent2 ?? p.link, p.muted],
    },
    fonts: {
      ...base.fonts,
      display: family(scene.look.upper ? scene.look.sans : scene.look.serif),
      body: family(scene.look.sans),
      mono: family(scene.look.mono),
    },
  };
}

const scene = window.__MP_SCENE__;
const root = document.getElementById('mp-scene');
const reply = (m: Omit<CustomReplyMessage, 'mpReel'>) => {
  if (!scene) return;
  const msg: CustomReplyMessage = { mpReel: scene.token, ...m };
  // Our parent is the reel; its origin is unknown to an opaque frame, so '*' with a token.
  parent.postMessage(msg, '*');
};

if (scene && root) {
  let comp: Composition | null = null;
  let queued: CustomSeekMessage | null = null;
  let lastMs = 0;
  const errors: string[] = [];
  const message = (err: unknown) =>
    (err instanceof Error ? err.message : String(err)).slice(0, 300);
  const seekSafe = (ms: number): string | null => {
    try {
      comp?.seek(ms);
      return null;
    } catch (err) {
      // A throw mid-seek leaves the last good frame; the next seek tries again.
      const e = message(err);
      if (errors.length < 8 && !errors.includes(e)) errors.push(e);
      return e;
    }
  };
  const draw = (m: CustomSeekMessage) => {
    lastMs = m.ms;
    const e = seekSafe(m.ms);
    reply(e ? { ack: m.seek, seekError: e } : { ack: m.seek });
  };
  const review = (m: CustomInspectMessage) => {
    let summary = null;
    try {
      summary = inspectBeat(root, (t) => void seekSafe(Math.round(t)), {
        durationMs: scene.durationMs,
        keyMomentMs: ctx.keyMomentMs,
        width: scene.width,
        height: scene.height,
        frameShortSide: 720,
        bg: scene.palette.bg,
        reelMode: true,
        wantsPicture: false,
        ...(m.allowNumbers ? { allowNumbers: m.allowNumbers } : {}),
        errors: [...errors],
      });
    } catch (err) {
      errors.push(`the review failed: ${message(err)}`);
    }
    seekSafe(lastMs);
    reply({ inspected: m.inspect, report: { summary, errors: [...errors] } });
  };
  window.addEventListener('message', (e) => {
    if (e.source !== parent) return;
    const m = e.data as Partial<CustomSeekMessage & CustomInspectMessage> | null;
    if (!m || m.mpReel !== scene.token) return;
    if (typeof m.inspect === 'number') {
      if (comp) review(m as CustomInspectMessage);
      return;
    }
    if (typeof m.ms !== 'number' || typeof m.seek !== 'number') return;
    if (comp) draw(m as CustomSeekMessage);
    else queued = m as CustomSeekMessage;
  });
  const images = Object.fromEntries(
    Object.entries(scene.images).map(([id, im]) => [
      id,
      { src: im.src, width: im.w, height: im.h, keyed: false },
    ]),
  );
  const ctx: BuildContext & { words: ReelCustomScene['words'] } = {
    root,
    width: scene.width,
    height: scene.height,
    // The reel stage: `--u` (1 % of its short side) is the same in every scene of the reel.
    frameWidth: scene.frameWidth ?? 720,
    frameHeight: scene.frameHeight ?? 1280,
    format: scene.format ?? '9:16',
    style: styleOf(scene),
    durationMs: scene.durationMs,
    keyMomentMs: Math.min(scene.params.keyMomentMs ?? 0, scene.durationMs),
    fps: 30,
    seed: scene.seed,
    warn: () => {},
    images,
    words: scene.words,
  };
  // Faces load lazily: ask for each family first, so the first build (and the review's text
  // measurements) use the real fonts, not the fallback (component-contract: fonts before build).
  const style = ctx.style;
  const faces = [style.fonts.display, style.fonts.body, style.fonts.mono].flatMap((f) => [
    `400 32px "${f}"`,
    `700 32px "${f}"`,
  ]);
  void Promise.all(faces.map((f) => document.fonts.load(f).catch(() => [])))
    .then(() => document.fonts.ready)
    .then(() => {
      try {
        comp = buildCustom(ctx, { ...scene.params, film: { tailMs: 0, over: 'out', headMs: 0 } });
        seekSafe(queued?.ms ?? 0);
        reply({ ready: true });
        if (queued) draw(queued);
        queued = null;
      } catch (err) {
        reply({ error: message(err) });
      }
    });
}
