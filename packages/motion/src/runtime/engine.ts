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
}

/**
 * The seam between graphics ("cut the curve"): the outgoing graphic accelerates left and fades
 * by a third of its travel, the incoming one arrives mid-motion from the right and settles, on
 * mirrored power-4 eases so the speed matches at the cut. Partial travel (12 % of the frame),
 * a light blur at the cut. Returns the wrapper's offset, opacity and blur at slot time `local`.
 */
export const SEAM_MS = 320;
export function seamAt(
  local: number,
  durationMs: number,
  width: number,
  holds: boolean,
): { x: number; opacity: number; blur: number } {
  const travel = width * 0.12;
  if (local < SEAM_MS) {
    const p = Math.max(0, local / SEAM_MS);
    const e = 1 - (1 - p) ** 4;
    return { x: travel * (1 - e), opacity: 0.35 + 0.65 * Math.min(1, p * 2.2), blur: 8 * (1 - e) };
  }
  const left = durationMs - local;
  if (!holds && left < SEAM_MS) {
    const p = Math.max(0, Math.min(1, 1 - left / SEAM_MS));
    const e = p ** 4;
    return { x: -travel * e, opacity: Math.max(0, 1 - p / 0.3), blur: 8 * e };
  }
  return { x: 0, opacity: 1, blur: 0 };
}

const PLACEHOLDER_TEXT = "Couldn't render";

/** CSS font shorthands to load: one per family (the bundled files are variable fonts, 100–900). */
export function fontRequests(project: RuntimeProject): string[] {
  const { display, body, mono } = project.style.fonts;
  const hand = 'hand' in project.style.fonts ? project.style.fonts.hand : undefined;
  const families = [...new Set([display, body, mono, ...(hand ? [hand] : [])].map(primaryFamily))];
  return families.map((f) => `400 16px "${f}"`);
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

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
      const cam = doc.createElement('div');
      cam.className = 'mp-cam';
      const root = doc.createElement('div');
      root.className = 'mp-slot-root';
      cam.append(root);
      host.append(cam);
      try {
        const composition = component.build(
          {
            root,
            width: project.width,
            height: project.height,
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

  const seek = (tMs: number) => {
    pendingMs = tMs;
    if (!slots) return;
    for (const s of slots) {
      if (broken.has(s.slotId)) continue;
      const local = tMs - s.startMs;
      // Only active slots are rendered; HyperFrames hides the others.
      if (local < 0 || local > s.durationMs) continue;
      // Stage scenes plan their own camera (push capped during read time, snap-zooms).
      const scale = s.composition.camera?.(local) ?? pushIn(local, s.durationMs, pushAmount);
      const seam = seamAt(local, s.durationMs, project.width, s.holds);
      s.cam.style.transform =
        seam.x === 0 ? `scale(${scale})` : `translate(${seam.x.toFixed(1)}px,0) scale(${scale})`;
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
          img.src = ref.src;
          await img.decode();
          ok[id] = ref;
        } catch (e) {
          fail('*', 'mount', new Error(`image ${id} did not load: ${messageOf(e)}`));
        }
      }),
    );
    images = ok;
  };

  // Components measure text at build time (fitText), so fonts must be loaded first.
  const ready = Promise.all([loadFonts(), loadImages()])
    .catch((e: unknown) => fail('*', 'fonts', e))
    .then(() => {
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

  return { ready, seek, errors, warnings, reports };
}
