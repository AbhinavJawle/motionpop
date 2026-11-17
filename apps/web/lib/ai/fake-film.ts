import type { FilmBuildInput, FilmBuildOutput, FilmDirectInput } from '@motionpop/ai';
import { FILM_MAX_BEAT_MS, FILM_MIN_BEAT_MS, type Storyboard } from '@motionpop/schemas';

/**
 * Film mode's answers for the fake router (development and e2e): a storyboard cut at sentence
 * ends and a plain kit beat per stretch, so the whole film path (credits, parallel builders, the
 * sandbox critic, the one-step replace) runs with no model. Deterministic.
 */
const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

export function filmDirectAnswer(input: FilmDirectInput): Storyboard {
  const { words, durationMs } = input;
  const beats: Storyboard['beats'] = [];
  let start = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!w) continue;
    const last = i === words.length - 1;
    const sentenceEnd = /[.!?…]$/.test(w.text);
    const from = start === 0 ? 0 : (words[start]?.startMs ?? 0);
    const to = last ? durationMs : (words[i + 1]?.startMs ?? durationMs);
    const rest = durationMs - to;
    // Close at a sentence end once the beat is long enough, or once it nears the longest beat
    // allowed (unpunctuated speech must still tile), if what is left can make a beat too.
    const long = to - from >= FILM_MAX_BEAT_MS * 0.6;
    const cut = (sentenceEnd && to - from >= 2 * FILM_MIN_BEAT_MS) || long;
    // What is left must still make a beat, with room for the lead-in each beat takes from its last word.
    const room = rest >= FILM_MIN_BEAT_MS + 600;
    if (!last && !(cut && room)) continue;
    const mine = words.slice(start, i + 1);
    const number = mine.findIndex((x) => /\d/.test(x.text));
    const hero = (
      number >= 0
        ? (mine[number]?.text ?? '')
        : mine
            .slice(0, 3)
            .map((x) => x.text)
            .join(' ')
    ).replace(/[.,!?;:]+$/, '');
    beats.push({
      id: `b${beats.length + 1}`,
      wordStart: start,
      wordEnd: i,
      lead: number >= 0 ? 'number' : 'picture',
      idea: `A fake beat for "${mine
        .slice(0, 6)
        .map((x) => x.text)
        .join(' ')}"`,
      text: [hero || 'Beat'],
      landsOn: start + Math.max(0, number),
      staging: 'The hero lands on its word; dots fill beside it.',
      seam: {
        kind: 'push',
        note: 'Everything leaves to the left; the next beat arrives from the right.',
      },
    });
    start = i + 1;
  }
  return {
    title: 'A fake film',
    thesis: 'The fake router made this film.',
    world: 'The look’s paper ground.',
    carrier: 'A field of dots.',
    props: [],
    beats,
  };
}

export function filmBuildAnswer(input: FilmBuildInput): FilmBuildOutput {
  const hero = input.beat.text[0] ?? 'Beat';
  const label = input.beat.text[1] ?? '';
  return {
    title: hero.slice(0, 60) || 'Beat',
    html: `<div class="wrap"><div class="hero">${escapeHtml(hero)}</div>${label ? `<div class="label">${escapeHtml(label)}</div>` : ''}</div>`,
    css: [
      '.wrap { position: absolute; left: 8%; top: 24%; width: 44%; }',
      '.hero { font-family: var(--display); font-weight: 800; font-size: calc(var(--u) * 14); line-height: 1; color: var(--accent); }',
      '.label { font-family: var(--body); font-weight: 600; font-size: calc(var(--u) * 3.4); color: var(--ink); margin-top: calc(var(--u) * 2); }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'const dots = mp.dots(96, { x: "56%", y: "20%", w: "34%", h: "58%", color: mp.colors.ink });',
      'mp.fit(root.querySelector(".hero"), "44%");',
      'tl.enter("push", [".wrap"]);',
      'tl.from(dots, { scale: 0, opacity: 0 }, { at: 200, each: 6, dur: 260, ease: "back" });',
      'tl.exit("push", [".wrap", dots]);',
      'return tl;',
    ].join('\n'),
    keyMomentMs: Math.min(input.beat.keyMomentMs, input.durationMs),
  };
}
