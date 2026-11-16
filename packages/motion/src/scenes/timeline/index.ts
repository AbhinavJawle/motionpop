import { z } from 'zod';
import type { Format } from '../../contract';
import type { Box } from '../../core/safe-area';
import { enter, mark, stage, type Action, type Actor, type TextSlot } from '../../engine/stage';
import { defineScene, type SceneCue } from '../define';
import { column } from '../layout';

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export const TIMELINE_MIN = 3;
export const TIMELINE_MAX = 6;

const dateText = z
  .string()
  .min(1)
  .max(14)
  .refine((s) => s.trim().length > 0 && wordCount(s) <= 3, 'one to three words');
const eventText = z
  .string()
  .min(1)
  .max(48)
  .refine((s) => s.trim().length > 0 && wordCount(s) <= 6, 'one to six words');

/**
 * Dates and events are two flat lists of the same length (not a list of objects), so the fill's
 * structured output stays within three object levels (ai-tasks.md schema rules).
 */
export const timelineContent = z
  .object({
    title: z
      .string()
      .max(48)
      .refine((s) => wordCount(s) <= 7, 'at most 7 words')
      .optional()
      .describe('What the timeline shows, at most 7 words, e.g. "How the bank grew"'),
    dates: z
      .array(dateText)
      .min(TIMELINE_MIN)
      .max(TIMELINE_MAX)
      .describe('3 to 6 dates as spoken, in order: "1969", "March 2020", "Day one"'),
    events: z
      .array(eventText)
      .min(TIMELINE_MIN)
      .max(TIMELINE_MAX)
      .describe('What happened at each date, one per date, 1 to 6 of the spoken words'),
    highlight: z
      .number()
      .int()
      .min(0)
      .max(TIMELINE_MAX - 1)
      .optional()
      .describe('Index of the event to mark (0 = first); leave out when none stands out'),
  })
  .refine((c) => c.dates.length === c.events.length, {
    message: 'one event per date',
    path: ['events'],
  })
  .refine((c) => c.highlight === undefined || c.highlight < c.dates.length, {
    message: 'highlight must be the index of one of the events',
    path: ['highlight'],
  });
export type TimelineContent = z.infer<typeof timelineContent>;

const YEAR = /^(1\d{3}|20\d{2})$/;
const FILLERS = new Set(['um', 'uh', 'erm', 'like', 'and', 'then', 'so']);
const TRAIL = new Set(['in', 'on', 'by', 'of', 'from', 'since', 'until', 'at', 'the', 'and']);
const bare = (w: string) => w.replace(/^[^\p{L}\p{N}$€£]+|[^\p{L}\p{N}%]+$/gu, '');
const ends = (w: string) => /[.,;:!?]["')\]]*$/.test(w);

function eventOf(ws: readonly string[], keepEnd: boolean): string | null {
  const out = ws.map(bare).filter(Boolean);
  while (out.length && FILLERS.has((out[0] as string).toLowerCase())) out.shift();
  while (out.length && TRAIL.has((out[out.length - 1] as string).toLowerCase())) out.pop();
  while (out.length > 6 || (out.length > 0 && out.join(' ').length > 48)) {
    if (keepEnd) out.shift();
    else out.pop();
  }
  const s = out.join(' ');
  return s ? s[0]!.toUpperCase() + s.slice(1) : null;
}

/**
 * Safe default from the slot's words (spec 07 R1.4): the years as dates, each event the words
 * after its year up to the next pause (or, when the year closes its clause, the words before
 * it). Spoken words only. Null when fewer than 3 years each come with words.
 */
export function timelineFromWords(words: readonly string[]): TimelineContent | null {
  const ws = words.map((w) => w.trim()).filter(Boolean);
  const at = ws.flatMap((w, i) => (YEAR.test(bare(w)) ? [i] : []));
  if (at.length < TIMELINE_MIN) return null;
  const picked = at.slice(0, TIMELINE_MAX);
  const events = picked.map((i, k) => {
    const after: string[] = [];
    if (!ends(ws[i] as string))
      for (let j = i + 1; j < ws.length && j !== picked[k + 1]; j++) {
        after.push(ws[j] as string);
        if (ends(ws[j] as string)) break;
      }
    if (after.filter((w) => bare(w)).length >= 2) return eventOf(after, false);
    const before: string[] = [];
    for (let j = i - 1; j >= 0 && j !== picked[k - 1] && !ends(ws[j] as string); j--)
      before.unshift(ws[j] as string);
    return eventOf(before, true);
  });
  if (events.some((e) => !e)) return null;
  return { dates: picked.map((i) => bare(ws[i] as string)), events: events as string[] };
}

export interface TimelineItemSlots {
  date: TextSlot;
  event: TextSlot;
  /** The point on the track (track and zigzag). */
  point?: { x: number; y: number };
  /** Steps: the hairline under the row. */
  rule?: Box;
}

export interface TimelineSlots {
  title?: TextSlot;
  items: TimelineItemSlots[];
  /** The track runs across ('h') or down ('v'); absent for steps. */
  axis?: 'h' | 'v';
  /** Events alternate either side of the track (zigzag, and a crowded track across). */
  alternate: boolean;
  stroke: number;
  dot: number;
}

const slot = (
  box: Box,
  max: number,
  lines: number,
  min: number,
  align: 'left' | 'center',
): TextSlot => ({
  box,
  max: Math.max(1, max),
  min: Math.max(1, Math.round(max * min)),
  lineHeight: 1.2,
  maxLines: lines,
  align,
});

/** Per-format layout of each variant, in frame pixels inside the camera-safe area. */
export function layoutTimeline(
  variant: string,
  format: Format,
  frameH: number,
  safe: Box,
  has: { events: readonly string[]; title: boolean },
): TimelineSlots {
  const wide = format === '16:9';
  const tall = format === '9:16';
  const by = <T>(w: T, t: T, s: T) => (wide ? w : tall ? t : s);
  const H = frameH;
  const n = has.events.length;
  const titleLines = wide ? 1 : 2;
  const across = variant !== 'steps' && !tall;
  // A track across the frame with 5 or 6 events alternates sides too: one column each is too
  // narrow for six words at a readable size (16:9 and 1:1 review).
  const zig = variant === 'zigzag' || (variant === 'track' && across && n >= 5);
  const evLines = across ? (zig ? 3 : 4) : 2;

  const dims = (k: number) => {
    const titleMax = Math.round(H * by(0.06, 0.038, 0.054) * k);
    const dateMax = Math.round(H * (across ? by(0.06, 0, 0.05) : by(0.066, 0.034, 0.056)) * k);
    const eventMax = Math.round(H * (across ? by(0.04, 0, 0.034) : by(0.05, 0.026, 0.042)) * k);
    const dot = Math.max(10, Math.round(H * by(0.028, 0.015, 0.024) * k));
    const d = {
      titleMax,
      titleH: has.title ? Math.ceil(titleMax * 1.2 * titleLines) : 0,
      titleGap: has.title ? Math.round(titleMax * 0.9) : 0,
      dateMax,
      dateH: Math.ceil(dateMax * 1.2),
      eventMax,
      eventH: Math.ceil(eventMax * 1.2 * evLines),
      gap: Math.round(dateMax * 0.35),
      dot,
      rowGap: Math.round(H * by(0.03, 0.022, 0.028) * k),
    };
    const side = d.dateH + d.gap + d.eventH;
    const rows = has.events.map((_, i) => rowOf(d, i));
    const body = across
      ? zig
        ? side * 2 + d.dot + d.gap * 2
        : d.dateH + d.gap * 2 + d.dot + d.eventH
      : rows.reduce((h, r) => h + r.h, 0) + (n - 1) * d.rowGap;
    return { ...d, body, total: d.titleH + d.titleGap + body };
  };
  /**
   * A row down the frame: the event's lines estimated from its length (about 0.52 em per
   * character), so short events don't leave an empty second line between the rows.
   */
  function rowOf(d: { dateH: number; eventMax: number; gap: number }, i: number) {
    const width =
      variant === 'steps'
        ? area.width * (1 - by(0.24, 0.32, 0.28) - 0.04)
        : zig
          ? area.width / 2 - d.eventMax
          : area.width - d.eventMax * 2;
    const lines = (has.events[i] ?? '').length * 0.52 * d.eventMax <= width ? 1 : 2;
    const eventH = Math.ceil(d.eventMax * 1.2 * lines);
    return { h: d.dateH + Math.round(d.gap * 0.5) + eventH, eventH };
  }
  const area = column(safe, across ? by(0.94, 1, 1) : variant === 'steps' ? by(0.8, 1, 0.94) : 1);
  const t1 = dims(1).total;
  const z = dims(t1 > safe.height ? (safe.height / t1) * 0.95 : 1);
  const y0 = safe.y + Math.floor(Math.max(0, safe.height - z.total) * 0.45);
  const textArea = column(safe, by(0.8, 1, 0.94));
  const title = has.title
    ? {
        title: slot(
          { x: textArea.x, y: y0, width: textArea.width, height: z.titleH },
          z.titleMax,
          titleLines,
          0.6,
          'center',
        ),
      }
    : {};
  const top = y0 + z.titleH + z.titleGap;
  const stroke = Math.max(3, Math.round(H * 0.004));

  if (across) {
    const colW = area.width / n;
    const lineY = Math.round(
      zig
        ? top + z.dateH + z.gap + z.eventH + z.gap + z.dot / 2
        : top + z.dateH + z.gap + z.dot / 2,
    );
    const items = Array.from({ length: n }, (_, i) => {
      const cx = area.x + colW * (i + 0.5);
      // Zigzag: neighbours sit on opposite sides, so each may take almost two columns, centred
      // on its point and inside the area (the end ones get one column).
      const room = 2 * Math.min(cx - area.x, area.x + area.width - cx);
      const w = zig ? Math.min(colW * 1.88, room) : colW * 0.92;
      const x = Math.ceil(cx - w / 2);
      const width = Math.floor(cx + w / 2) - x;
      const up = !zig || i % 2 === 0;
      const dateY = up ? lineY - z.dot / 2 - z.gap - z.dateH : lineY + z.dot / 2 + z.gap;
      const eventY = zig
        ? up
          ? dateY - z.gap - z.eventH
          : dateY + z.dateH + z.gap
        : lineY + z.dot / 2 + z.gap;
      return {
        // Six dates side by side in 1:1 are narrow: "Q3 of 2024" may shrink further.
        date: slot(
          { x, y: Math.round(dateY), width, height: z.dateH },
          z.dateMax,
          1,
          0.4,
          'center',
        ),
        event: slot(
          { x, y: Math.round(eventY), width, height: z.eventH },
          z.eventMax,
          evLines,
          0.6,
          'center',
        ),
        point: { x: Math.round(cx), y: lineY },
      };
    });
    return { ...title, items, axis: 'h', alternate: zig, stroke, dot: z.dot };
  }

  // Down the frame: the track at the left (track), at the centre (zigzag), or no track (steps).
  let rowTop = top;
  const lineX = Math.round(
    zig ? area.x + area.width / 2 : area.x + Math.max(z.dot, Math.round(z.dot * 0.8)),
  );
  const dateCol = variant === 'steps' ? Math.floor(area.width * by(0.24, 0.32, 0.28)) : 0;
  const items = Array.from({ length: n }, (_, i) => {
    const { h: rowH, eventH } = rowOf(z, i);
    const y = rowTop;
    rowTop += rowH + z.rowGap;
    if (variant === 'steps') {
      const gx = Math.round(area.width * 0.04);
      return {
        date: slot({ x: area.x, y, width: dateCol, height: z.dateH }, z.dateMax, 1, 0.5, 'left'),
        event: slot(
          {
            x: area.x + dateCol + gx,
            y: y + Math.round((z.dateH - Math.ceil(z.eventMax * 1.2)) / 2),
            width: area.width - dateCol - gx,
            height: eventH,
          },
          z.eventMax,
          2,
          0.6,
          'left',
        ),
        ...(i < n - 1
          ? {
              rule: {
                x: area.x,
                y: y + rowH + Math.round(z.rowGap / 2) - 1,
                width: area.width,
                height: Math.max(2, Math.round(H * 0.0015)),
              },
            }
          : {}),
      };
    }
    const pointY = y + Math.round(z.dateH / 2);
    const gx = Math.round(z.dot * 1.2);
    // Zigzag in 9:16: rows alternate either side of the centre line, centred in their half.
    const left = zig && i % 2 === 0;
    const x = zig ? (left ? area.x : lineX + gx) : lineX + gx;
    const width = zig ? lineX - gx - area.x : area.x + area.width - x;
    const align = zig ? 'center' : 'left';
    return {
      date: slot({ x, y, width, height: z.dateH }, z.dateMax, 1, 0.6, align),
      event: slot(
        { x, y: y + z.dateH + Math.round(z.gap * 0.5), width, height: eventH },
        z.eventMax,
        2,
        0.6,
        align,
      ),
      point: { x: lineX, y: pointY },
    };
  });
  return {
    ...title,
    items,
    ...(variant === 'steps' ? {} : { axis: 'v' as const }),
    alternate: zig,
    stroke,
    dot: z.dot,
  };
}

/** A straight segment from `a` to `b` as a box at `a` and a turn (draws from `a`). */
function segment(a: { x: number; y: number }, b: { x: number; y: number }, stroke: number) {
  const len = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
  return {
    box: { x: a.x, y: a.y - stroke / 2, width: len, height: stroke },
    rotate: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
  };
}

const eventCue = (k: number): SceneCue => ({
  id: `e${k}`,
  about:
    k === 1
      ? 'the first date and event land, on the word that says the date'
      : `event ${k} lands, on the word that says its date`,
  leadMs: 420,
});

/**
 * timeline: 3 to 6 dated events. Each lands on the word that says its date; the track draws on
 * to it in the accent, so the line grows with the story. The highlighted event gets a larger
 * accent point and the look's emphasis mark on its date.
 */
export const timeline = defineScene<TimelineContent>({
  id: 'timeline',
  name: 'Timeline',
  category: 'text',
  useWhen: 'the narration walks through 3 to 6 dated events, years or steps in time',
  content: timelineContent,
  defaultContent: {
    title: 'How the first flights went',
    dates: ['1903', '1927', '1969'],
    events: ['First powered flight', 'First solo across the ocean', 'People walk on the moon'],
    highlight: 2,
  },
  variants: [
    { id: 'track', about: 'dates and events along one line; the safe default' },
    { id: 'steps', about: 'a calm list of dated rows, no line; best for longer events' },
    { id: 'zigzag', about: 'events alternate either side of the line; for the big moment' },
  ],
  peakVariant: 'zigzag',
  cues: [
    { id: 'title', about: 'the title of the timeline appears', optional: true, snap: true },
    ...Array.from({ length: TIMELINE_MAX }, (_, i) => eventCue(i + 1)),
  ],
  focalCue: 'e1',
  imageRoles: [],
  safe: timelineFromWords,
  // min: six events with a 3-word date and a 6-word event each read in full before the exit;
  // ideal: also a 7-word title.
  durationMs: { min: 6600, ideal: 7400, max: 14000 },
  formats: ['16:9', '9:16', '1:1'],
  build(ctx, score, variant) {
    const c = score.content;
    const n = c.dates.length;
    const used = new Set([...(c.title ? ['title'] : []), ...c.dates.map((_, i) => `e${i + 1}`)]);
    const st = stage(ctx, {
      cues: this.cues.filter((q) => used.has(q.id)),
      anchors: score.beats,
      centre: true,
      // The highlight is the timeline's one mark.
      decorJuice: false,
    });
    const L = layoutTimeline(variant, ctx.format, ctx.height, st.safe, {
      events: c.events,
      title: Boolean(c.title),
    });
    const title =
      L.title && c.title
        ? st.text('title', c.title, L.title, { role: 'display', balance: true })
        : null;
    const points = L.items.map((s) => s.point).filter((p): p is { x: number; y: number } => !!p);
    // The faint track the whole way, then the accent progress drawing on to each point.
    const track =
      points.length >= 2
        ? (() => {
            const s = segment(points[0]!, points[points.length - 1]!, L.stroke);
            return st.shape('track', s.box, {
              color: 'chart-0',
              radius: 0,
              rotate: s.rotate,
            });
          })()
        : null;
    const progress = points.map((p, i) => {
      const a = points[i - 1];
      if (!a) return null;
      const s = segment(a, p, L.stroke);
      return st.shape(`progress-${i}`, s.box, { color: 'accent', radius: 0, rotate: s.rotate });
    });
    const hi = c.highlight;
    const dots = points.map((p, i) => {
      const d = hi === i ? Math.round(L.dot * 1.6) : L.dot;
      return st.shape(
        `dot-${i + 1}`,
        { x: p.x - d / 2, y: p.y - d / 2, width: d, height: d },
        { color: hi === i ? 'accent' : 'ink', radius: d, origin: 'center' },
      );
    });
    const rules = L.items.map((s, i) =>
      s.rule ? st.shape(`rule-${i + 1}`, s.rule, { color: 'chart-0', radius: 0 }) : null,
    );
    const dates = L.items.map((s, i) =>
      st.text(`date-${i + 1}`, c.dates[i] as string, s.date, {
        role: 'display',
        truncatable: false,
        keepWords: true,
        ...(i === 0 ? { focal: true } : {}),
      }),
    );
    const events = L.items.map((s, i) =>
      st.text(`event-${i + 1}`, c.events[i] as string, s.event, {
        role: 'body',
        balance: true,
        keepWords: true,
      }),
    );
    // One size per kind, so the dates and the events each read as one row.
    for (const list of [dates, events]) {
      const size = Math.min(...list.map((a) => a.size).filter((s) => s > 0));
      if (!Number.isFinite(size)) continue;
      for (const a of list)
        if (a.size > size) {
          a.el.style.fontSize = `${size}px`;
          a.size = size;
        }
    }
    // Events above the line (zigzag) set fewer lines than they reserve: they sit on their date.
    if (L.axis === 'h' && L.alternate)
      events.forEach((e, i) => {
        const used = e.el.offsetHeight;
        if (i % 2 === 0 && used > 0 && e.box.height > used) st.nudge(e, e.box.height - used);
      });
    if (title && title.el.offsetHeight > 0 && title.box.height > title.el.offsetHeight)
      st.nudge(title, title.box.height - title.el.offsetHeight);

    if (title) st.on('title', enter(title));
    for (let i = 0; i < n; i++) {
      const actions: Action[] = [];
      if (i === 0 && track) actions.push(enter(track, 'draw'));
      const seg = progress[i];
      if (seg) actions.push(enter(seg, 'draw'));
      const dot = dots[i];
      if (dot) actions.push(enter(dot, 'pop'));
      const rule = rules[i - 1];
      if (rule) actions.push(enter(rule, 'draw'));
      actions.push(enter(dates[i] as Actor), enter(events[i] as Actor));
      if (hi === i) actions.push(mark(dates[i] as Actor, 'emphasis'));
      st.on(`e${i + 1}`, ...actions);
    }
    return st.compile();
  },
});
