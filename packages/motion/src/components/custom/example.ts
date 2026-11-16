import type { CustomParams } from './params';

/**
 * A complete, valid custom graphic: the one example in the `custom.compose` prompt, the fixture
 * of the tests and the fake router's answer. A three-step milestone line that draws on, each step
 * landing on a beat, with the headline popping in at the key moment.
 */
export function customExample(
  headline = 'From idea to launch',
  steps = ['Idea', 'Build', 'Launch'],
): CustomParams {
  const items = steps
    .slice(0, 4)
    .map(
      (s, i) =>
        `<div class="step" data-i="${i}"><span class="dot"></span><span class="label">${escapeHtml(s)}</span></div>`,
    )
    .join('');
  return {
    title: headline.slice(0, 60),
    html: `<div class="frame"><h1 class="headline">${escapeHtml(headline)}</h1><div class="track"><div class="fill"></div>${items}</div></div>`,
    css: [
      '.frame { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8%; background: var(--bg); }',
      '.headline { font-family: var(--display); font-weight: 800; color: var(--ink); font-size: 6.2vw; margin: 0; letter-spacing: -0.02em; text-align: center; max-width: 84%; }',
      '.track { position: relative; width: 74%; height: 4px; background: var(--muted); border-radius: 4px; display: flex; justify-content: space-between; align-items: center; }',
      '.fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: var(--accent); border-radius: 4px; }',
      '.step { position: relative; display: flex; flex-direction: column; align-items: center; }',
      '.dot { width: 2.2vw; height: 2.2vw; border-radius: 50%; background: var(--accent); transform: scale(0); }',
      '.label { position: absolute; top: 3vw; font-family: var(--body); font-weight: 600; font-size: 2.2vw; color: var(--ink); white-space: nowrap; opacity: 0; }',
    ].join('\n'),
    script: [
      "const headline = root.querySelector('.headline');",
      "const fill = root.querySelector('.fill');",
      "const steps = Array.from(root.querySelectorAll('.step'));",
      'const n = steps.length;',
      '// Each step lands on a spoken word when there are enough words, else evenly.',
      'const lands = steps.map((_, i) => {',
      '  const w = ctx.words[Math.floor(((i + 1) * ctx.words.length) / (n + 1))];',
      '  return w ? w.startMs : ((i + 1) * ctx.durationMs) / (n + 2);',
      '});',
      'return {',
      '  seek(t) {',
      '    const h = mp.ease.back(mp.progress(t, 0, 500));',
      '    headline.style.opacity = String(mp.clamp(h));',
      '    headline.style.transform = `translateY(${(1 - h) * 40}px) scale(${0.9 + 0.1 * h})`;',
      '    const last = lands[n - 1];',
      '    fill.style.width = `${100 * mp.ease.inOut(mp.progress(t, 300, Math.max(400, last - 300)))}%`;',
      '    steps.forEach((s, i) => {',
      '      const p = mp.ease.back(mp.progress(t, lands[i] - 120, 360));',
      "      s.querySelector('.dot').style.transform = `scale(${p})`;",
      "      const label = s.querySelector('.label');",
      '      label.style.opacity = String(mp.clamp(p));',
      '      label.style.transform = `translateY(${(1 - mp.clamp(p)) * 12}px)`;',
      '    });',
      '    const out = mp.ease.inOut(mp.progress(t, ctx.durationMs - 300, 300));',
      '    root.style.opacity = String(1 - out);',
      '  },',
      '};',
    ].join('\n'),
    keyMomentMs: 500,
  };
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}
