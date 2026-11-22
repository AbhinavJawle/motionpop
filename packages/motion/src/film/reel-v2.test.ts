// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { inspectBeat } from './critic';
import { filmKit } from './kit';
import { clippedStageBounds } from './stage-bounds';

describe('Reel Engine v2 core invariants (spec 24)', () => {
  it('computes exact clipped stage bounds for 9:16 split-top-stage (50%) and top-card (28%)', () => {
    const split = clippedStageBounds('9:16', 1080, 1920, 'split-top-stage');
    expect(split).toEqual({
      x: 0,
      y: 0,
      width: 1080,
      height: 960,
      clipped: true,
      opaqueSurface: true,
    });
    const topCard = clippedStageBounds('9:16', 1080, 1920, 'top-card');
    expect(topCard).toEqual({
      x: 0,
      y: 0,
      width: 1080,
      height: 538,
      clipped: true,
      opaqueSurface: false,
    });
    const clean = clippedStageBounds('9:16', 1080, 1920, 'clean');
    expect(clean.clipped).toBe(false);
    expect(clean.opaqueSurface).toBe(false);
  });

  it('prevents mp.stage() from painting an opaque curtain over full/backdrop/clean/top-card stages', () => {
    const warnings: string[] = [];
    const root = document.createElement('div');
    document.body.append(root);
    const { kit } = filmKit(root, {
      width: 1080,
      height: 1920,
      videoStage: 'backdrop',
      format: '9:16',
      durationMs: 3000,
      keyMomentMs: 500,
      seed: 1,
      colors: {
        bg: '#FFFFFF',
        ink: '#0A0A0E',
        muted: '#526074',
        accent: '#2563EB',
        accent2: '#0A0A0E',
        highlight: '#F59E0B',
        positive: '#10B981',
        negative: '#EF4444',
        chart: ['#2563EB'],
      },
      fonts: { display: 'Geist', body: 'Geist', mono: 'Geist Mono' },
      words: [{ text: 'hello', startMs: 0, endMs: 400 }],
      radius: 16,
      stroke: 2,
      warn: (m) => warnings.push(m),
    });
    const res = kit.stage({ tone: 'cream', region: 'top-half' });
    expect(res).toBe(root);
    expect(root.querySelector('[data-mp-stage]')).toBeNull();
    expect(warnings.some((w) => w.includes('ignored on "backdrop"'))).toBe(true);
    root.remove();
  });

  it('catches low-contrast white text over data-mp-stage-bg and catches large empty boxes', () => {
    const host = document.createElement('div');
    host.setAttribute('data-mp-stage-bg', '#EDE8DF');
    host.getBoundingClientRect = () => new DOMRect(0, 0, 1080, 960);

    const text = document.createElement('div');
    text.textContent = 'So beautiful.';
    text.style.cssText = 'color:#FFFFFF;font-size:64px;opacity:1;';
    text.getBoundingClientRect = () => new DOMRect(100, 120, 480, 80);

    const emptyCard = document.createElement('div');
    emptyCard.style.cssText = 'background-color:#FFFFFF;border:2px solid #0A0A0E;opacity:1;';
    emptyCard.getBoundingClientRect = () => new DOMRect(120, 260, 420, 340);

    host.append(text, emptyCard);
    document.body.append(host);

    const summary = inspectBeat(
      host,
      (t) => {
        text.style.transform = `translateY(${Math.round(t / 100)}px)`;
      },
      {
        durationMs: 3000,
        keyMomentMs: 500,
        width: 1080,
        height: 960,
        frameShortSide: 1080,
        bg: '#EDE8DF',
        transparent: true,
        reelMode: true,
        videoStage: 'split-top-stage',
      },
    );

    expect(summary.reports.some((r) => r.rule === 'low-contrast')).toBe(true);
    expect(summary.reports.some((r) => r.rule === 'empty-box')).toBe(true);
    host.remove();
  });

  it('reads a badge against its own fill, not the card under it (spec 30)', () => {
    const host = document.createElement('div');
    const card = document.createElement('div');
    card.style.cssText = 'background-color:#FFFFFF;';
    card.getBoundingClientRect = () => new DOMRect(100, 100, 600, 200);
    const badge = document.createElement('div');
    badge.textContent = '01';
    badge.style.cssText = 'background-color:#0A0A0E;color:#FFFFFF;font-size:32px;';
    badge.getBoundingClientRect = () => new DOMRect(560, 160, 80, 48);
    const label = document.createElement('div');
    label.textContent = 'Train assistants';
    label.style.cssText = 'color:#0A0A0E;font-size:48px;';
    label.getBoundingClientRect = () => new DOMRect(140, 150, 380, 60);
    card.append(label, badge);
    host.append(card);
    document.body.append(host);
    const summary = inspectBeat(host, () => {}, {
      durationMs: 3000,
      keyMomentMs: 500,
      width: 720,
      height: 640,
      frameShortSide: 720,
      bg: '#FFFFFF',
      reelMode: true,
    });
    expect(summary.reports.filter((r) => r.rule === 'low-contrast')).toEqual([]);
    host.remove();
  });
});
