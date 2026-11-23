// Small text helpers shared by the reel director and the edit-choices post-pass.

export const cut = (s: string | undefined, max: number): string | undefined => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  if (t.length <= max) return t;
  // Drop leading filler first ("What you complete" → "Complete"): the content word survives.
  const lead = t.split(' ');
  while (lead.length > 1 && DANGLING.has(lead[0]!.toLowerCase())) lead.shift();
  const core = lead.join(' ');
  if (core.length <= max && core.length < t.length) return core[0]!.toUpperCase() + core.slice(1);
  // Cut on a word boundary.
  const sliced = t.slice(0, max + 1);
  const sp = sliced.lastIndexOf(' ');
  if (sp <= max * 0.5) return t.slice(0, max).trim();
  // Never end on a dangling little word ("What you", "Speed and").
  const words = sliced.slice(0, sp).trim().split(' ');
  while (words.length > 1 && DANGLING.has(words[words.length - 1]!.toLowerCase())) words.pop();
  return words.join(' ');
};
const DANGLING = new Set(
  'a an the and or but of to for in on at by with from you your my our their what that this is are was'.split(
    ' ',
  ),
);
