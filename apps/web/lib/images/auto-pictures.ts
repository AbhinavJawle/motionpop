import { tagSpans } from '@motionpop/ai';
import { numberCompanion, picturableNouns } from '@motionpop/motion';
import type { EditorProject, Slot } from '@motionpop/schemas';
import { z } from 'zod';
import { imageRoleOf } from './generate';

/**
 * First-load pictures (spec 07c R1): when a project opens with graphics that could carry a
 * picture and have none, real photos under open licences (CC0, CC BY, through our Openverse
 * route) arrive by themselves, with no confirm and no credits. The paid image model is never
 * called from here. Queries come from what the narration names: places from the tagger first,
 * then concrete nouns. Everything that decides is pure and tested without the network; the
 * network sits behind `AutoPictureDeps`.
 */

/** Most searches one project spends (the anonymous API is rate-limited; Remote Config caps lower). */
export const AUTO_PICTURES_MAX = 6;

export interface PictureQuery {
  slotId: string;
  role: string;
  /** What we search for (2–80 characters, a place or a common noun). */
  query: string;
  /** Why: shown in the picture's subject. */
  from: 'place' | 'noun';
}

/**
 * Words that are brands, products or companies (hackathon rule: none in demo content). Queries
 * are built from places and common nouns only, so this is a second fence, not the first.
 */
const BRAND_WORDS = new Set(
  (
    'apple google alphabet microsoft amazon meta facebook instagram whatsapp youtube tiktok ' +
    'twitter netflix tesla nvidia intel samsung sony nike adidas coca cola pepsi mcdonalds ' +
    'starbucks disney uber airbnb spotify oracle ibm openai anthropic gemini chatgpt iphone ' +
    'android windows playstation xbox nintendo lego boeing airbus toyota ford bmw mercedes ' +
    'ferrari walmart ikea visa mastercard paypal bitcoin ethereum'
  ).split(' '),
);

/** A result whose title looks like a logo, a mark or a graphic rather than a photograph. */
export function looksLikeLogo(title: string): boolean {
  if (/[™®©]/.test(title)) return true;
  if (
    /\b(logo|logos|logotype|wordmark|trademark|brand|branding|icon|icons|emblem|badge|seal|coat of arms|crest|sticker|clip ?art|vector|svg|screenshot|meme|poster|advert|advertisement|banner|infographic|diagram|chart|map of|flag of|text|font|lettering)\b/i.test(
      title,
    )
  )
    return true;
  return title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((w) => BRAND_WORDS.has(w));
}

/** A query is never a brand and never too short or long for the search route. */
export function cleanQuery(q: string): string | null {
  const s = q.replace(/\s+/g, ' ').trim();
  if (s.length < 2 || s.length > 80) return null;
  if (
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .some((w) => BRAND_WORDS.has(w))
  )
    return null;
  return s;
}

/**
 * A capitalised name that ends in a landform is a place, not a person or a company ("Suez Canal",
 * "Red Sea", "Gobi Desert"). Other names are never searched.
 */
const LANDFORM =
  /\b(canal|sea|ocean|river|lake|bay|gulf|strait|straits|channel|island|islands|desert|valley|mountains?|peninsula|falls|glacier|volcano|reef|coast|delta|forest|plains?)\W*$/i;

const words = (p: EditorProject, s: Slot) => p.transcript.words.slice(s.wordStart, s.wordEnd + 1);

/** The slot's ready picture, if it has one. */
const hasPicture = (p: EditorProject, s: Slot): boolean => {
  const id = (s.params as { images?: { assetId?: unknown }[] }).images?.[0]?.assetId;
  return (
    typeof id === 'string' && (p.assets ?? []).some((a) => a.id === id && a.status === 'ready')
  );
};

/**
 * A stat that becomes a physical number (a grid, dots, icons, a ruler) reads better without a
 * picture beside it, so it isn't searched for (spec 07c R1.3).
 */
function countsAlready(p: EditorProject, s: Slot): boolean {
  if (s.componentId !== 'stat-punch') return false;
  const c = (s.params as { content?: Record<string, unknown> }).content ?? {};
  if (typeof c['value'] !== 'number') return false;
  const comp = numberCompanion({
    value: c['value'],
    prefix: typeof c['prefix'] === 'string' ? c['prefix'] : undefined,
    suffix: typeof c['suffix'] === 'string' ? c['suffix'] : undefined,
    label: typeof c['label'] === 'string' ? c['label'] : '',
    spoken: words(p, s).map((w) => w.text),
  });
  return comp !== null && comp.kind !== 'stamp';
}

/**
 * The searches for a project, in time order, at most `max`, skipping slots already `tried`. One
 * query per slot: a place it names (the tagger's places), else its first concrete noun. A query
 * already used by an earlier slot is still searched (cached), and that slot takes the next hit.
 */
export function pictureQueries(
  p: EditorProject,
  opts: { max?: number; tried?: ReadonlySet<string> } = {},
): PictureQuery[] {
  if (p.film) return [];
  const max = Math.max(0, Math.min(AUTO_PICTURES_MAX, opts.max ?? AUTO_PICTURES_MAX));
  const tried = opts.tried ?? new Set<string>();
  const spans = tagSpans(p.transcript.words);
  const out: PictureQuery[] = [];
  for (const s of [...p.slots].sort((a, b) => a.startMs - b.startMs)) {
    if (out.length >= max) break;
    if (tried.has(s.id) || s.status === 'failed' || s.status === 'generating') continue;
    const role = imageRoleOf(s.componentId);
    if (!role || hasPicture(p, s) || countsAlready(p, s)) continue;
    const place = spans.find(
      (sp) =>
        (sp.kind === 'place' || (sp.kind === 'name' && LANDFORM.test(sp.text))) &&
        sp.wordStart >= s.wordStart &&
        sp.wordEnd <= s.wordEnd,
    );
    const placeQ = place ? cleanQuery(place.text.replace(/[^\p{L}\p{N}\s'-]/gu, '')) : null;
    if (placeQ) {
      out.push({ slotId: s.id, role, query: placeQ, from: 'place' });
      continue;
    }
    const noun = picturableNouns(words(p, s).map((w) => w.text))[0];
    const nounQ = noun ? cleanQuery(noun) : null;
    if (nounQ) out.push({ slotId: s.id, role, query: nounQ, from: 'noun' });
  }
  return out;
}

export const MediaHitSchema = z.object({
  id: z.string(),
  title: z.string(),
  thumb: z.string(),
  width: z.number(),
  height: z.number(),
  license: z.string(),
  attribution: z.string(),
});
export type MediaHit = z.infer<typeof MediaHitSchema>;

/**
 * The hit to use: a photo-shaped picture (not a logo, not a sliver), the `skip`-th such one, so
 * a second slot with the same query gets a different picture. Null when none qualifies.
 */
export function pickHit(hits: readonly MediaHit[], skip = 0): MediaHit | null {
  const ok = hits.filter((h) => {
    if (!['cc0', 'by'].includes(h.license) || looksLikeLogo(h.title)) return false;
    if (h.width > 0 && h.height > 0) {
      const r = h.width / h.height;
      if (r < 0.5 || r > 2.2 || Math.max(h.width, h.height) < 480) return false;
    }
    return true;
  });
  return ok[skip] ?? null;
}

export interface AutoPictureDeps {
  getProject: () => EditorProject | null;
  /** Search (cached by the caller). Throws on failure; `{ limited: true }` stops the run. */
  search: (q: string) => Promise<MediaHit[] | { limited: true }>;
  /** The picture's bytes (full size, the thumbnail when that fails). */
  fetchImage: (hit: MediaHit) => Promise<Blob>;
  /** Stores and attaches it (`addOwnImage`). */
  attach: (req: {
    slotId: string;
    role: string;
    subject: string;
    blob: Blob;
    attribution: string;
  }) => Promise<boolean>;
  /** Slot ids already tried for this project (persisted per browser). */
  tried: () => Set<string>;
  markTried: (slotId: string) => void;
  cancelled: () => boolean;
  max?: number;
}

/**
 * Run the searches one at a time and attach what they find. Fails soft: a search error skips
 * that slot, a rate limit stops the run, and a slot that changed meanwhile is left alone.
 * Returns how many pictures were attached.
 */
export async function runAutoPictures(deps: AutoPictureDeps): Promise<number> {
  const start = deps.getProject();
  if (!start) return 0;
  const queries = pictureQueries(start, {
    tried: deps.tried(),
    ...(deps.max !== undefined ? { max: deps.max } : {}),
  });
  const used = new Map<string, number>();
  let added = 0;
  for (const q of queries) {
    if (deps.cancelled()) break;
    deps.markTried(q.slotId);
    let hits: MediaHit[] | { limited: true };
    try {
      hits = await deps.search(q.query);
    } catch {
      continue;
    }
    if (!Array.isArray(hits)) break;
    const n = used.get(q.query) ?? 0;
    const hit = pickHit(hits, n);
    used.set(q.query, n + 1);
    if (!hit || deps.cancelled()) continue;
    // The user may have deleted the slot, changed its graphic or added a picture meanwhile.
    const now = deps.getProject();
    const slot = now?.slots.find((s) => s.id === q.slotId);
    if (!now || !slot || imageRoleOf(slot.componentId) !== q.role || hasPicture(now, slot))
      continue;
    try {
      const blob = await deps.fetchImage(hit);
      if (deps.cancelled()) break;
      const ok = await deps.attach({
        slotId: q.slotId,
        role: q.role,
        subject: q.query,
        blob,
        attribution: hit.attribution,
      });
      if (ok) added++;
    } catch {
      // One picture that won't load never stops the others.
    }
  }
  return added;
}
