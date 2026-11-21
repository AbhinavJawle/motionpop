/**
 * Runtime engine: builds every slot's component once fonts are loaded, then renders any
 * time t on demand. Kept free of `window` globals so it can be tested in happy-dom;
 * `runtime.ts` wires it to the page and HyperFrames' `hf-seek` event.
 *
 * Failures are contained per slot (spec 03 R4.2): a slot that fails to parse, build or
 * seek records one de-duplicated error and, in preview, shows a neutral placeholder.
 * Other slots keep rendering. In render mode no placeholder is drawn; the producer
 * reads `errors` and fails the job.
 */
import type { Composition, ImageRef, MotionComponent } from '../contract';
import type { RuntimeProject } from '../compiler/types';
import { pushIn } from '../core/camera';
import type { SceneContext } from '../engine/stage';
import { hashString } from '../core/rng';
import { fontStack, primaryFamily } from '../fonts/font-faces';
import { withTiming } from './timing';
import { guardSeams, NO_SEAMS, planSeams, seamState, type SlotSeams } from './seams';
import { planVideo, type VideoPlan } from '../engine/video-plan';
import { clippedStageBounds } from '../film/stage-bounds';

const FALLBACK_SEAMS: SlotSeams = {
  enter: { kind: 'slide', dir: 1 },
  exit: { kind: 'slide', dir: 1 },
};

export type SlotPhase = 'fonts' | 'mount' | 'params' | 'build' | 'seek';

export interface SlotError {
  /** `*` for composition-wide problems (fonts). */
  slotId: string;
  phase: SlotPhase;
  message: string;
}

export interface SlotWarning {
  slotId: string;
  message: string;
}

export interface Engine {
  /** Resolves once fonts are loaded and every slot is built (or failed). Never rejects. */
  ready: Promise<void>;
  /** Renders composition time `tMs` (integer ms). Before `ready`, the latest call is replayed. */
  seek: (tMs: number) => void;
  errors: SlotError[];
  warnings: SlotWarning[];
  /** Stage reports of mounted scenes, by slot id. */
  reports: () => Record<string, unknown>;
  /** Sound effects custom graphics asked for, by slot id. */
  sounds: () => Record<string, { kind: string; atMs: number }[]>;
}

/** The subset of `FontFaceSet` the engine needs (lets tests pass a fake). */
export interface FontLoader {
  load: (font: string) => Promise<unknown>;
  check: (font: string) => boolean;
  ready: Promise<unknown>;
}

export interface EngineOptions {
  doc: Document;
  // Components are heterogeneous in their params type; the engine only passes parsed params through.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- params are validated by each component's own zod schema before use
  components: Readonly<Record<string, MotionComponent<any>>>;
  fonts: FontLoader;
}

interface Mounted {
  slotId: string;
  startMs: number;
  durationMs: number;
  /** Camera wrapper: the runtime owns the push-in, components never apply it. */
  cam: HTMLElement;
  root: HTMLElement;
  composition: Composition;
  /** The slot holds its last frame and cuts (`fade: false`): no exit seam. */
  holds: boolean;
  /** Film beats: how long the beat keeps playing after its slot ends (spec 07b). */
  tailMs: number;
  seams: SlotSeams;
}

const PLACEHOLDER_TEXT = "Couldn't render";

/** A custom graphic written as a beat of a film (spec 07b): it owns its seams and camera. */
export const isFilmBeat = (slot: { componentId: string; params: unknown }): boolean =>
  slot.componentId === 'custom' &&
  typeof slot.params === 'object' &&
  slot.params !== null &&
  typeof (slot.params as { film?: unknown }).film === 'object' &&
  (slot.params as { film?: unknown }).film !== null;

/** CSS font shorthands to load: one per family (the bundled files are variable fonts, 100–900). */
export function fontRequests(project: RuntimeProject): string[] {
  const { display, body, mono } = project.style.fonts;
  const hand = 'hand' in project.style.fonts ? project.style.fonts.hand : undefined;
  const families = [...new Set([display, body, mono, ...(hand ? [hand] : [])].map(primaryFamily))];
  return families.map((f) => `400 16px "${f}"`);
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * The seam of every slot boundary. Staged videos (spec 07c) travel one way, like a camera moving
 * through one world, and the climax is entered with a pull. The world layer reads the same plan.
 */
export function projectSeams(
  project: RuntimeProject,
  plan: VideoPlan | null,
): Map<string, SlotSeams> {
  return planSeams(
    project.slots.map((x) => ({
      id: x.id,
      startMs: x.startMs,
      endMs: x.endMs,
      energy: x.id === plan?.climaxId ? 'hype' : (x.energy ?? undefined),
    })),
    'transitions' in project.style ? project.style.transitions : undefined,
    plan ? { journey: true } : undefined,
  );
}

export function createEngine(project: RuntimeProject, opts: EngineOptions): Engine {
  const { doc, components, fonts } = opts;
  const errors: SlotError[] = [];
  const warnings: SlotWarning[] = [];
  const seen = new Set<string>();
  const preview = (project.mode ?? 'preview') === 'preview';

  const fail = (slotId: string, phase: SlotPhase, e: unknown) => {
    const message = messageOf(e);
    const key = `${slotId}\u0000${phase}\u0000${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    errors.push({ slotId, phase, message });
  };
  const warnOnce = (slotId: string, message: string) => {
    const key = `${slotId}\u0000warn\u0000${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    warnings.push({ slotId, message });
  };

  const placeholder = (host: HTMLElement) => {
    if (!preview) return;
    const el = doc.createElement('div');
    el.className = 'mp-placeholder';
    el.textContent = PLACEHOLDER_TEXT;
    el.style.cssText = `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:500 ${Math.round(project.height * 0.03)}px/1 ${fontStack(project.style.fonts.body)};color:${project.style.colors.muted};background:${project.style.colors.bg};`;
    host.replaceChildren(el);
  };

  const mountAll = (): Mounted[] => {
    const mounted: Mounted[] = [];
    for (const slot of project.slots) {
      const host = doc.getElementById(slot.id);
      if (!host) {
        fail(slot.id, 'mount', new Error(`no host element #${slot.id}`));
        continue;
      }
      const component = components[slot.componentId];
      if (!component) {
        fail(slot.id, 'mount', new Error(`unknown component "${slot.componentId}"`));
        placeholder(host);
        continue;
      }
      const parsed = component.params.safeParse(slot.params);
      if (!parsed.success) {
        fail(slot.id, 'params', parsed.error);
        placeholder(host);
        continue;
      }
      const durationMs = slot.endMs - slot.startMs;
      if (durationMs < component.durationMs.min) {
        warnOnce(
          slot.id,
          `slot is ${durationMs} ms, shorter than ${component.id}'s minimum ${component.durationMs.min} ms`,
        );
      }
      const wantedKey = slot.keyMomentMs ?? component.keyMomentMs(parsed.data, durationMs);
      const keyMomentMs = Math.min(Math.max(Math.round(wantedKey), 0), durationMs);
      if (keyMomentMs !== wantedKey) {
        warnOnce(slot.id, `key moment ${wantedKey} ms clamped to ${keyMomentMs} ms`);
      }
      // Each clip runs with its own style: the slot's speed and ease change how it moves, while
      // the background and texture still come from the project's look (spec 09 R4.4).
      const clipStyle = withTiming(project.style, slot.timing);
      const stageBounds =
        project.hasVideo && slot.componentId === 'custom'
          ? clippedStageBounds(project.format, project.width, project.height, slot.videoStage)
          : { x: 0, y: 0, width: project.width, height: project.height, clipped: false, opaqueSurface: false };
      const cam = doc.createElement('div');
      cam.className = 'mp-cam';
      if (stageBounds.opaqueSurface) {
        cam.setAttribute('data-mp-stage-bg', project.style.colors.bg);
      }
      const root = doc.createElement('div');
      root.className = 'mp-slot-root';
      cam.append(root);
      host.append(cam);
      try {
        const composition = component.build(
          {
            root,
            width: stageBounds.width,
            height: stageBounds.height,
            frameWidth: project.width,
            frameHeight: project.height,
            ...(slot.videoStage ? { videoStage: slot.videoStage } : {}),
            format: project.format,
            style: clipStyle,
            durationMs,
            keyMomentMs,
            fps: 30,
            seed: hashString(slot.id),
            warn: (message: string) => warnOnce(slot.id, message),
            ...(images ? { images } : {}),
            // Scene context (ignored by plain components).
            look: clipStyle,
            // `fade: false`: a scene holds its last frame and cuts at the slot end (R4.3).
            ...(slot.timing?.fade === false ? { exit: 'none' as const } : {}),
            ...(slot.words ? { words: slot.words } : {}),
            ...(slot.stress ? { stress: slot.stress } : {}),
            ...(slot.pauses ? { pauses: slot.pauses } : {}),
            ...((slot.energy ?? project.energy) ? { energy: slot.energy ?? project.energy } : {}),
            // The slot's place in the whole video (spec 07c): companion, side, climax.
            ...(videoPlan?.slots.get(slot.id) ? { staging: videoPlan.slots.get(slot.id) } : {}),
          } as SceneContext,
          parsed.data,
        );
        mounted.push({
          slotId: slot.id,
          startMs: slot.startMs,
          durationMs,
          cam,
          root,
          composition,
          holds: slot.timing?.fade === false,
          tailMs: slot.tailMs ?? 0,
          seams:
            // A film beat writes its own entrance and exit; a whole-frame seam would fight them.
            project.seams === false || isFilmBeat(slot)
              ? NO_SEAMS
              : guardSeams(seamPlan.get(slot.id) ?? FALLBACK_SEAMS, keyMomentMs, durationMs),
        });
      } catch (e) {
        fail(slot.id, 'build', e);
        placeholder(host);
      }
    }
    return mounted;
  };

  let slots: Mounted[] | null = null;
  let pendingMs = 0;
  const broken = new Set<string>();
  const pushAmount = project.style.motion.camera.pushIn;
  // Whole-video staging (spec 07c): planned once from every slot, before any is built. A film
  // carries its own continuity, so it is never staged. Pictures that failed to load are left
  // out once the images have decoded (see `ready`).
  const staged = project.staging !== false && !project.film;
  let videoPlan: VideoPlan | null = staged ? planVideo(project.slots) : null;
  const seamPlan = projectSeams(project, videoPlan);
  const stepFps = 'personality' in project.style ? project.style.personality?.stepFps : undefined;
  const seamStep = stepFps ? 1000 / stepFps : 0;

  const seek = (tMs: number) => {
    pendingMs = tMs;
    if (!slots) return;
    for (const s of slots) {
      if (broken.has(s.slotId)) continue;
      const local = tMs - s.startMs;
      // Only active slots are rendered; HyperFrames hides the others.
      if (local < 0 || local > s.durationMs + s.tailMs) continue;
      // Stage scenes plan their own camera (push capped during read time, snap-zooms).
      const scale = s.composition.camera?.(local) ?? pushIn(local, s.durationMs, pushAmount);
      const seam = seamState(s.seams, local, s.durationMs, project.width, s.holds, seamStep);
      const k = scale * seam.scale;
      s.cam.style.transform =
        seam.x === 0 ? `scale(${k})` : `translate(${seam.x.toFixed(1)}px,0) scale(${k})`;
      s.cam.style.opacity = seam.opacity === 1 ? '' : seam.opacity.toFixed(3);
      s.cam.style.filter = seam.blur > 0.2 ? `blur(${seam.blur.toFixed(1)}px)` : '';
      try {
        s.composition.seek(local);
      } catch (e) {
        fail(s.slotId, 'seek', e);
        broken.add(s.slotId);
        const host = s.cam.parentElement;
        if (host) placeholder(host);
      }
    }
  };

  const loadFonts = async () => {
    const requests = fontRequests(project);
    await Promise.all(
      requests.map((f) => fonts.load(f).catch((e: unknown) => fail('*', 'fonts', e))),
    );
    await fonts.ready;
    for (const f of requests) {
      if (!fonts.check(f)) fail('*', 'fonts', new Error(`font not loaded: ${f}`));
    }
  };

  // Images decode before the build, so the first captured frame already shows them. One that
  // fails to load is left out: its scene builds the image-free form.
  let images: Record<string, ImageRef> | undefined;
  const loadImages = async () => {
    const all = project.images;
    if (!all || typeof Image === 'undefined') return;
    const ok: Record<string, ImageRef> = {};
    await Promise.all(
      Object.entries(all).map(async ([id, ref]) => {
        try {
          const img = new Image();
          // Map textures are uploaded to WebGL: a cross-origin preview URL needs CORS mode.
          if (!ref.src.startsWith('data:')) img.crossOrigin = 'anonymous';
          img.src = ref.src;
          await img.decode();
          ok[id] = { ...ref, el: img };
        } catch (e) {
          const message = `image ${id} did not load: ${messageOf(e)}`;
          // Map imagery is an upgrade: without it the map draws as vectors, so it never fails
          // a render. A missing picture is a real fault and is reported.
          if (id.startsWith('map:')) console.warn(`[motionpop] ${message}`);
          else fail('*', 'mount', new Error(message));
        }
      }),
    );
    images = ok;
  };

  // Components measure text at build time (fitText), so fonts must be loaded first.
  const ready = Promise.all([loadFonts(), loadImages()])
    .catch((e: unknown) => fail('*', 'fonts', e))
    .then(() => {
      // Plan again with the pictures that really loaded: a missing one leaves its side to a
      // companion instead of an empty split.
      if (staged) videoPlan = planVideo(project.slots, new Set(Object.keys(images ?? {})));
      slots = mountAll();
      seek(pendingMs);
    });

  /** Stage reports of mounted scenes (beat plan, juice, energy), for motion:check and the gates. */
  const reports = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const s of slots ?? []) {
      const report = (s.composition as { report?: unknown }).report;
      if (report !== undefined) out[s.slotId] = report;
    }
    return out;
  };

  /** Sound effects custom graphics asked for with `mp.sfx`, by slot id (read by the film critic). */
  const sounds = (): Record<string, { kind: string; atMs: number }[]> => {
    const out: Record<string, { kind: string; atMs: number }[]> = {};
    for (const s of slots ?? []) {
      const cues = (s.composition as { sounds?: readonly { kind: string; atMs: number }[] }).sounds;
      if (cues?.length) out[s.slotId] = [...cues];
    }
    return out;
  };

  return { ready, seek, errors, warnings, reports, sounds };
}
