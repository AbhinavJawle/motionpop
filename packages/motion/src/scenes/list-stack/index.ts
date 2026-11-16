import { z } from 'zod';
import type { Format } from '../../contract';
import type { Box } from '../../core/safe-area';
import { enter, mark, stage, type Action, type Actor, type TextSlot } from '../../engine/stage';
import { defineScene, type SceneCue } from '../define';
import { column } from '../layout';

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export const LIST_MIN_ITEMS = 3;
export const LIST_MAX_ITEMS = 5;

const listItem = z
  .string()
  .min(1)
  .max(40)
  .refine((s) => s.trim().length > 0 && wordCount(s) <= 6, 'one to six words');

export const listStackContent = z
  .object({
    title: z
      .string()
      .max(48)
      .refine((s) => wordCount(s) <= 7, 'at most 7 words')
      .optional()
      .describe('What the list is, at most 7 words, e.g. "Three rules for saving"'),
    items: z
      .array(listItem)
      .min(LIST_MIN_ITEMS)
      .max(LIST_MAX_ITEMS)
      .describe('3 to 5 items in the order spoken, each 1 to 6 of the spoken words'),
    highlight: z
      .number()
      .int()
      .min(0)
      .max(LIST_MAX_ITEMS - 1)
      .optional()
      .describe('Index of the item to mark (0 = first); leave out when none stands out'),
  })
  .refine((c) => c.highlight === undefined || c.highlight < c.items.length, {
    message: 'highlight must be the index of one of the items',
    path: ['highlight'],
  });
export type ListStackContent = z.infer<typeof listStackContent>;

const ORDINALS = new Set([
  'first',
  'firstly',
  'second',
  'secondly',
  'third',
  'thirdly',
  'fourth',
  'fourthly',
  'fifth',
  'finally',
  'lastly',
]);
const FILLERS = new Set(['um', 'uh', 'erm', 'like', 'and', 'or', 'then']);
const bare = (w: string) => w.replace(/^[^\p{L}\p{N}$€£]+|[^\p{L}\p{N}%]+$/gu, '');
const ends = (w: string) => /[.!?]["')\]]*$/.test(w);

/** A list item from spoken words: at most 6 words and 40 characters, first letter upper case. */
function itemOf(ws: readonly string[], keepEnd = false): string | null {
  const out = ws.map(bare).filter(Boolean);
  while (out.length > 0 && FILLERS.has((out[0] as string).toLowerCase())) out.shift();
  while (out.length > 6 || (out.length > 0 && out.join(' ').length > 40)) {
    if (keepEnd) out.shift();
    else out.pop();
  }
  const s = out.join(' ');
  return s ? s[0]!.toUpperCase() + s.slice(1) : null;
}

/**
 * Safe default from the slot's words (spec 07 R1.4): the items after "first", "second",
 * "third"…, or the parts of "A, B and C". Each item is made of spoken words only. Null when the
 * words give fewer than 3 items.
 */
export function listFromWords(words: readonly string[]): ListStackContent | null {
  const ws = words.map((w) => w.trim()).filter(Boolean);
  const ord = ws.flatMap((w, i) => (ORDINALS.has(bare(w).toLowerCase()) ? [i] : []));
  let items: (string | null)[] = [];
  if (ord.length >= LIST_MIN_ITEMS) {
    items = ord.map((at, k) => {
      const out: string[] = [];
      for (let i = at + 1; i < (ord[k + 1] ?? ws.length); i++) {
        out.push(ws[i] as string);
        if (ends(ws[i] as string) || /[,;:]$/.test(ws[i] as string)) break;
      }
      return itemOf(out);
    });
  } else {
    // "A, B and C": parts split at commas, the last at its "and" / "or", within one sentence.
    let start = 0;
    for (let i = 0; i <= ws.length; i++) {
      if (i < ws.length && !ends(ws[i] as string)) continue;
      const sentence = ws.slice(start, i + 1);
      start = i + 1;
      const parts: string[][] = [[]];
      for (const w of sentence) {
        (parts[parts.length - 1] as string[]).push(w);
        if (/,$/.test(w)) parts.push([]);
      }
      if (parts.length < 2) continue;
      const last = parts.pop() as string[];
      const join = last.findIndex((w) => /^(and|or)$/i.test(bare(w)));
      if (join < 0 && parts.length < LIST_MIN_ITEMS - 1) continue;
      const tail = join < 0 ? [last] : [last.slice(0, join), last.slice(join + 1)];
      const all = [...parts, ...tail].filter((p) => p.some((w) => bare(w)));
      if (all.length < LIST_MIN_ITEMS) continue;
      // The first part carries the lead-in ("You need time"): keep as many words as the others.
      const longest = Math.max(1, Math.min(3, ...all.slice(1).map((p) => p.length)));
      const first = all[0] as string[];
      items = [itemOf(first.slice(-longest), true), ...all.slice(1).map((p) => itemOf(p))];
      break;
    }
  }
  const ok = items.filter((x): x is string => x !== null).slice(0, LIST_MAX_ITEMS);
  return ok.length >= LIST_MIN_ITEMS && ok.length === Math.min(items.length, LIST_MAX_ITEMS)
    ? { items: ok }
    : null;
}

export interface ListRowSlots {
  /** "01" (numbered, cards), absent for bullets. */
  num?: TextSlot;
  /** The bullet disc (bullets). */
  dot?: Box;
  text: TextSlot;
  /** The card (cards): the look's card, else an accent bar on its edge. */
  card?: Box;
  bar?: Box;
}

export interface ListSlots {
  title?: TextSlot;
  rows: ListRowSlots[];
  /** Rows sit side by side (cards in 16:9) instead of stacked. */
  across: boolean;
}

const slot = (
  box: Box,
  max: number,
  lines: number,
  min: number,
  align: 'left' | 'center' = 'left',
): TextSlot => ({
  box,
  max: Math.max(1, max),
  min: Math.max(1, Math.round(max * min)),
  lineHeight: 1.2,
  maxLines: lines,
  align,
});

/** Per-format layout of each variant, in frame pixels inside the camera-safe area. */
export function layoutListStack(
  variant: string,
  format: Format,
  frameW: number,
  frameH: number,
  safe: Box,
  has: { items: readonly string[]; title: boolean },
): ListSlots {
  const wide = format === '16:9';
  const tall = format === '9:16';
  const by = <T>(w: T, t: T, s: T) => (wide ? w : tall ? t : s);
  const H = frameH;
  const n = has.items.length;
  const titleLines = wide ? 1 : 2;
  // Five cards side by side are too narrow for a long word at a readable size: they stack.
  const across = variant === 'cards' && wide && n <= 4;
  const area = column(safe, across ? 0.96 : by(0.74, 1, 0.92));
  const bar = Math.max(4, Math.round(H * 0.006));

  const dims = (k: number) => {
    const titleMax = Math.round(H * by(0.066, 0.042, 0.058) * k);
    const itemMax = Math.round(
      H *
        (across
          ? 0.05
          : variant === 'bullets'
            ? by(0.062, 0.04, 0.05)
            : variant === 'cards'
              ? by(0.058, 0.04, 0.048)
              : by(0.066, 0.044, 0.056)) *
        k,
    );
    const pad = Math.round(H * by(0.026, 0.016, 0.024) * k);
    return {
      titleMax,
      titleH: has.title ? Math.ceil(titleMax * 1.2 * titleLines) : 0,
      titleGap: has.title ? Math.round(titleMax * by(0.9, 0.8, 0.8)) : 0,
      itemMax,
      // Cards side by side are narrow: up to 3 lines each.
      itemH: Math.ceil(itemMax * 1.2 * (across ? 3 : 2)),
      numMax: across ? Math.round(itemMax * 0.62) : itemMax,
      rowGap: Math.round(itemMax * (variant === 'cards' ? 0.45 : tall ? 1 : 0.6)),
      pad: variant === 'cards' ? pad : 0,
    };
  };
  /** Stacked rows: where the item column starts, from the area's left edge. */
  const textOffset = (z: ReturnType<typeof dims>) =>
    z.pad +
    (variant === 'cards' ? bar : 0) +
    (variant === 'bullets' ? Math.round(z.itemMax * 0.9) : Math.round(z.numMax * 1.7));
  /**
   * Lines a stacked item will set at full size (an estimate from its length: about 0.56 em per
   * character), so a list of short items isn't laid out, and shrunk, for two lines each.
   */
  const linesOf = (z: ReturnType<typeof dims>, i: number) =>
    (has.items[i] ?? '').length * 0.56 * z.itemMax <= area.width - textOffset(z) - z.pad ? 1 : 2;
  const rowH = (z: ReturnType<typeof dims>, i: number) =>
    Math.ceil(z.itemMax * 1.2 * linesOf(z, i)) + z.pad * 2;
  const rowsH = (z: ReturnType<typeof dims>) =>
    across
      ? z.pad * 2 + Math.ceil(z.numMax * 1.2) + Math.round(z.numMax * 0.5) + z.itemH
      : has.items.reduce((h, _, i) => h + rowH(z, i), 0) + (n - 1) * z.rowGap;
  const total = (k: number) => {
    const z = dims(k);
    return z.titleH + z.titleGap + rowsH(z);
  };
  const t1 = total(1);
  const z = dims(t1 > safe.height ? (safe.height / t1) * 0.98 : 1);
  const y0 =
    safe.y + Math.floor(Math.max(0, safe.height - (z.titleH + z.titleGap + rowsH(z))) * 0.45);
  const title = has.title
    ? {
        title: slot(
          {
            x: across ? area.x : column(safe, by(0.8, 1, 0.94)).x,
            y: y0,
            width: across ? area.width : column(safe, by(0.8, 1, 0.94)).width,
            height: z.titleH,
          },
          z.titleMax,
          titleLines,
          0.6,
          'center',
        ),
      }
    : {};
  const top = y0 + z.titleH + z.titleGap;

  if (across) {
    // Cards side by side: the number on top, the item under it.
    const g = Math.round(frameW * 0.022);
    const cw = Math.floor((area.width - g * (n - 1)) / n);
    const ch = rowsH(z);
    return {
      ...title,
      across: true,
      rows: Array.from({ length: n }, (_, i) => {
        const x = area.x + i * (cw + g);
        const inner = { x: x + z.pad, width: cw - z.pad * 2 };
        const numH = Math.ceil(z.numMax * 1.2);
        return {
          num: slot({ ...inner, y: top + z.pad, height: numH }, z.numMax, 1, 0.8),
          text: slot(
            { ...inner, y: top + z.pad + numH + Math.round(z.numMax * 0.5), height: z.itemH },
            z.itemMax,
            3,
            0.55,
          ),
          card: { x, y: top, width: cw, height: ch },
          bar: { x, y: top, width: cw, height: bar },
        };
      }),
    };
  }

  // Stacked rows: a number (or bullet) column, then the item.
  const numW = variant === 'bullets' ? Math.round(z.itemMax * 0.9) : Math.round(z.numMax * 1.7);
  let y = top;
  return {
    ...title,
    across: false,
    rows: Array.from({ length: n }, (_, i) => {
      const h = rowH(z, i);
      const itemH = h - z.pad * 2;
      const rowTop = y;
      y += h + z.rowGap;
      const x0 = area.x + z.pad + (variant === 'cards' ? bar : 0);
      const textX = x0 + numW;
      const lineH = Math.ceil(z.itemMax * 1.2);
      const d = Math.max(8, Math.round(z.itemMax * 0.3));
      return {
        ...(variant === 'bullets'
          ? {
              dot: {
                x: x0,
                y: rowTop + z.pad + Math.round((lineH - d) / 2),
                width: d,
                height: d,
              },
            }
          : {
              num: slot(
                {
                  x: x0,
                  y: rowTop + z.pad,
                  width: numW - Math.round(z.itemMax * 0.3),
                  height: lineH,
                },
                z.numMax,
                1,
                0.8,
              ),
            }),
        text: slot(
          {
            x: textX,
            y: rowTop + z.pad,
            width: area.x + area.width - z.pad - textX,
            height: itemH,
          },
          z.itemMax,
          2,
          0.6,
        ),
        ...(variant === 'cards'
          ? {
              card: { x: area.x, y: rowTop, width: area.width, height: h },
              bar: { x: area.x, y: rowTop, width: bar, height: h },
            }
          : {}),
      };
    }),
  };
}

const row0HasCard = (L: ListSlots) => L.rows.some((r) => r.card);

/** Width of a text actor's widest set line, in frame px from its box's left edge (0 without layout). */
function setWidth(a: Actor): number {
  const doc = a.el.ownerDocument;
  if (!doc.createRange) return 0;
  const range = doc.createRange();
  range.selectNodeContents(a.el);
  const rs = Array.from(range.getClientRects?.() ?? []).filter((r) => r.width > 0);
  if (rs.length === 0) return 0;
  const el = a.el.getBoundingClientRect();
  const k = el.width > 0 ? a.box.width / el.width : 1;
  return (Math.max(...rs.map((r) => r.right)) - el.left) * k;
}

const itemCue = (k: number): SceneCue => ({
  id: `i${k}`,
  about:
    k === 1
      ? 'the first item lands, on its first spoken word'
      : `item ${k} lands, on its first spoken word`,
  snap: true,
  // Items arrive one after another; a quick entrance keeps a 5-item list moving.
  leadMs: 420,
});

/**
 * list-stack: 3 to 5 items, each revealed on the word that starts it. Numbered rows, the look's
 * cards, or bullets; the highlighted item gets the look's emphasis mark as it lands.
 */
export const listStack = defineScene<ListStackContent>({
  id: 'list-stack',
  name: 'List stack',
  category: 'text',
  useWhen: 'the narration lists or counts 3 to 5 things: steps, reasons, tips, ingredients',
  content: listStackContent,
  defaultContent: {
    title: 'Three rules for saving',
    items: ['Pay yourself first', 'Automate every transfer', 'Never touch the buffer'],
  },
  variants: [
    { id: 'numbered', about: 'numbered rows, 01 to 05; the safe default' },
    { id: 'cards', about: 'each item on its own card; for the big moment' },
    { id: 'bullets', about: 'compact rows with bullets; best for longer items' },
  ],
  peakVariant: 'cards',
  cues: [
    { id: 'title', about: 'the title of the list appears', optional: true, snap: true },
    ...Array.from({ length: LIST_MAX_ITEMS }, (_, i) => itemCue(i + 1)),
  ],
  focalCue: 'i1',
  imageRoles: [],
  safe: listFromWords,
  // min: five 6-word items, each read in full before the exit; ideal: also a 7-word title.
  durationMs: { min: 5600, ideal: 6400, max: 12000 },
  formats: ['16:9', '9:16', '1:1'],
  build(ctx, score, variant) {
    const c = score.content;
    const used = new Set([...(c.title ? ['title'] : []), ...c.items.map((_, i) => `i${i + 1}`)]);
    const st = stage(ctx, {
      cues: this.cues.filter((q) => used.has(q.id)),
      anchors: score.beats,
      centre: true,
      // The highlight is the only mark: an engine underline would read as a second emphasis.
      decorJuice: false,
    });
    const L = layoutListStack(variant, ctx.format, ctx.width, ctx.height, st.safe, {
      items: c.items,
      title: Boolean(c.title),
    });
    const title =
      L.title && c.title
        ? st.text('title', c.title, L.title, { role: 'display', balance: true })
        : null;
    const rows = L.rows.map((r, i) => ({
      num: r.num
        ? st.text(`num-${i + 1}`, String(i + 1).padStart(2, '0'), r.num, {
            role: L.across ? 'eyebrow' : 'display',
            truncatable: false,
          })
        : null,
      text: st.text(`item-${i + 1}`, c.items[i] as string, r.text, {
        role: variant === 'bullets' ? 'body' : 'display',
        balance: true,
        keepWords: true,
        ...(i === 0 ? { focal: true } : {}),
      }),
    }));
    // Numbers read as a column beside the items: muted, the items carry the ink.
    for (const r of rows) if (r.num && !L.across) r.num.el.style.color = ctx.style.colors.muted;
    // All items share one size, so the list reads as one block.
    const size = Math.min(...rows.map((r) => r.text.size).filter((s) => s > 0));
    if (Number.isFinite(size))
      for (const r of rows)
        if (r.text.size > size) {
          r.text.el.style.fontSize = `${size}px`;
          r.text.size = size;
        }

    // Stacked rows reserve two lines; close up the ones that set one (layout only).
    const setH = (a: Actor) => a.el.offsetHeight;
    if (!L.across && rows.every((r) => setH(r.text) > 0)) {
      let shift = 0;
      rows.forEach((r, i) => {
        const row = L.rows[i] as ListRowSlots;
        if (shift) {
          st.nudge(r.text, -shift);
          if (r.num) st.nudge(r.num, -shift);
          if (row.dot) row.dot = { ...row.dot, y: row.dot.y - shift };
          if (row.card) row.card = { ...row.card, y: row.card.y - shift };
          if (row.bar) row.bar = { ...row.bar, y: row.bar.y - shift };
        }
        const spare = Math.max(0, r.text.box.height - setH(r.text));
        if (row.card) row.card = { ...row.card, height: row.card.height - spare };
        if (row.bar) row.bar = { ...row.bar, height: row.bar.height - spare };
        shift += spare;
      });
    }
    // Rows without cards: centre the block on what it really sets, so short items under a
    // centred title don't hang off to the left (16:9 review).
    if (!row0HasCard(L)) {
      const right = Math.max(...rows.map((r) => r.text.box.x + setWidth(r.text)));
      const left = Math.min(
        ...rows.map((r, i) => r.num?.box.x ?? (L.rows[i] as ListRowSlots).dot?.x ?? r.text.box.x),
      );
      if (rows.every((r) => setWidth(r.text) > 0)) {
        const area = L.rows.length ? (L.rows[0] as ListRowSlots).text.box : null;
        const mid = st.safe.x + st.safe.width / 2;
        const dx = area ? Math.round(mid - (left + right) / 2) : 0;
        if (dx > 0) {
          const edge = st.safe.x + st.safe.width;
          for (const r of rows) {
            st.nudge(r.text, 0, dx);
            if (r.num) st.nudge(r.num, 0, dx);
            // The box keeps inside the safe area (its set lines already fit the narrower width).
            const width = Math.min(r.text.box.width, Math.floor(edge - r.text.box.x));
            r.text.box = { ...r.text.box, width };
            r.text.el.style.width = `${width}px`;
          }
          for (const row of L.rows) if (row.dot) row.dot = { ...row.dot, x: row.dot.x + dx };
        }
      }
    }
    // Cards side by side: every card as tall as the tallest set item, not the 3 lines reserved.
    if (L.across && rows.every((r) => setH(r.text) > 0)) {
      const spare = Math.min(...rows.map((r) => r.text.box.height - setH(r.text)));
      if (spare > 0)
        for (const row of L.rows)
          if (row.card) row.card = { ...row.card, height: row.card.height - spare };
    }
    if (title && setH(title) > 0 && title.box.height > setH(title))
      st.nudge(title, title.box.height - setH(title));

    const hi = c.highlight;
    if (title) st.on('title', enter(title));
    rows.forEach((r, i) => {
      const row = L.rows[i] as ListRowSlots;
      const carried = [r.num, r.text].filter((a): a is Actor => a !== null);
      const card = row.card
        ? st.surface(`card-${i + 1}`, 'card', carried, { box: row.card })
        : null;
      const bar =
        row.bar && !card
          ? st.shape(`bar-${i + 1}`, row.bar, {
              color: 'accent',
              radius: 0,
              origin: L.across ? 'left' : 'bottom',
            })
          : null;
      const dot = row.dot
        ? st.shape(`dot-${i + 1}`, row.dot, {
            color: 'accent',
            radius: row.dot.width,
            origin: 'center',
          })
        : null;
      const actions: Action[] = [
        ...(card ? [enter(card, 'slam')] : []),
        ...(bar ? [enter(bar, 'draw')] : []),
        ...(dot ? [enter(dot, 'pop')] : []),
        ...carried.map((a) => enter(a)),
        ...(hi === i ? [mark(r.text, 'emphasis')] : []),
      ];
      st.on(`i${i + 1}`, ...actions);
    });
    return st.compile();
  },
});
