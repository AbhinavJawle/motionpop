import { z } from 'zod';
import type { Format } from '../../contract';
import type { Box } from '../../core/safe-area';
import { enter, mark, stage, type Action, type Actor, type TextSlot } from '../../engine/stage';
import { defineScene } from '../define';
import { isContentWord } from '../hook-statement';
import { column, columns, stack, type Row } from '../layout';

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

const sideName = (which: string, example: string) =>
  z
    .string()
    .min(1)
    .max(24)
    .refine((s) => s.trim().length > 0 && wordCount(s) <= 3, 'one to three words')
    .describe(`The ${which} side, as spoken, one to three words, e.g. "${example}"`);
const sideDetail = (which: string) =>
  z
    .string()
    .max(40)
    .refine((s) => wordCount(s) <= 6, 'at most 6 words')
    .optional()
    .describe(`One short fact about the ${which} side from the narration, at most 6 words`);

export const versusContent = z.object({
  left: sideName('first', 'Renting'),
  leftDetail: sideDetail('first'),
  right: sideName('second', 'Buying'),
  rightDetail: sideDetail('second'),
  verdict: z
    .string()
    .max(60)
    .refine((s) => wordCount(s) <= 8, 'at most 8 words')
    .optional()
    .describe('The conclusion the narration draws, at most 8 words'),
  winner: z
    .enum(['left', 'right'])
    .optional()
    .describe('The side the verdict favours; leave it out when neither side wins'),
});
export type VersusContent = z.infer<typeof versusContent>;

/** The first letter or digit of a name, for its image-free tile. */
export function initialOf(name: string): string {
  const m = /[\p{L}\p{N}]/u.exec(name);
  return (m?.[0] ?? name.trim()[0] ?? '?').toUpperCase();
}

const SEPARATORS = new Set(['vs', 'versus', 'or', 'against']);
const FILLERS = new Set(['um', 'uh', 'erm', 'like']);
const bare = (w: string) => w.replace(/^[^\p{L}\p{N}$€£]+|[^\p{L}\p{N}%]+$/gu, '');
const endsClause = (w: string) => /[.,;:!?…]$/.test(w);
const usable = (w: string) => {
  const b = bare(w);
  return b.length > 0 && isContentWord(b) && !FILLERS.has(b.toLowerCase());
};

/**
 * A side's name from up to 3 words (at most 24 characters), first letter upper case. Words far
 * from the separator go first when it is too long (`keepEnd` for the side before it).
 */
function nameFrom(ws: readonly string[], keepEnd = false): string | null {
  const out = ws.map(bare).filter(Boolean);
  while (out.length > 0 && out.join(' ').length > 24) {
    if (keepEnd) out.shift();
    else out.pop();
  }
  const s = out.join(' ');
  return s ? s[0]!.toUpperCase() + s.slice(1) : null;
}

/**
 * Safe default from the slot's words: the content words on each side of the first "vs",
 * "versus", "or" or "against" ("Electric cars versus petrol cars" → Electric cars / Petrol
 * cars). Null when either side has no content word next to the separator.
 */
export function versusFromWords(words: readonly string[]): VersusContent | null {
  const ws = words.map((w) => w.trim()).filter(Boolean);
  for (let i = 1; i < ws.length - 1; i++) {
    if (!SEPARATORS.has(bare(ws[i] as string).toLowerCase())) continue;
    const before: string[] = [];
    for (let k = i - 1; k >= 0 && before.length < 3; k--) {
      const w = ws[k] as string;
      // The word next to the separator may close its clause ("Cats, or dogs"); earlier ones don't.
      if (!usable(w) || (k < i - 1 && endsClause(w))) break;
      before.unshift(w);
    }
    const after: string[] = [];
    for (let k = i + 1; k < ws.length && after.length < 3; k++) {
      const w = ws[k] as string;
      if (!usable(w)) break;
      after.push(w);
      if (endsClause(w)) break;
    }
    const left = nameFrom(before, true);
    const right = nameFrom(after);
    if (left && right) return { left, right };
  }
  return null;
}

export interface SideSlots {
  /** The image-free tile: the initial, set in a square box (the tile is drawn around it). */
  initial?: TextSlot;
  name: TextSlot;
  detail?: TextSlot;
}

export interface VersusSlots {
  left: SideSlots;
  right: SideSlots;
  verdict?: TextSlot;
  /** The "VS" label in a square box; its disc is drawn around it (split and face-off). */
  vs?: TextSlot;
  /** Divider direction: between columns ('v') or between stacked sides ('h'). */
  axis: 'v' | 'h';
  /** The area the block is centred in (re-packing moves rows inside it). */
  area: Box;
  /** Divider thickness in px. */
  rule: number;
}

/** A glyph centred in a square box: the line box is the square. */
function glyphSlot(box: Box, share: number): TextSlot {
  const size = Math.max(8, Math.round(box.height * share));
  return {
    box,
    max: size,
    min: Math.max(1, Math.round(size * 0.7)),
    lineHeight: box.height / size,
    maxLines: 1,
    align: 'center',
  };
}

const square = (cx: number, cy: number, d: number): Box => ({
  x: Math.round(cx - d / 2),
  y: Math.round(cy - d / 2),
  width: d,
  height: d,
});

/** Per-format layout of each variant, in frame pixels inside the camera-safe area. */
export function layoutVersus(
  variant: string,
  format: Format,
  frameW: number,
  frameH: number,
  safe: Box,
  has: { detail: boolean; verdict: boolean },
): VersusSlots {
  const wide = format === '16:9';
  const tall = format === '9:16';
  const by = <T>(w: T, t: T, s: T) => (wide ? w : tall ? t : s);
  const H = frameH;
  const rule = Math.max(3, Math.round(Math.min(frameW, frameH) * 0.004));
  /** A row's gap after it, in px, as `Row.gap` (a share of its own size). */
  const gap = (px: number, size: number) => px / (H * size);

  if (variant === 'ledger') return ledger();

  const split = variant !== 'face-off';
  // Changed by the task 23 review: names larger, and face-off (the peak) about twice split.
  const nameS = split ? by(0.09, 0.07, 0.075) : by(0.18, 0.14, 0.13);
  const detS = by(0.038, 0.029, 0.034);
  const verS = by(0.055, 0.036, 0.048);
  // Face-off cards hang below their names: the detail keeps clear of them.
  // Changed by the task 23 review: 0.3 of the huge name clears the card's padding (2 % of the
  // frame) without leaving the detail stranded.
  const nameGap = split ? 0.25 : 0.3;
  const verRow = (): Row[] =>
    has.verdict ? [{ id: 'verdict', size: verS, lines: 2, min: 0.6 }] : [];

  if (tall) {
    // One column: the first side, the VS disc on the divider, the second side, the verdict.
    const area = safe;
    // Names reserve one line at full size and may set two smaller ones (long names shrink), so
    // the block is sized for the usual one-line name instead of shrinking every row for two.
    const tile = split ? Math.round(H * 0.085) : 0;
    const d = Math.round(H * (split ? 0.06 : 0.075));
    const sideRows = (k: 'l' | 'r', last: boolean): Row[] => [
      ...(split
        ? [{ id: `tile-${k}`, size: tile / H / 1.2, gap: gap(H * 0.014, tile / H / 1.2) }]
        : []),
      {
        id: `name-${k}`,
        size: nameS,
        lines: 1,
        min: 0.45,
        gap: has.detail ? nameGap : gap(H * (last ? 0.045 : 0.028), nameS),
      },
      ...(has.detail
        ? [
            {
              id: `detail-${k}`,
              size: detS,
              lines: 2,
              min: 0.7,
              gap: gap(H * (last ? 0.045 : 0.028), detS),
            },
          ]
        : []),
    ];
    const rows: Row[] = [
      ...sideRows('l', false),
      { id: 'vs', size: d / H / 1.2, gap: gap(H * 0.028, d / H / 1.2) },
      ...sideRows('r', true),
      ...verRow(),
    ];
    const s = stack(area, H, rows, { align: 'center', bias: 0.45 });
    const side = (k: 'l' | 'r'): SideSlots => {
      const t = s[`tile-${k}`];
      const side = t ? t.box.height : 0;
      return {
        ...(t
          ? {
              initial: glyphSlot(square(t.box.x + t.box.width / 2, t.box.y + side / 2, side), 0.52),
            }
          : {}),
        name: { ...(s[`name-${k}`] as TextSlot), maxLines: 2 },
        ...(s[`detail-${k}`] ? { detail: s[`detail-${k}`] as TextSlot } : {}),
      };
    };
    const v = s['vs'] as TextSlot;
    return {
      left: side('l'),
      right: side('r'),
      ...(s['verdict'] ? { verdict: s['verdict'] } : {}),
      vs: glyphSlot(
        square(v.box.x + v.box.width / 2, v.box.y + v.box.height / 2, v.box.height),
        0.36,
      ),
      axis: 'h',
      area,
      rule,
    };
  }

  // Side by side (16:9 and 1:1): two columns with the divider and the VS disc in the gutter.
  const area = column(safe, by(0.94, 1, 1));
  // Face-off: the gutter holds the disc and both cards' padding, nothing else.
  const g = split ? by(0.14, 0, 0.16) : by(0.19, 0, 0.24);
  const [lc, rc] = columns(area, (1 - g) / 2, g);
  const tile = split ? Math.round(Math.min(H * by(0.2, 0, 0.15), lc.width * 0.6)) : 0;
  const rows: Row[] = [
    ...(split ? [{ id: 'tile', size: tile / H / 1.2, gap: gap(H * 0.035, tile / H / 1.2) }] : []),
    {
      id: 'name',
      size: nameS,
      // One line at full size; a long name sets two smaller ones (maxLines below).
      lines: 1,
      min: 0.45,
      gap: has.detail ? nameGap : has.verdict ? gap(H * 0.07, nameS) : 0,
    },
    ...(has.detail
      ? [
          {
            id: 'detail',
            size: detS,
            lines: 2,
            min: 0.7,
            gap: has.verdict ? gap(H * by(0.075, 0, 0.065), detS) : 0,
          },
        ]
      : []),
    ...verRow(),
  ];
  const s = stack(area, H, rows, { align: 'center', bias: 0.45 });
  const inCol = (sl: TextSlot, col: Box): TextSlot => ({
    ...sl,
    box: { ...sl.box, x: col.x, width: col.width },
  });
  const side = (col: Box): SideSlots => {
    const t = s['tile'];
    const d = t ? Math.min(t.box.height, Math.floor(col.width * 0.6)) : 0;
    return {
      ...(t ? { initial: glyphSlot(square(col.x + col.width / 2, t.box.y + d / 2, d), 0.52) } : {}),
      name: { ...inCol(s['name'] as TextSlot, col), maxLines: 2 },
      ...(s['detail'] ? { detail: inCol(s['detail'], col) } : {}),
    };
  };
  const left = side(lc);
  const right = side(rc);
  const gx0 = lc.x + lc.width;
  const gx1 = rc.x;
  const d = Math.round(
    Math.min(
      (gx1 - gx0) * (split ? 0.7 : 0.82),
      H * (split ? by(0.1, 0, 0.085) : by(0.12, 0, 0.1)),
    ),
  );
  const anchor = left.initial?.box ?? {
    ...left.name.box,
    height: Math.round(left.name.max * left.name.lineHeight),
  };
  const verdict = s['verdict']
    ? { ...s['verdict'], box: { ...s['verdict'].box, ...xOf(column(area, by(0.8, 1, 1))) } }
    : undefined;
  return {
    left,
    right,
    ...(verdict ? { verdict } : {}),
    vs: glyphSlot(square((gx0 + gx1) / 2, anchor.y + anchor.height / 2, d), 0.36),
    axis: 'v',
    area,
    rule,
  };

  /** Two rows, each a tile beside its name and detail, a rule between them, the verdict last. */
  function ledger(): VersusSlots {
    // 16:9 keeps the block near the centre: a full-width rule under short names looks empty.
    const area = column(safe, by(0.7, 1, 0.94));
    const vl = 2;
    const dims = (k: number) => {
      const px = (share: number) => Math.round(H * share * k);
      const t = px(by(0.2, 0.1, 0.15));
      const nameMax = px(by(0.085, 0.06, 0.07));
      const detMax = px(by(0.04, 0.03, 0.034));
      const verMax = px(by(0.052, 0.036, 0.046));
      // One line at full size; a long name may set two smaller ones.
      const nameH = Math.ceil(nameMax * 1.2);
      const gapND = Math.round(nameMax * 0.2);
      const detH = has.detail ? Math.ceil(detMax * 1.2 * 2) : 0;
      const block = nameH + (has.detail ? gapND + detH : 0);
      const row = Math.max(t, block);
      const ruleGap = px(by(0.045, 0.03, 0.04));
      const verGap = px(by(0.06, 0.04, 0.05));
      const verH = has.verdict ? Math.ceil(verMax * 1.2 * vl) : 0;
      const total = row * 2 + ruleGap * 2 + rule + (has.verdict ? verGap + verH : 0);
      const gx = px(by(0.035, 0.025, 0.03));
      return {
        t,
        gx,
        nameMax,
        detMax,
        verMax,
        nameH,
        gapND,
        detH,
        block,
        row,
        ruleGap,
        verGap,
        verH,
        total,
      };
    };
    const one = dims(1);
    // A block taller than the area scales down as a whole.
    const z = one.total > area.height ? dims((area.height / one.total) * 0.98) : one;
    const { verGap, verH, total } = z;
    const y0 = area.y + Math.floor(Math.max(0, area.height - total) * 0.45);
    const textX = area.x + z.t + z.gx;
    const textW = area.x + area.width - textX;
    const slot = (box: Box, max: number, lines: number, min: number): TextSlot => ({
      box,
      max,
      min: Math.max(1, Math.round(max * min)),
      lineHeight: 1.2,
      maxLines: lines,
      align: 'left',
    });
    const row = (top: number): SideSlots => {
      const ty = top + Math.floor((z.row - z.block) / 2);
      return {
        initial: glyphSlot(
          { x: area.x, y: top + Math.floor((z.row - z.t) / 2), width: z.t, height: z.t },
          0.52,
        ),
        name: slot({ x: textX, y: ty, width: textW, height: z.nameH }, z.nameMax, 2, 0.45),
        ...(has.detail
          ? {
              detail: slot(
                { x: textX, y: ty + z.nameH + z.gapND, width: textW, height: z.detH },
                z.detMax,
                2,
                0.7,
              ),
            }
          : {}),
      };
    };
    const rTop = y0 + z.row + z.ruleGap * 2 + rule;
    return {
      left: row(y0),
      right: row(rTop),
      ...(has.verdict
        ? {
            verdict: slot(
              { x: area.x, y: rTop + z.row + verGap, width: area.width, height: verH },
              z.verMax,
              vl,
              0.6,
            ),
          }
        : {}),
      axis: 'h',
      area,
      rule,
    };
  }
}

const xOf = (b: Box) => ({ x: b.x, width: b.width });

/** Width of a text actor's widest set line in its element's px (0 without layout). */
function setWidth(a: Actor): number {
  const doc = a.el.ownerDocument;
  if (!doc.createRange) return 0;
  const range = doc.createRange();
  range.selectNodeContents(a.el);
  const rs = Array.from(range.getClientRects?.() ?? []).filter((r) => r.width > 0);
  if (rs.length === 0) return 0;
  const el = a.el.getBoundingClientRect();
  // Scale from client px to frame px by the element's own box.
  const k = el.width > 0 ? a.box.width / el.width : 1;
  return (Math.max(...rs.map((r) => r.right)) - el.left) * k;
}
const bottom = (b: Box) => b.y + b.height;

/**
 * The divider between the sides, from where the boxes are: down the gutter between the columns,
 * across the VS disc between stacked sides, or a full-width rule between the ledger's rows.
 */
export function dividerFor(
  slots: Pick<VersusSlots, 'axis' | 'area' | 'rule'>,
  left: readonly Box[],
  right: readonly Box[],
  vs: Box | undefined,
): Box {
  const th = slots.rule;
  if (slots.axis === 'v') {
    const l = Math.max(...left.map((b) => b.x + b.width));
    const r = Math.min(...right.map((b) => b.x));
    const top = Math.min(...left.map((b) => b.y), ...right.map((b) => b.y));
    const end = Math.max(...left.map(bottom), ...right.map(bottom));
    return { x: Math.round((l + r) / 2 - th / 2), y: top, width: th, height: end - top };
  }
  const a = slots.area;
  const cy = vs
    ? vs.y + vs.height / 2
    : (Math.max(...left.map(bottom)) + Math.min(...right.map((b) => b.y))) / 2;
  const inset = vs ? Math.round(a.width * 0.08) : 0;
  return {
    x: a.x + inset,
    y: Math.round(cy - th / 2),
    width: a.width - inset * 2,
    height: th,
  };
}

interface Band {
  items: Actor[];
}
interface Frame {
  y: number;
  /** Height the boxes reserve. */
  reserved: number;
}

/** Where each band's boxes are, as laid out (take it before moving anything inside a band). */
function bandFrames(bands: readonly Band[]): Frame[] {
  return bands.map((b) => {
    const y = Math.min(...b.items.map((a) => a.box.y));
    return { y, reserved: Math.max(...b.items.map((a) => bottom(a.box))) - y };
  });
}

/**
 * Re-pack rows of text by the height they really set (a short name sets one line of the two its
 * box reserves), keeping the gaps between rows and the block at the optical centre of `area`.
 * Rows are bands of actors that move together. Without layout (no measured heights, as in
 * happy-dom) nothing moves.
 */
function packBands(
  st: { nudge: (a: Actor, dy: number) => void },
  bands: readonly Band[],
  area: Box,
  frames: readonly Frame[] = bandFrames(bands),
): void {
  const all = bands.flatMap((b) => b.items);
  if (all.length === 0 || all.some((a) => !(a.el.offsetHeight > 0))) return;
  const used = bands.map(
    (b, i) => Math.max(...b.items.map((a) => a.box.y + a.el.offsetHeight)) - (frames[i] as Frame).y,
  );
  const gaps = frames
    .slice(1)
    .map((f, i) => Math.max(0, f.y - ((frames[i] as Frame).y + (frames[i] as Frame).reserved)));
  const total = used.reduce((n, u) => n + u, 0) + gaps.reduce((n, g) => n + g, 0);
  let y = area.y + Math.floor(Math.max(0, area.height - total) * 0.45);
  bands.forEach((b, i) => {
    const dy = y - (frames[i] as Frame).y;
    for (const a of b.items) st.nudge(a, dy);
    y += (used[i] as number) + (gaps[i] ?? 0);
  });
}

/**
 * versus: A against B. The first side lands on the word that names it, then the second, the
 * divider slams in between, and the verdict marks the winner with the look's emphasis.
 * Image-free: each side gets an initial tile (split, ledger) or a card under its name
 * (face-off) where the look has one.
 */
export const versus = defineScene<VersusContent>({
  id: 'versus',
  name: 'Versus',
  category: 'data',
  useWhen: 'the narration compares two things: A versus B, before and after, this or that',
  content: versusContent,
  defaultContent: {
    left: 'Renting',
    leftDetail: 'Flexible, nothing to fix',
    right: 'Buying',
    rightDetail: 'Equity, but a big deposit',
    verdict: 'Over ten years, buying wins',
    winner: 'right',
  },
  variants: [
    {
      id: 'split',
      about: 'two columns with initial tiles and a VS disc between; the safe default',
    },
    {
      id: 'face-off',
      about: 'the two names huge, facing off across the divider; for the big moment',
    },
    { id: 'ledger', about: 'two rows with a rule between, calmer; best with longer details' },
  ],
  peakVariant: 'face-off',
  cues: [
    { id: 'left', about: 'the first side lands, on the word that names it' },
    { id: 'right', about: 'the second side lands, on the word that names it' },
    {
      id: 'divider',
      about: 'the divider slams in between the two sides',
      optional: true,
      snap: true,
      // A slam is quick; the "VS" needs no reading time.
      leadMs: 320,
      words: 0,
    },
    {
      id: 'verdict',
      about: 'the verdict appears and the winning side is marked',
      optional: true,
      snap: true,
    },
  ],
  focalCue: 'right',
  imageRoles: [],
  safe: versusFromWords,
  // ideal: both sides with 6-word details and an 8-word verdict, each read in full after a default
  // key moment; min: names alone still read before the exit.
  durationMs: { min: 3400, ideal: 5800, max: 10000 },
  formats: ['16:9', '9:16', '1:1'],
  build(ctx, score, variant) {
    const c = score.content;
    const st = stage(ctx, { cues: this.cues, anchors: score.beats, centre: true });
    const has = { detail: Boolean(c.leftDetail || c.rightDetail), verdict: Boolean(c.verdict) };
    const L = layoutVersus(variant, ctx.format, ctx.width, ctx.height, st.safe, has);

    const side = (k: 'left' | 'right', s: SideSlots, name: string, detail: string | undefined) => ({
      initial: s.initial
        ? st.text(`${k}-init`, initialOf(name), s.initial, { role: 'display', truncatable: false })
        : null,
      name: st.text(`${k}-name`, name, s.name, {
        role: 'display',
        balance: true,
        ...(k === 'right' ? { focal: true } : {}),
      }),
      detail:
        s.detail && detail
          ? st.text(`${k}-detail`, detail, s.detail, { role: 'label', balance: true })
          : null,
    });
    const a = side('left', L.left, c.left, c.leftDetail);
    const b = side('right', L.right, c.right, c.rightDetail);
    const vsText = L.vs
      ? st.text('vs-text', 'VS', L.vs, { role: 'display', truncatable: false })
      : null;
    const verdict =
      L.verdict && c.verdict
        ? st.text('verdict', c.verdict, L.verdict, { role: 'body', balance: true })
        : null;

    // Re-pack the rows by what they really set, then draw tiles, divider and disc around them.
    let ledgerSpan: { x: number; width: number } | null = null;
    const some = (xs: (Actor | null)[]) => xs.filter((x): x is Actor => x !== null);
    if (variant === 'ledger') {
      const rows = [a, b].map((s) => ({ items: some([s.initial, s.name, s.detail]) }));
      const bands: Band[] = [...rows, ...(verdict ? [{ items: [verdict] }] : [])];
      const frames = bandFrames(bands);
      for (const s of [a, b]) {
        // The detail follows the name as set; the text block and the tile centre on each other.
        const used = s.name.el.offsetHeight;
        if (!(used > 0)) continue;
        if (s.detail) st.nudge(s.detail, used - s.name.box.height);
        const t = s.initial?.box.height ?? 0;
        const top = Math.min(s.name.box.y, s.initial?.box.y ?? s.name.box.y);
        const end = s.detail ? s.detail.box.y + s.detail.el.offsetHeight : s.name.box.y + used;
        const block = end - s.name.box.y;
        const row = Math.max(t, block);
        const dText = top + (row - block) / 2 - s.name.box.y;
        st.nudge(s.name, dText);
        if (s.detail) st.nudge(s.detail, dText);
        if (s.initial) st.nudge(s.initial, top + (row - t) / 2 - s.initial.box.y);
      }
      packBands(st, bands, L.area, frames);
      // Changed by the task 23 review: the rows are left-aligned text, so a short pair left the
      // right of the column empty under a full-width rule. Centre the block on what it really
      // sets, and fit the rule to it.
      const texts = some([a.name, a.detail, b.name, b.detail, verdict]);
      const right = Math.max(...texts.map((x) => x.box.x + setWidth(x)));
      if (texts.every((x) => setWidth(x) > 0)) {
        const x0 = Math.min(...some([a.initial, b.initial, ...texts]).map((x) => x.box.x));
        const dx = Math.round(L.area.x + L.area.width / 2 - (x0 + right) / 2);
        for (const x of some([a.initial, a.name, a.detail, b.initial, b.name, b.detail, verdict]))
          st.nudge(x, 0, dx);
        // Text boxes keep inside the column (their set lines already fit the narrower width).
        const edge = L.area.x + L.area.width;
        for (const x of texts) {
          const width = Math.min(x.box.width, Math.floor(edge - x.box.x));
          x.box = { ...x.box, width };
          x.el.style.width = `${width}px`;
        }
        ledgerSpan = { x: x0 + dx, width: right - x0 };
      }
    } else if (L.axis === 'v') {
      const bands: Band[] = [
        ...(a.initial && b.initial ? [{ items: [a.initial, b.initial] }] : []),
        { items: [a.name, b.name] },
        ...(a.detail || b.detail ? [{ items: some([a.detail, b.detail]) }] : []),
        ...(verdict ? [{ items: [verdict] }] : []),
      ];
      packBands(st, bands, L.area);
    } else {
      const bands: Band[] = [
        ...some([a.initial, a.name, a.detail]).map((x) => ({ items: [x] })),
        ...(vsText ? [{ items: [vsText] }] : []),
        ...some([b.initial, b.name, b.detail]).map((x) => ({ items: [x] })),
        ...(verdict ? [{ items: [verdict] }] : []),
      ];
      packBands(st, bands, L.area);
    }
    if (vsText && L.axis === 'v') {
      // The disc sits level with the tiles, or with the names' first line.
      const ref = a.initial ?? a.name;
      const h = a.initial ? ref.box.height : Math.round(a.name.size * 1.2) || ref.box.height;
      st.nudge(vsText, ref.box.y + h / 2 - (vsText.box.y + vsText.box.height / 2));
    }

    const tile = (k: 'left' | 'right', init: Actor | null) =>
      init
        ? (st.surface(`${k}-tile`, 'photo', init, { box: init.box }) ??
          st.shape(`${k}-tile`, init.box, {
            color: k === 'left' ? 'accent' : 'accent2',
            radius: Math.round(init.box.height * 0.14),
            origin: 'center',
            behind: init,
            carries: true,
          }))
        : null;
    const tileA = tile('left', a.initial);
    const tileB = tile('right', b.initial);
    // Face-off: each name on the look's card (plain looks set the names alone, huge).
    const card = (k: 'left' | 'right', name: Actor) =>
      variant === 'face-off'
        ? st.surface(`${k}-card`, 'card', name, { pad: { x: 0.022, y: 0.02 } })
        : null;
    const cardA = card('left', a.name);
    const cardB = card('right', b.name);

    const boxes = (s: typeof a) => some([s.initial, s.name, s.detail]).map((x) => x.box);
    const div = dividerFor(L, boxes(a), boxes(b), vsText?.box);
    const line = st.shape('divider', ledgerSpan ? { ...div, ...ledgerSpan } : div, {
      color: 'muted',
      radius: L.rule,
      ...(vsText ? { behind: vsText } : {}),
    });
    const disc = vsText
      ? st.shape('vs-disc', vsText.box, {
          // Ink, not the accent: a look's accent may read with neither ink nor paper on it.
          color: 'ink',
          radius: Math.round(vsText.box.height / 2),
          origin: 'center',
          behind: vsText,
          carries: true,
        })
      : null;
    const strip = verdict ? st.surface('verdict-strip', 'strip', verdict) : null;

    const enters = (xs: (Actor | null)[], kind?: Parameters<typeof enter>[1]): Action[] =>
      some(xs).map((x) => enter(x, kind));
    st.on(
      'left',
      ...enters([cardA], 'slam'),
      ...enters([tileA, a.initial], 'pop'),
      ...enters([a.name, a.detail]),
    );
    st.on(
      'right',
      ...enters([cardB], 'slam'),
      ...enters([tileB, b.initial], 'pop'),
      ...enters([b.name, b.detail]),
    );
    st.on(
      'divider',
      enter(line, L.axis === 'v' ? 'mask' : 'draw'),
      ...enters([disc, vsText], 'slam'),
    );
    const winner = c.winner === 'left' ? a.name : c.winner === 'right' ? b.name : null;
    const verdictActions = [
      ...enters([strip], 'wipe'),
      ...enters([verdict]),
      ...(winner ? [mark(winner, 'emphasis')] : []),
    ];
    if (verdictActions.length) st.on('verdict', ...verdictActions);
    return st.compile();
  },
});
