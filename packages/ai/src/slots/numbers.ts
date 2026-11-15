// Spoken and written number parsing for the slot tagger (spec 06, R1.2).
// Pure, dependency-free. `tokens` are transcript word texts and may carry
// punctuation ("2020.", "forty,") and mixed case.

export type SpokenUnit = '%' | '$' | '£' | '€' | 'x';

export interface SpokenNumber {
  value: number;
  unit?: SpokenUnit;
  kind: 'number' | 'year';
  /** Exclusive index after the last consumed token. */
  end: number;
}

interface Cleaned {
  text: string;
  /** The token ended with sentence or clause punctuation, so nothing may continue it. */
  brk: boolean;
}

interface Atom {
  w: string;
  tok: number;
  /** Last atom of its token (hyphenated tokens yield several atoms). */
  last: boolean;
  brk: boolean;
}

const ONES = new Map<string, number>([
  ['zero', 0],
  ['one', 1],
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
]);
const TEENS = new Map<string, number>([
  ['ten', 10],
  ['eleven', 11],
  ['twelve', 12],
  ['thirteen', 13],
  ['fourteen', 14],
  ['fifteen', 15],
  ['sixteen', 16],
  ['seventeen', 17],
  ['eighteen', 18],
  ['nineteen', 19],
]);
const TENS = new Map<string, number>([
  ['twenty', 20],
  ['thirty', 30],
  ['forty', 40],
  ['fourty', 40],
  ['fifty', 50],
  ['sixty', 60],
  ['seventy', 70],
  ['eighty', 80],
  ['ninety', 90],
]);
const SCALES = new Map<string, number>([
  ['thousand', 1e3],
  ['million', 1e6],
  ['billion', 1e9],
  ['trillion', 1e12],
]);
const SUFFIX_SCALES = new Map<string, number>([
  ['k', 1e3],
  ['m', 1e6],
  ['mm', 1e6],
  ['b', 1e9],
  ['bn', 1e9],
  ['t', 1e12],
  ...SCALES,
]);
const MULTIPLIERS = new Map<string, number>([
  ['doubled', 2],
  ['tripled', 3],
  ['quadrupled', 4],
]);
const UNIT_WORDS = new Map<string, SpokenUnit>([
  ['%', '%'],
  ['percent', '%'],
  ['dollar', '$'],
  ['dollars', '$'],
  ['pound', '£'],
  ['pounds', '£'],
  ['euro', '€'],
  ['euros', '€'],
  ['times', 'x'],
  ['x', 'x'],
]);

const LEADING = /^[("'“‘[]+/;
const TRAILING = /[.,;:!?…—–)"'”’\]]+$/;
const DIGITS =
  /^([$£€])?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(k|mm|m|bn|b|t|thousand|million|billion|trillion)?(%|x)?$/;
const FOUR_DIGITS = /^\d{4}$/;

function clean(raw: string | undefined): Cleaned {
  if (raw === undefined) return { text: '', brk: false };
  const lower = raw.toLowerCase().replace(LEADING, '');
  const m = TRAILING.exec(lower);
  if (!m) return { text: lower, brk: false };
  return { text: lower.slice(0, m.index), brk: true };
}

function isNumberWord(w: string): boolean {
  return (
    ONES.has(w) ||
    TEENS.has(w) ||
    TENS.has(w) ||
    SCALES.has(w) ||
    w === 'hundred' ||
    w === 'and' ||
    w === 'a' ||
    w === 'point' ||
    w === 'oh'
  );
}

/** Multiply and strip float noise (2.5 * 1e6 stays 2500000). */
function scaled(value: number, factor: number): number {
  return factor === 1 ? value : Number((value * factor).toPrecision(15));
}

/** Reads an optional unit word at `at`. `prevBrk` blocks it after punctuation. */
function readUnit(
  tokens: readonly string[],
  at: number,
  prevBrk: boolean,
): { unit?: SpokenUnit; end: number } {
  if (prevBrk || at >= tokens.length) return { end: at };
  const c = clean(tokens[at]);
  if (c.text === 'per' && !c.brk && clean(tokens[at + 1]).text === 'cent') {
    return { unit: '%', end: at + 2 };
  }
  const unit = UNIT_WORDS.get(c.text);
  return unit === undefined ? { end: at } : { unit, end: at + 1 };
}

function withUnit(
  value: number,
  kind: 'number' | 'year',
  end: number,
  unit: SpokenUnit | undefined,
): SpokenNumber {
  return unit === undefined ? { value, kind, end } : { value, unit, kind, end };
}

function parseDigits(
  tokens: readonly string[],
  from: number,
  c: Cleaned,
  m: RegExpExecArray,
): SpokenNumber {
  const prefix = m[1] as SpokenUnit | undefined;
  const numStr = (m[2] ?? '').replace(/,/g, '');
  const suffixScale = m[3];
  const suffixUnit = m[4] as SpokenUnit | undefined;
  let end = from + 1;
  let brk = c.brk;
  let factor = suffixScale === undefined ? 1 : (SUFFIX_SCALES.get(suffixScale) ?? 1);
  const num = parseFloat(numStr);

  const bare = prefix === undefined && suffixScale === undefined && suffixUnit === undefined;
  if (bare && FOUR_DIGITS.test(m[2] ?? '') && num >= 1900 && num <= 2099) {
    const next = brk ? '' : clean(tokens[end]).text;
    if (!SCALES.has(next) && !UNIT_WORDS.has(next) && next !== 'per') {
      return { value: num, kind: 'year', end };
    }
  }

  if (suffixScale === undefined && !brk && end < tokens.length) {
    const next = clean(tokens[end]);
    const f = SCALES.get(next.text);
    if (f !== undefined) {
      factor = f;
      end += 1;
      brk = next.brk;
    }
  }
  const value = scaled(num, factor);
  if (prefix !== undefined) return withUnit(value, 'number', end, prefix);
  if (suffixUnit !== undefined) return withUnit(value, 'number', end, suffixUnit);
  const u = readUnit(tokens, end, brk);
  return withUnit(value, 'number', u.end, u.unit);
}

function collectAtoms(tokens: readonly string[], from: number): Atom[] {
  const atoms: Atom[] = [];
  for (let i = from; i < tokens.length; i++) {
    const c = clean(tokens[i]);
    const parts = c.text.split('-');
    if (!parts.every(isNumberWord)) break;
    for (let j = 0; j < parts.length; j++) {
      atoms.push({ w: parts[j] ?? '', tok: i, last: j === parts.length - 1, brk: c.brk });
    }
    if (c.brk) break;
  }
  return atoms;
}

/** "twenty twenty" → 2020, "nineteen ninety-nine" → 1999, "twenty oh five" → 2005. */
function parseSpokenYear(atoms: readonly Atom[]): { value: number; lastIdx: number } | null {
  const a0 = atoms[0]?.w;
  const base = a0 === 'nineteen' ? 19 : a0 === 'twenty' ? 20 : 0;
  if (base === 0) return null;
  const w1 = atoms[1]?.w;
  if (w1 === undefined) return null;
  const teen = TEENS.get(w1);
  if (teen !== undefined) return { value: base * 100 + teen, lastIdx: 1 };
  const w2 = atoms[2]?.w;
  const ones = w2 === undefined ? undefined : ONES.get(w2);
  const hasOnes = ones !== undefined && ones >= 1;
  const tens = TENS.get(w1);
  if (tens !== undefined) {
    return hasOnes
      ? { value: base * 100 + tens + ones, lastIdx: 2 }
      : { value: base * 100 + tens, lastIdx: 1 };
  }
  if (w1 === 'oh' && hasOnes) return { value: base * 100 + ones, lastIdx: 2 };
  return null;
}

function isLowWord(w: string): boolean {
  return (ONES.has(w) && w !== 'zero') || TEENS.has(w) || TENS.has(w);
}

/** Cardinal grammar over atoms. Returns the value and the index of the last consumed atom. */
function parseCardinal(atoms: readonly Atom[]): { value: number; lastIdx: number } | null {
  let total = 0;
  let current = 0;
  let lastScale = Infinity;
  let last = -1;
  let i = 0;
  let value: number | undefined;

  if (atoms[0]?.w === 'a') {
    const n = atoms[1]?.w;
    if (n === undefined || !(n === 'hundred' || SCALES.has(n))) return null;
    current = 1;
    i = 1;
  }

  while (i < atoms.length) {
    const w = atoms[i]?.w;
    if (w === undefined) break;
    const low = current % 100;

    const one = ONES.get(w);
    if (one !== undefined) {
      if (one === 0) {
        if (i !== 0) break;
        last = i;
        i += 1;
        if (atoms[i]?.w !== 'point') break;
        continue;
      }
      if (low === 0 || (low >= 20 && low % 10 === 0)) {
        current += one;
        last = i;
        i += 1;
        continue;
      }
      break;
    }
    const teen = TEENS.get(w);
    if (teen !== undefined) {
      if (low !== 0) break;
      current += teen;
      last = i;
      i += 1;
      continue;
    }
    const tens = TENS.get(w);
    if (tens !== undefined) {
      if (low !== 0) break;
      current += tens;
      last = i;
      i += 1;
      continue;
    }
    if (w === 'hundred') {
      if (current <= 0 || current >= 100) break;
      current *= 100;
      last = i;
      i += 1;
      continue;
    }
    const sc = SCALES.get(w);
    if (sc !== undefined) {
      if (current <= 0 || sc >= lastScale) break;
      total += current * sc;
      current = 0;
      lastScale = sc;
      last = i;
      i += 1;
      continue;
    }
    if (w === 'and') {
      const nx = atoms[i + 1]?.w;
      const joins = (current > 0 && low === 0) || (current === 0 && total > 0);
      if (nx !== undefined && isLowWord(nx) && last >= 0 && joins) {
        i += 1;
        continue;
      }
      break;
    }
    if (w === 'point') {
      if (last < 0 || lastScale !== Infinity) break;
      let j = i + 1;
      let digits = '';
      for (;;) {
        const d = ONES.get(atoms[j]?.w ?? '');
        if (d === undefined) break;
        digits += String(d);
        j += 1;
      }
      if (digits === '') break;
      let v = Number(`${total + current}.${digits}`);
      let lastIdx = j - 1;
      const f = SCALES.get(atoms[j]?.w ?? '');
      if (f !== undefined) {
        v = scaled(v, f);
        lastIdx = j;
      }
      value = v;
      last = lastIdx;
      break;
    }
    break;
  }

  if (last < 0) return null;
  return { value: value ?? total + current, lastIdx: last };
}

function parseSpelled(tokens: readonly string[], from: number): SpokenNumber | null {
  const atoms = collectAtoms(tokens, from);
  const w0 = atoms[0]?.w;
  if (w0 === undefined) return null;
  if (!(ONES.has(w0) || TEENS.has(w0) || TENS.has(w0) || w0 === 'a')) return null;

  const spokenYear = parseSpokenYear(atoms);
  if (spokenYear) {
    const la = atoms[spokenYear.lastIdx];
    if (!la || !la.last) return null;
    return { value: spokenYear.value, kind: 'year', end: la.tok + 1 };
  }

  const parsed = parseCardinal(atoms);
  if (!parsed) return null;
  const la = atoms[parsed.lastIdx];
  if (!la || !la.last) return null;

  const u = readUnit(tokens, la.tok + 1, la.brk);
  // A lone "one" before "of" is a pronoun ("one of the"), not a number.
  if (
    u.unit === undefined &&
    parsed.lastIdx === 0 &&
    w0 === 'one' &&
    clean(tokens[la.tok + 1]).text === 'of'
  ) {
    return null;
  }
  // "two thousand and five": spoken years in the 2000s.
  const isYear =
    u.unit === undefined &&
    atoms[0]?.w === 'two' &&
    atoms[1]?.w === 'thousand' &&
    parsed.value > 2000 &&
    parsed.value < 2100;
  return withUnit(parsed.value, isYear ? 'year' : 'number', u.end, u.unit);
}

/**
 * Parses a number starting at `tokens[from]`. Returns null when that token does
 * not start one. `end` is the exclusive index after the last consumed token.
 */
export function parseSpokenNumber(tokens: readonly string[], from: number): SpokenNumber | null {
  if (from < 0 || from >= tokens.length) return null;
  const c = clean(tokens[from]);
  if (c.text === '') return null;

  const m = DIGITS.exec(c.text);
  if (m) return parseDigits(tokens, from, c, m);

  const mult = MULTIPLIERS.get(c.text);
  if (mult !== undefined) return { value: mult, unit: 'x', kind: 'number', end: from + 1 };
  if (c.text === 'half') return { value: 0.5, kind: 'number', end: from + 1 };

  return parseSpelled(tokens, from);
}
