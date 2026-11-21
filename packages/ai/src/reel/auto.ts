// `autoReelPlan` (spec 25 R3.1): the free, deterministic reel director. No model: sentences
// become scenes, numbers become counters, enumerations become icon lists, questions become
// statements, and short lines cut to the speaker. Used offline, without credits, and whenever
// the cloud director fails.
import {
  ReelPlanSchema,
  ReelSceneSchema,
  tileReelScenes,
  type ReelLook,
  type ReelPlan,
  type ReelScene,
  type ReelTemplate,
  type ReelWord,
} from '@motionpop/schemas';

const STOP = new Set(
  `a an the and or but so to of in on at for with from by as is are was were be been being it its it's
this that these those there here i you we they he she me my your our their his her them us do does did
done have has had just very really then than too also not no yes if when what which who how why can
could would should will shall may might must am i'm you're we're they're that's there's let's get got
like um uh oh okay well about into over out up down more most some any all every each`.split(/\s+/),
);

const ICON_WORDS: [RegExp, string][] = [
  [/money|cash|dollar|price|pay|paid|income|revenue|profit|rich/i, 'coins'],
  [/invest|stock|market|grow|growth|rise|increase|up/i, 'trending-up'],
  [/fall|drop|decline|lose|loss|down/i, 'trending-down'],
  [/time|hour|minute|day|week|year|today|tomorrow|thursday|monday|friday/i, 'clock'],
  [/start|launch|begin|strong/i, 'rocket'],
  [/finish|complete|done|end/i, 'flag'],
  [/goal|target|aim|focus/i, 'target'],
  [/idea|think|thought|mind/i, 'lightbulb'],
  [/learn|study|school|teach|skill/i, 'graduation-cap'],
  [/people|team|friends|everyone|world/i, 'users'],
  [/talk|say|said|speak|tell|comment/i, 'message-circle'],
  [/code|build|develop|program/i, 'code'],
  [/ai|model|bot|agent|claude|gpt|gemini/i, 'bot'],
  [/video|film|record|camera/i, 'video'],
  [/phone|app|mobile/i, 'smartphone'],
  [/website|site|web|online|internet/i, 'globe'],
  [/health|heart|love|care/i, 'heart'],
  [/work|job|career|office|laptop/i, 'laptop'],
  [/win|success|best|trophy/i, 'trophy'],
  [/fast|quick|speed|instant/i, 'zap'],
  [/excite|amaz|magic|new/i, 'sparkles'],
  [/problem|fail|wrong|mistake|bad/i, 'circle-x'],
  [/change|again|repeat|habit/i, 'repeat'],
  [/look|see|watch|eye/i, 'eye'],
  [/secure|safe|protect/i, 'shield-check'],
  [/free/i, 'gift'],
];

const iconFor = (text: string, dflt = 'sparkles'): string => {
  for (const [re, icon] of ICON_WORDS) if (re.test(text)) return icon;
  return dflt;
};

const clean = (w: string): string => w.replace(/^["'“‘(]+|[.,;:!?…"'”’)]+$/g, '');

const NUM_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const SCALE: Record<string, number> = { hundred: 100, thousand: 1e3, million: 1e6, billion: 1e9 };

/** Finds the first spoken number in a word run: { value, index, end, suffix }. */
export function findNumber(
  ws: readonly string[],
): { value: number; index: number; end: number; suffix: string } | null {
  for (let i = 0; i < ws.length; i++) {
    const w = clean(ws[i]!).toLowerCase();
    const digit = /^\$?(\d[\d,]*(?:\.\d+)?)(%|k|m|x)?$/.exec(w);
    if (digit) {
      let value = Number(digit[1]!.replace(/,/g, ''));
      let suffix = digit[2] === '%' ? '%' : digit[2] === 'x' ? 'x' : '';
      if (digit[2] === 'k') value *= 1e3;
      if (digit[2] === 'm') value *= 1e6;
      let end = i;
      const nxt = clean(ws[i + 1] ?? '').toLowerCase();
      if (SCALE[nxt]) {
        value *= SCALE[nxt]!;
        end = i + 1;
      }
      if (clean(ws[end + 1] ?? '').toLowerCase() === 'percent') {
        suffix = '%';
        end += 1;
      }
      // Years read as labels, not counters.
      if (!suffix && value >= 1900 && value <= 2100 && Number.isInteger(value)) continue;
      return { value, index: i, end, suffix };
    }
    if (w in NUM_WORDS || (w.includes('-') && w.split('-').every((p) => p in NUM_WORDS))) {
      let value = w.split('-').reduce((a, p) => a + (NUM_WORDS[p] ?? 0), 0);
      let end = i;
      for (let j = i + 1; j < ws.length; j++) {
        const x = clean(ws[j]!).toLowerCase();
        if (x in NUM_WORDS) value += NUM_WORDS[x]!;
        else if (SCALE[x]) value *= SCALE[x]!;
        else break;
        end = j;
      }
      let suffix = '';
      if (clean(ws[end + 1] ?? '').toLowerCase() === 'percent') {
        suffix = '%';
        end += 1;
      }
      // "one" alone is usually not a statistic.
      if (value < 2 && !suffix) continue;
      return { value, index: i, end, suffix };
    }
  }
  return null;
}

interface Seg {
  from: number;
  to: number; // inclusive
  startMs: number;
  endMs: number;
  text: string[];
}

function segments(words: readonly ReelWord[], durationMs: number): Seg[] {
  const segs: Seg[] = [];
  let from = 0;
  const push = (to: number) => {
    if (to < from) return;
    const startMs = words[from]!.startMs;
    const next = words[to + 1];
    segs.push({
      from,
      to,
      startMs,
      endMs: next ? next.startMs : durationMs,
      text: words.slice(from, to + 1).map((w) => w.text),
    });
    from = to + 1;
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!.text.trim();
    const len = words[i]!.endMs - words[from]!.startMs;
    const sentenceEnd = /[.!?]$/.test(w);
    const clauseEnd = /[,;:]$/.test(w);
    if (sentenceEnd && len > 1300) push(i);
    else if (clauseEnd && len > 2600) push(i);
    else if (len > 4600) push(i);
  }
  push(words.length - 1);
  // Merge tiny tails into the previous segment.
  const out: Seg[] = [];
  for (const s of segs) {
    const prev = out[out.length - 1];
    if (prev && s.endMs - s.startMs < 1100) {
      prev.to = s.to;
      prev.endMs = s.endMs;
      prev.text.push(...s.text);
    } else out.push({ ...s, text: [...s.text] });
  }
  return out;
}

/** The last `max` words of the run's final clause, read naturally ("thought of the day"). */
const keyWords = (ws: readonly string[], max: number): string => {
  const words = ws.map(clean).filter(Boolean);
  // Take the final clause (after the last comma in the original words).
  let from = 0;
  ws.forEach((w, i) => {
    if (/[,;:]$/.test(w.trim()) && i < ws.length - 1) from = i + 1;
  });
  const clause = ws.slice(from).map(clean).filter(Boolean);
  const pool = [...(clause.length >= 2 ? clause : words)];
  // Don't end on a connector either ("going to do but").
  while (pool.length > 2 && /^(and|but|so|or|to|of|that|the|a|an|because)$/i.test(pool.at(-1)!))
    pool.pop();
  let tail = pool.slice(-max);
  // Don't start on a weak word ("and", "the", "to").
  while (
    tail.length > 2 &&
    STOP.has(tail[0]!.toLowerCase()) &&
    /^(and|but|so|or|to|of|that|the|a|an)$/i.test(tail[0]!)
  )
    tail = tail.slice(1);
  return tail.join(' ');
};

/** The words before the key phrase (the kicker). */
const leadWords = (ws: readonly string[], key: string, max: number): string => {
  const words = ws.map(clean).filter(Boolean);
  const n = key ? key.split(' ').length : 0;
  return words.slice(Math.max(0, words.length - n - max), words.length - n).join(' ');
};

const sentence = (ws: readonly string[], maxChars: number): string => {
  let out = '';
  for (const w of ws.map(clean)) {
    if (!w) continue;
    const next = out ? `${out} ${w}` : w;
    if (next.length > maxChars) break;
    out = next;
  }
  return out || clean(ws[0] ?? '').slice(0, maxChars);
};

/** Statement lines: one per clause (split on , . ? !), each cut to a readable phrase. */
function clauseLines(
  local: readonly string[],
  from: number,
  at: (i: number) => number,
): { at: number; text: string }[] {
  const out: { at: number; text: string }[] = [];
  let start = 0;
  for (let i = 0; i < local.length; i++) {
    if (/[,.;:!?]$/.test(local[i]!.trim()) || i === local.length - 1) {
      const run = local.slice(start, i + 1);
      let text = sentence(run, 22);
      if (run.join(' ').replace(/[,.;:]+$/, '').length > 22) {
        // Shrink to the clause's key phrase on word boundaries, never mid-word.
        for (let n = 4; n >= 1; n--) {
          text = keyWords(run, n);
          if (text.length <= 22) break;
        }
      }
      if (text && text.length <= 22) out.push({ at: at(from + start), text });
      start = i + 1;
    }
  }
  return out.slice(0, 3);
}

/** The run's key phrase cut on word boundaries to `max` characters (never mid-word). */
const fitWords = (ws: readonly string[], maxWords: number, maxChars: number): string => {
  for (let n = maxWords; n >= 1; n--) {
    const t = keyWords(ws, n);
    if (t && t.length <= maxChars) return t;
  }
  return '';
};

/** "not X but Y", "X instead of Y", "stop X, start Y": two sides, the second one wins. */
function contrast(ws: readonly string[]): { left: string; right: string } | null {
  const lower = ws.map((w) => clean(w).toLowerCase());
  const neg = lower.findIndex((w) =>
    /^(not|isn't|doesn't|don't|never|stop|instead|without|no)$/.test(w),
  );
  if (neg < 0) return null;
  const pivot = lower.findIndex(
    (w, i) => i > neg + 1 && /^(but|it's|instead|start|it|rather|just)$/.test(w),
  );
  if (pivot < 0) return null;
  const left = fitWords(ws.slice(neg + 1, pivot), 2, 14);
  const right = fitWords(ws.slice(pivot + 1), 2, 14);
  return left && right && left.toLowerCase() !== right.toLowerCase() ? { left, right } : null;
}

/** "comment GUIDE", "follow for more": the ask, if the speaker makes one. */
function callToAction(ws: readonly string[]): { verb: string; keyword: string } | null {
  const lower = ws.map((w) => clean(w).toLowerCase());
  const i = lower.findIndex((w) => /^(comment|follow|subscribe|save|share|dm)$/.test(w));
  if (i < 0) return null;
  const verb = clean(ws[i]!);
  const next = ws
    .slice(i + 1)
    .map(clean)
    .find((w) => w && !STOP.has(w.toLowerCase()) && !/^(below|now|this|me|today)$/i.test(w));
  const keyword = (
    next && next.length <= 16 ? next : verb === 'follow' ? 'for more' : 'below'
  ).toUpperCase();
  return { verb: verb[0]!.toUpperCase() + verb.slice(1).toLowerCase(), keyword };
}

const PROGRESS_WORDS =
  /\b(finish|finishing|complete|completing|build|building|learn|learning|install|installing|loading|start|starting|ship|launch|grow|growing)\b/i;

export function autoReelPlan(
  words: readonly ReelWord[],
  durationMs: number,
  look: ReelLook,
): ReelPlan {
  const graphic = look === 'mono' ? 'split' : 'card';
  if (words.length === 0) {
    return ReelPlanSchema.parse({
      v: 1,
      look,
      scenes: [
        {
          id: 'r1',
          startMs: 0,
          endMs: durationMs,
          layout: 'speaker',
          content: { template: 'none' },
        },
      ],
      by: 'auto',
    });
  }
  const segs = segments(words, durationMs);
  const scenes: ReelScene[] = [];
  let lastTpl = '';
  let lastSpeaker = false;
  const rotation: ReelTemplate['template'][] = [
    'statement',
    'headline',
    'list',
    'statement',
    'headline',
  ];
  let rot = 0;
  let usedProgress = false;
  segs.forEach((s, k) => {
    const at = (wordIdx: number) => words[Math.max(s.from, Math.min(s.to, wordIdx))]!.startMs;
    const local = s.text;
    const isLast = k === segs.length - 1;
    const num = findNumber(local);
    const isQuestion = /\?$/.test(local[local.length - 1]?.trim() ?? '');
    const parts = local
      .join(' ')
      .split(/,|\band\b|\bor\b/i)
      .map((p) => p.trim())
      .filter((p) => p.split(/\s+/).length <= 4 && p.length > 1);
    let content: ReelTemplate | null = null;
    let layout: ReelScene['layout'] = graphic;

    if (k === 0) {
      const title = keyWords(local, 4) || sentence(local, 30);
      const kicker = leadWords(local, title, 3);
      content = {
        template: 'headline',
        ...(kicker ? { kicker } : {}),
        title,
        accent: title.split(' ').slice(-1)[0] ?? '',
      };
    } else if (num && lastTpl !== 'counter') {
      const label = keyWords(local.slice(num.end + 1), 3) || keyWords(local, 3);
      content = {
        template: 'counter',
        value: num.value,
        decimals: Number.isInteger(num.value) ? 0 : 1,
        prefix: /\$/.test(local[num.index] ?? '') ? '$' : '',
        suffix: num.suffix,
        label: label.slice(0, 36) || 'Total',
      };
    } else if (parts.length >= 3 && lastTpl !== 'list') {
      // An enumeration: cue each part on its first word.
      let cursor = s.from;
      const items = parts.slice(0, 4).map((p) => {
        const first = clean(p.split(/\s+/)[0] ?? '').toLowerCase();
        for (let i = cursor; i <= s.to; i++) {
          if (clean(words[i]!.text).toLowerCase() === first) {
            cursor = i + 1;
            return { at: at(i), icon: iconFor(p, 'check'), text: sentence(p.split(/\s+/), 26) };
          }
        }
        return { at: at(cursor), icon: iconFor(p, 'check'), text: sentence(p.split(/\s+/), 26) };
      });
      content = { template: 'list', title: keyWords(local.slice(0, 4), 3) || 'Here is how', items };
    } else if (isLast && callToAction(local)) {
      layout = 'speaker';
      content = { template: 'cta', ...callToAction(local)! };
    } else if (contrast(local) && lastTpl !== 'compare') {
      const c = contrast(local)!;
      content = {
        template: 'compare',
        left: c.left,
        right: c.right,
        winner: 'right',
        leftIcon: 'x',
        rightIcon: iconFor(c.right, 'check'),
        rows: [],
      };
    } else if (!lastSpeaker && !isLast && local.length <= 6 && k % 2 === 0) {
      layout = 'speaker';
      content = { template: 'punch', text: sentence(local, 26) };
    } else if (isQuestion) {
      content = {
        template: 'statement',
        strike: false,
        icon: 'search',
        lines: clauseLines(local, s.from, at),
      };
    } else if (isLast) {
      layout = 'speaker';
      content = { template: 'none' };
    } else {
      let tpl = rotation[rot++ % rotation.length]!;
      if (tpl === lastTpl) tpl = rotation[rot++ % rotation.length]!;
      const verb = PROGRESS_WORDS.exec(local.join(' '));
      const lines = clauseLines(local, s.from, at);
      if (verb && lastTpl !== 'progress' && !usedProgress) {
        usedProgress = true;
        const title = fitWords(local, 4, 32) || 'In progress';
        content = {
          template: 'progress',
          icon: iconFor(local.join(' '), 'loader'),
          title,
          doneTitle: 'Done',
        };
      } else if (lines.length >= 2 && lastTpl !== 'checklist') {
        const rows = lines
          .map((l) => ({ at: l.at, label: fitWords(l.text.split(' '), 3, 18) }))
          .filter((r) => r.label);
        content =
          rows.length >= 2
            ? { template: 'checklist', rows: rows.slice(0, 4) }
            : { template: 'statement', strike: false, icon: iconFor(local.join(' ')), lines };
      } else if (tpl === 'list' && lastTpl !== 'stack') {
        // Stacked key words, each on the word that says it.
        const keys: { at: number; text: string }[] = [];
        local.forEach((w, i) => {
          const c = clean(w);
          if (c.length >= 4 && !STOP.has(c.toLowerCase()) && keys.length < 4) {
            if (!keys.some((x) => x.text.toLowerCase() === c.toLowerCase()) && c.length <= 18)
              keys.push({ at: at(s.from + i), text: c });
          }
        });
        content =
          keys.length >= 2
            ? {
                template: 'stack',
                label: sentence(local, 30) || 'Remember',
                words: keys.slice(-3),
              }
            : { template: 'statement', strike: false, icon: iconFor(local.join(' ')), lines };
      } else if (tpl === 'headline') {
        const title = keyWords(local, 4);
        const kicker = leadWords(local, title, 4);
        content = { template: 'headline', ...(kicker ? { kicker } : {}), title };
      } else {
        content = {
          template: 'statement',
          strike: false,
          icon: iconFor(local.join(' ')),
          lines: clauseLines(local, s.from, at),
        };
      }
    }
    if (!content) return;
    const parsed = ReelSceneSchema.safeParse({
      id: `r${k + 1}`,
      startMs: k === 0 ? 0 : s.startMs,
      endMs: s.endMs,
      layout,
      content,
    });
    if (!parsed.success) {
      layout = 'speaker';
      content = { template: 'none' };
    }
    scenes.push(
      parsed.success
        ? parsed.data
        : { id: `r${k + 1}`, startMs: k === 0 ? 0 : s.startMs, endMs: s.endMs, layout, content },
    );
    lastTpl = content.template;
    lastSpeaker = layout === 'speaker';
  });
  return ReelPlanSchema.parse({
    v: 1,
    look,
    captions: true,
    scenes: tileReelScenes(scenes, durationMs),
    by: 'auto',
  });
}
