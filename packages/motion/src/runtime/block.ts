/**
 * Motionpop scenes inside a studio graphic block (spec 17 R4). Bundled to `dist/block-runtime.js`
 * and loaded by the studio page and by every composition document the studio assembles.
 *
 * A block's timeline calls `globalThis.__mpBlocks.mount(host, data)` once and then `seek(ms)` with
 * block-local time. The engine is the same one the compositions run, given a one-slot project
 * and a document whose only slot host is the block's element. Pure function of time.
 */
import { components } from '../components';
import { scenes } from '../scenes';
import type { CompileSlot, RuntimeProject } from '../compiler/types';
import { createEngine, type Engine } from './engine';
import { BUNDLED_FONTS } from '../fonts/font-faces';

export interface BlockData {
  /** The one-slot project: the slot runs from 0 to the block's duration. */
  project: RuntimeProject;
}

export interface MountedBlock {
  seek(ms: number): void;
}

/** Bundled font data (family → woff2 base64), injected by build-runtime's `define`. */
declare const __MP_FONTS__: Record<string, string>;

declare global {
  // eslint-disable-next-line no-var -- a page global the block timelines read through globalThis
  var __mpBlocks: { mount(host: HTMLElement, data: BlockData): MountedBlock } | undefined;
}

const FONT_STYLE_ID = 'mp-block-fonts';
const WEIGHT_RANGE = '100 900';

/** Registers the bundled families once per document (shadow roots use the document's fonts). */
function ensureFonts(doc: Document): void {
  if (doc.getElementById(FONT_STYLE_ID)) return;
  const data = __MP_FONTS__;
  const css = Object.keys(BUNDLED_FONTS)
    .filter((f) => typeof data[f] === 'string')
    .map(
      (f) =>
        `@font-face{font-family:'${f}';src:url(data:font/woff2;base64,${data[f]}) format('woff2');font-weight:${WEIGHT_RANGE};font-style:normal;font-display:block}`,
    )
    .join('');
  const style = doc.createElement('style');
  style.id = FONT_STYLE_ID;
  style.textContent = css;
  (doc.head ?? doc.documentElement).appendChild(style);
}

/** The real document, except that the slot's host is the block element. */
function scopedDocument(doc: Document, slotId: string, host: HTMLElement): Document {
  return new Proxy(doc, {
    get(target, prop) {
      if (prop === 'getElementById') return (id: string) => (id === slotId ? host : null);
      const value: unknown = Reflect.get(target, prop);
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}

function mount(host: HTMLElement, data: BlockData): MountedBlock {
  const doc = host.ownerDocument;
  ensureFonts(doc);
  const project = data.project;
  const slot: CompileSlot | undefined = project.slots[0];
  if (!slot) return { seek: () => undefined };
  host.style.position = 'absolute';
  host.style.inset = '0';
  host.style.overflow = 'hidden';
  host.style.background = project.style.colors.bg;
  const engine: Engine = createEngine(project, {
    doc: scopedDocument(doc, slot.id, host),
    components: { ...components, ...scenes },
    fonts: doc.fonts,
  });
  return { seek: (ms) => engine.seek(Math.max(0, Math.round(ms))) };
}

globalThis.__mpBlocks = { mount };
