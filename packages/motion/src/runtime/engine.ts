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
import type { Composition, MotionComponent } from '../contract';
import type { RuntimeProject } from '../compiler/types';
import { primaryFamily } from '../fonts/font-faces';

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
  root: HTMLElement;
  composition: Composition;
}

const PLACEHOLDER_TEXT = "Couldn't render";

/** CSS font shorthands to load: one per family (the bundled files are variable fonts, 100–900). */
export function fontRequests(project: RuntimeProject): string[] {
  const { display, body, mono } = project.style.fonts;
  const families = [...new Set([display, body, mono].map(primaryFamily))];
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
    el.style.cssText = `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:500 ${Math.round(project.height * 0.03)}px/1 ${project.style.fonts.body};color:${project.style.colors.muted};background:${project.style.colors.bg};`;
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
      const root = doc.createElement('div');
      root.className = 'mp-slot-root';
      host.append(root);
      try {
        const composition = component.build(
          {
            root,
            width: project.width,
            height: project.height,
            format: project.format,
            style: project.style,
            durationMs,
            keyMomentMs,
            fps: 30,
            seed: 1,
            warn: (message: string) => warnOnce(slot.id, message),
          },
          parsed.data,
        );
        mounted.push({ slotId: slot.id, startMs: slot.startMs, durationMs, root, composition });
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

  const seek = (tMs: number) => {
    pendingMs = tMs;
    if (!slots) return;
    for (const s of slots) {
      if (broken.has(s.slotId)) continue;
      const local = tMs - s.startMs;
      // Only active slots are rendered; HyperFrames hides the others.
      if (local < 0 || local > s.durationMs) continue;
      try {
        s.composition.seek(local);
      } catch (e) {
        fail(s.slotId, 'seek', e);
        broken.add(s.slotId);
        const host = s.root.parentElement;
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

  // Components measure text at build time (fitText), so fonts must be loaded first.
  const ready = loadFonts()
    .catch((e: unknown) => fail('*', 'fonts', e))
    .then(() => {
      slots = mountAll();
      seek(pendingMs);
    });

  return { ready, seek, errors, warnings };
}
