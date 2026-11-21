// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { filmKit } from './kit';

function makeKit() {
  const root = document.createElement('div');
  document.body.append(root);
  const { kit } = filmKit(root, {
    width: 1080,
    height: 1920,
    format: '9:16',
    durationMs: 4000,
    keyMomentMs: 600,
    seed: 7,
    colors: {
      bg: '#EDE8DF',
      ink: '#171614',
      muted: '#6B655C',
      accent: '#DF6B41',
      accent2: '#2563EB',
      highlight: '#F59E0B',
      positive: '#16A34A',
      negative: '#DC2626',
      chart: ['#DF6B41', '#2563EB', '#16A34A'],
    },
    fonts: { display: 'Playfair Display', body: 'Geist', mono: 'Geist Mono' },
    words: [{ text: 'hello', startMs: 0, endMs: 500 }],
    radius: 18,
    stroke: 2,
    images: {
      'img-demo': { src: 'data:image/png;base64,iVBORw0KGgo=', width: 512, height: 512, keyed: true },
    },
    warn: () => undefined,
  });
  return { root, kit };
}

describe('Reel UI, Motion & 3D Kit (spec 23 Pillars 4 & 5)', () => {
  it('builds deterministic stage, card, window, odometer, ring, meter, tile, flowDots, chart, stamp, strike, chapter, image, card3d, globe and mesh3d', () => {
    const { root, kit } = makeKit();

    const st = kit.stage({ tone: 'auto', region: 'top-half' });
    expect(st.getAttribute('data-mp-stage')).toBe('cream');

    const c = kit.card({ x: '8%', y: '8%', w: '84%', h: '20%', variant: 'light-elevated' });
    expect(c.el.getAttribute('data-mp-card')).toBe('light-elevated');

    const win = kit.window({ kind: 'terminal', title: '~/.skills', badge: '2,700 words' });
    expect(win.el.getAttribute('data-mp-window')).toBe('terminal');
    expect(win.badgeEl?.textContent).toBe('2,700 words');

    const numEl = document.createElement('span');
    c.body.append(numEl);
    const odo = kit.odometer(numEl, { from: 58, to: 1, suffix: '%' });
    odo.set(0);
    expect(numEl.textContent).toBe('58%');
    odo.set(1);
    expect(numEl.textContent).toBe('1%');

    const r = kit.ring({ size: '10u', parent: c.body });
    r.set(0.5);
    expect(r.el.querySelectorAll('circle').length).toBe(2);

    const m = kit.meter({ marker: 0.88, markerLabel: 'best 0.88', parent: c.body });
    m.set(0.56);
    expect(m.el.textContent).toContain('best 0.88');

    const t1 = kit.tile({ label: 'Agent', icon: 'cpu', size: '14u' });
    expect(t1.textContent).toContain('Agent');

    const fd = kit.flowDots([100, 100], [400, 100], { count: 3 });
    fd.set(0.5);
    expect(fd.el.querySelectorAll('circle').length).toBe(3);

    const ch = kit.chart({
      type: 'line',
      title: 'Star History',
      points: [
        { label: 'Oct', y: 10 },
        { label: 'Apr', y: 95, highlight: true },
      ],
      targetZone: { fromX: 0, toX: 0.4, label: '200ms' },
    });
    ch.set(1);
    expect(ch.el.querySelector('svg')).not.toBeNull();

    const stampEl = kit.stamp('OLD WAY');
    expect(stampEl.textContent).toBe('OLD WAY');

    const sl = kit.strike(c.el);
    sl.set(1);
    expect(sl.el.querySelector('line')?.getAttribute('stroke-dashoffset')).toBe('0.0');

    const chap = kit.chapter('skill no #1', 'find skills');
    expect(chap.textContent).toContain('skill no #1');

    const imgWrap = kit.image('img-demo');
    expect(imgWrap.querySelector('img')?.getAttribute('src')).toContain('data:image/png;base64');

    const c3 = kit.card3d({ rotateX: 8, rotateY: -12 });
    c3.setTilt(2, -4, 1.02);
    expect(c3.el.style.transform).toContain('perspective(1200px)');

    const gl = kit.globe({ size: '50%', style: 'editorial' });
    gl.set(15, 20, 1);
    expect(gl.el.getAttribute('data-mp-globe')).toBe('editorial');

    const m3 = kit.mesh3d({ kind: 'coins', count: 8 });
    m3.set(1);
    expect(m3.el.querySelectorAll('ellipse').length).toBeGreaterThan(4);

    root.remove();
  });
});
