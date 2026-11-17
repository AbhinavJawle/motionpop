/**
 * Companions (spec 07c R2): what fills the open side of a scene when it has no picture. A number
 * becomes something you can count (a grid of 100, a field of dots, a row of icons, a ruler); a
 * line about a thing gets that thing as a hand-drawn icon on a stamp. Derived by code from the
 * score and the spoken words, never by a model, so it is free, instant and the same everywhere.
 * Pure: same content and words, same companion.
 */
import { KIT_ICON_NAMES } from '../film/icons.generated';

export type Companion =
  /** A percentage as a 10 × 10 grid with `filled` cells in the accent. */
  | { kind: 'units'; filled: number; icon?: string }
  /** A count as that many dots (`n` ≤ DOTS_MAX), filling as the number counts up. */
  | { kind: 'dots'; n: number; icon?: string }
  /** A small count of things as a row of icons (2 ≤ n ≤ ICONS_MAX). */
  | { kind: 'icons'; n: number; icon: string }
  /** A length as a ruler that draws across, with the thing riding its front. */
  | { kind: 'ruler'; icon?: string }
  /** A concept as one big hand-drawn icon on a stamp. */
  | { kind: 'stamp'; icon: string };

export type CompanionKind = Companion['kind'];

export const DOTS_MAX = 500;
export const ICONS_MAX = 12;

const ICONS = new Set(KIT_ICON_NAMES);

/**
 * Words → icon (lower case, singular and plural). Concrete nouns only: an icon must show the
 * thing itself. No brand, product or company names.
 */
const LEXICON: Record<string, string> = Object.fromEntries(
  (
    [
      ['ship ships vessel vessels freighter freighters tanker tankers canal canals', 'ship'],
      ['boat boats sailboat yacht yachts', 'sailboat'],
      ['port ports harbour harbor anchor', 'anchor'],
      ['container containers', 'container'],
      ['truck trucks lorry lorries', 'truck'],
      ['plane planes aircraft airplane airplanes jet jets flight flights airline', 'plane'],
      ['rocket rockets launch spacecraft', 'rocket'],
      ['car cars vehicle vehicles', 'car'],
      ['bus buses', 'bus'],
      ['train trains railway rail', 'train-front'],
      ['bike bikes bicycle bicycles', 'bike'],
      ['oil fuel petrol gasoline barrel barrels', 'fuel'],
      ['world global globe planet earth countries nations', 'globe'],
      ['map maps', 'map'],
      ['route routes journey', 'compass'],
      ['mountain mountains', 'mountain'],
      ['city cities town towns skyscraper', 'building'],
      ['factory factories plant manufacturing', 'factory'],
      ['house houses home homes housing apartment apartments rent', 'house'],
      ['warehouse warehouses', 'warehouse'],
      ['shop shops store stores retail', 'store'],
      ['school schools students student classroom', 'school'],
      ['hospital hospitals', 'hospital'],
      ['tree trees forest forests', 'trees'],
      ['coin coins gold', 'coins'],
      ['money cash dollars dollar euros pounds goods trade', 'banknote'],
      ['wallet wallets', 'wallet'],
      ['savings saving piggy', 'piggy-bank'],
      ['card cards credit debt', 'credit-card'],
      ['price prices cost costs bill bills receipt', 'receipt'],
      ['growth grew grow growing rise rose risen soared', 'trending-up'],
      ['fell fall falling drop dropped decline crashed crash', 'trending-down'],
      ['chart charts data statistics', 'chart-column'],
      ['percent percentage share', 'percent'],
      ['law laws court courts judge', 'scale'],
      ['person man woman', 'user'],
      ['people workers employees users customers population humans citizens', 'users'],
      ['baby babies children child kids', 'baby'],
      ['deal deals partnership agreement', 'handshake'],
      ['heart hearts love health', 'heart'],
      ['brain brains mind memory', 'brain'],
      ['eye eyes', 'eye'],
      ['king kings queen crown empire', 'crown'],
      ['chip chips processor computing', 'cpu'],
      ['phone phones smartphone smartphones mobile', 'smartphone'],
      ['laptop laptops computer computers', 'laptop'],
      ['screen screens monitor television', 'monitor'],
      ['server servers datacenter', 'server'],
      ['database databases', 'database'],
      ['internet wifi online', 'wifi'],
      ['cloud clouds', 'cloud'],
      ['satellite satellites orbit', 'satellite'],
      ['radio', 'radio'],
      ['battery batteries', 'battery-full'],
      ['electricity power energy grid', 'zap'],
      ['robot robots ai automation', 'bot'],
      ['code software program programs', 'code'],
      ['lock locks security password', 'lock'],
      ['key keys', 'key'],
      ['shield defence defense protection army', 'shield'],
      ['bug bugs virus viruses', 'bug'],
      ['atom atoms nuclear physics', 'atom'],
      ['science chemistry experiment lab', 'flask-conical'],
      ['microscope cells cell bacteria', 'microscope'],
      ['dna gene genes genetic', 'dna'],
      ['temperature heat thermometer degrees', 'thermometer'],
      ['telescope space stars galaxy universe', 'telescope'],
      ['pill pills medicine drug drugs', 'pill'],
      ['vaccine vaccines injection', 'syringe'],
      ['doctor doctors', 'stethoscope'],
      ['sun solar sunlight summer', 'sun'],
      ['moon night', 'moon'],
      ['star', 'star'],
      ['rain storm storms weather', 'cloud-rain'],
      ['snow ice winter', 'snowflake'],
      ['fire fires flame flames wildfire', 'flame'],
      ['water drop drops river rivers rainfall', 'droplet'],
      ['ocean oceans sea seas sailing sailed voyage', 'sailboat'],
      ['leaf leaves plant plants nature climate', 'leaf'],
      ['seed seeds farm farms farming crops agriculture', 'sprout'],
      ['wind', 'wind'],
      ['fish fishing', 'fish'],
      ['bird birds', 'bird'],
      ['hour hours clock', 'clock'],
      ['day days week weeks month months year years calendar', 'calendar'],
      ['decade decades century centuries history time', 'hourglass'],
      ['minute minutes second seconds', 'timer'],
      ['book books library reading', 'book-open'],
      ['news newspaper newspapers media', 'newspaper'],
      ['email emails mail letter letters', 'mail'],
      ['call calls', 'phone'],
      ['idea ideas invention inventions', 'lightbulb'],
      ['tool tools repair', 'wrench'],
      ['package packages parcel parcels shipment shipments delivery deliveries', 'package'],
      ['box boxes', 'box'],
      ['shopping cart purchase purchases', 'shopping-cart'],
      ['gift gifts', 'gift'],
      ['trophy trophies win winner champion', 'trophy'],
      ['flag flags country pitch pitches stadium field fields', 'flag'],
      ['target targets goal goals', 'target'],
      ['camera cameras photo photos', 'camera'],
      ['music song songs microphone', 'mic'],
      ['wheat bread grain food', 'wheat'],
      ['apple apples fruit', 'apple'],
      ['meal meals restaurant restaurants', 'utensils'],
      ['coffee tea cup cups', 'coffee'],
      ['war wars battle battles weapon weapons', 'swords'],
      ['bomb bombs explosion', 'bomb'],
      ['vote votes election elections', 'vote'],
      ['mine mines mining miners', 'pickaxe'],
      ['construction builders bridge bridges', 'construction'],
      ['tractor tractors', 'tractor'],
      ['machine machines engine engines', 'cog'],
    ] as const
  ).flatMap(([words, icon]) => words.split(' ').map((w) => [w, icon] as const)),
);

const LENGTH = /^(metres?|meters?|km|kilometres?|kilometers?|miles?|feet|foot|ft|yards?|inches?|centimetres?|centimeters?|nautical)$/i;
const MONEY = /^(\$|€|£)$/;
const MONEY_ICONS = new Set(['coins', 'banknote', 'wallet', 'piggy-bank', 'credit-card', 'receipt']);

/** Lower-case bare word (edge punctuation dropped). */
export const bareWord = (w: string): string =>
  w
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/** The icon for a word, or null. */
export function iconFor(word: string): string | null {
  const icon = LEXICON[bareWord(word)];
  return icon && ICONS.has(icon) ? icon : null;
}

/** The first word in `words` (in order) that has an icon. */
export function firstIcon(words: readonly string[]): string | null {
  for (const w of words) {
    const icon = iconFor(w);
    if (icon) return icon;
  }
  return null;
}

/** What a stat-punch's number counts, from its label and the spoken words around it. */
export interface NumberFacts {
  value: number;
  prefix?: string | undefined;
  suffix?: string | undefined;
  label: string;
  /** The slot's spoken words, in order. */
  spoken?: readonly string[] | undefined;
}

/**
 * The noun right after the number in the spoken words ("369 ships", "six days", "400 metres"),
 * else the first word of the label. Lower case, or null.
 */
const SPELLED: Record<string, number> = Object.fromEntries(
  'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'
    .split(' ')
    .map((w, i) => [w, i] as const),
);

function unitNoun(f: NumberFacts): string | null {
  const spoken = (f.spoken ?? []).map(bareWord);
  const digits = String(f.value);
  const i = spoken.findIndex(
    (w) =>
      w.replace(/,/g, '') === digits ||
      w.replace(/,/g, '').startsWith(digits) ||
      SPELLED[w] === f.value,
  );
  for (const w of i >= 0 ? spoken.slice(i + 1, i + 3) : []) {
    if (!w || /^(of|the|a|an|and|percent|per|cent)$/.test(w)) continue;
    return w;
  }
  const first = f.label.split(/\s+/).map(bareWord).find(Boolean);
  return first ?? null;
}

/**
 * The physical form of a number (spec 07c R2.2). Percent → units; a length → ruler; a count of a
 * nameable thing → icons (small) or dots; money and everything else → a stamp when an icon fits.
 * Null when nothing honest can be drawn (a value that can't be shown one-to-one).
 */
export function numberCompanion(f: NumberFacts): Companion | null {
  const words = [...(f.spoken ?? []), ...f.label.split(/\s+/)];
  const noun = unitNoun(f);
  const nounIcon = noun ? iconFor(noun) : null;
  const anyIcon = nounIcon ?? firstIcon(words);
  const suffix = (f.suffix ?? '').trim();
  const v = f.value;
  if (suffix === '%') {
    if (v > 0 && v <= 100) return { kind: 'units', filled: Math.round(v), ...(anyIcon ? { icon: anyIcon } : {}) };
    return anyIcon ? { kind: 'stamp', icon: v > 100 ? 'trending-up' : anyIcon } : null;
  }
  if (noun && LENGTH.test(noun)) return { kind: 'ruler', ...(firstIcon(words) ? { icon: firstIcon(words)! } : {}) };
  if (MONEY.test(f.prefix ?? '') || /^(k|m|b|bn|t)$/i.test(suffix)) {
    // Money: a money icon from the words when there is one ("goods" → banknote), else coins.
    const money = words.map(iconFor).find((x) => x !== null && MONEY_ICONS.has(x));
    return { kind: 'stamp', icon: money ?? (MONEY.test(f.prefix ?? '') ? 'coins' : (anyIcon ?? 'coins')) };
  }
  const whole = Number.isInteger(v) && v > 0;
  if (whole && v >= 2 && v <= ICONS_MAX && nounIcon) return { kind: 'icons', n: v, icon: nounIcon };
  if (whole && v >= 2 && v <= DOTS_MAX && !(v >= 1000 && v <= 2100))
    return { kind: 'dots', n: v, ...(anyIcon ? { icon: anyIcon } : {}) };
  return anyIcon ? { kind: 'stamp', icon: anyIcon } : null;
}

/** A line's companion: its first concrete noun as a stamp (null when none has an icon). */
export function lineCompanion(words: readonly string[]): Companion | null {
  const icon = firstIcon(words);
  return icon ? { kind: 'stamp', icon } : null;
}

/** A short signature for the variety planner: two neighbours never share one. */
export const companionSig = (c: Companion | null): string =>
  c === null ? 'type' : c.kind === 'stamp' ? `stamp:${c.icon}` : c.kind;

/** Icons that stand for an idea, not a thing you could photograph. */
const ABSTRACT_ICONS = new Set([
  'trending-up',
  'trending-down',
  'percent',
  'chart-column',
  'calendar',
  'clock',
  'timer',
  'hourglass',
  'scale',
  'user',
  'users',
  'heart',
  'brain',
  'lock',
  'key',
  'shield',
  'bug',
  'code',
  'wifi',
  'zap',
  'target',
  'trophy',
  'lightbulb',
  'receipt',
  'credit-card',
  'handshake',
  'vote',
  'dollar-sign',
]);

/**
 * Concrete, photographable nouns in `words`, in order and without repeats (spec 07c R1.2): the
 * lexicon's words whose icon is a thing (a ship, a factory, coffee), never an idea (growth, time).
 * They are common nouns by construction, so a search built from them names no brand or person.
 */
export function picturableNouns(words: readonly string[]): string[] {
  const out: string[] = [];
  for (const w of words) {
    const b = bareWord(w);
    const icon = LEXICON[b];
    if (!icon || ABSTRACT_ICONS.has(icon) || out.includes(b)) continue;
    out.push(b);
  }
  return out;
}
