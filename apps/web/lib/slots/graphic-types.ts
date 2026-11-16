import { mapFromWords } from '@motionpop/motion';

/** Graphic types a creator can pick for a slot, in menu order (all built scenes). */
export const GRAPHIC_TYPES: readonly { id: string; name: string; about: string }[] = [
  { id: 'hook-statement', name: 'Hook statement', about: 'A line of big kinetic type' },
  { id: 'stat-punch', name: 'Stat punch', about: 'One number that lands hard' },
  { id: 'map-zoom', name: 'Map', about: 'A globe that flies to a place' },
  { id: 'chart-story', name: 'Chart story', about: 'Bars or a line with a point' },
  { id: 'versus', name: 'Versus', about: 'Two things side by side' },
  { id: 'list-stack', name: 'List stack', about: 'Steps or reasons, one by one' },
  { id: 'timeline', name: 'Timeline', about: 'Dates along a line' },
  { id: 'quote', name: 'Quote', about: 'Someone’s words, set large' },
  { id: 'photo-evidence', name: 'Photo', about: 'A picture with a caption' },
];

/** Words in a prompt that name a graphic type, checked in order (first match wins). */
const ASKS: readonly [RegExp, string][] = [
  [/\b(map|globe|country|countries|city)\b/i, 'map-zoom'],
  [/\b(chart|graph|bars?|line chart|trend|plot)\b/i, 'chart-story'],
  [/\b(timeline|over the years|history of|decades?)\b/i, 'timeline'],
  [/\b(versus|vs\.?|compare|comparison|side by side)\b/i, 'versus'],
  [/\b(list|steps|reasons|bullet|checklist)\b/i, 'list-stack'],
  [/\b(quote|quotation)\b/i, 'quote'],
  [/\b(photo|picture|image)\b/i, 'photo-evidence'],
  [/\b(number|stat|statistic|percent|figure)\b/i, 'stat-punch'],
  [/\b(headline|title|kinetic|statement|hook)\b/i, 'hook-statement'],
];

/** Older library ids that read as a scene type (a big number is a stat). */
const SAME: Record<string, string> = { 'big-number': 'stat-punch' };

/**
 * The graphic type a prompt asks for by name when it differs from `current`, or null (it names
 * none, or it also names the current type, so the creator is refining, not switching).
 */
export function askedGraphicType(prompt: string, current: string): string | null {
  const cur = SAME[current] ?? current;
  if (ASKS.some(([re, id]) => id === cur && re.test(prompt))) return null;
  for (const [re, id] of ASKS) if (re.test(prompt)) return id === cur ? null : id;
  return null;
}

/** The best first graphic for spoken words: a place gets a map, a number a stat, else a hook. */
export function graphicForWords(words: readonly string[]): string {
  const spoken = words.join(' ');
  if (mapFromWords(words)) return 'map-zoom';
  if (/\b(versus|vs\.?|compared to)\b/i.test(spoken)) return 'versus';
  if (/\d|percent|million|billion|thousand|hundred/i.test(spoken)) return 'stat-punch';
  return 'hook-statement';
}
