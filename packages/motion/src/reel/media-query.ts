// Reel engine (spec 26): how a picture request turns into a fetch. Shared by the product
// resolver and the dev lab so both ask for the same thing. No brand data lives here: names come
// from what the speaker said, at runtime.
import type { ReelLook } from '@motionpop/schemas';

/** A logo request's query is `name` or `name|domain` (the director's domain hint). */
export function splitLogoQuery(q: string): { name: string; domain?: string } {
  const [name, domain] = q.split('|').map((x) => x.trim());
  return domain ? { name: name ?? q, domain } : { name: name ?? q };
}

/**
 * Icon-set slugs to try for a spoken brand name, best first: "Framer Motion" → framermotion,
 * framer; "Three.js" → threedotjs, threejs, three; "example.com" → example.
 */
export function logoSlugs(query: string): string[] {
  const { name, domain } = splitLogoQuery(query);
  const raw = name
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '');
  const host = /\.[a-z]{2,}(\/|$)/.test(raw) && !/\.js$/.test(raw) ? raw.split('/')[0]! : '';
  const base = host ? host.replace(/\.[a-z.]+$/, '') : raw;
  const out = new Set<string>();
  const add = (s: string) => {
    const v = s.replace(/[^a-z0-9]/g, '');
    if (v) out.add(v);
  };
  add(base.replace(/\./g, 'dot').replace(/\+/g, 'plus'));
  add(base.replace(/\+/g, 'plus'));
  add(base);
  const words = base.split(/[\s.\-_/]+/).filter(Boolean);
  if (words.length > 1) add(words[0]!);
  if (domain) add(domain.replace(/^www\./, '').split('.')[0] ?? '');
  return [...out].slice(0, 5);
}

/** The image-model prompt for an illustration in the look's own style. */
export function illustrationPrompt(look: ReelLook, subject: string): string {
  const style =
    look === 'mono'
      ? 'Minimal black ink line illustration with flat light grey shading, editorial explainer style, crisp clean strokes'
      : 'Warm editorial illustration, soft grain, muted terracotta orange, charcoal and sand tones, gentle shading, modern explainer style';
  return [
    `${style}. Subject: ${subject}.`,
    'One clear subject, centred, with generous empty margin around it.',
    look === 'mono'
      ? 'Background: plain pure white, completely empty, no floor, no shadow, no texture.'
      : 'Background: plain warm off-white paper (#F4F1EC), completely empty, no floor line, no frame.',
    'No text, no letters, no numbers, no logos, no watermark. No real or identifiable people.',
  ].join(' ');
}
