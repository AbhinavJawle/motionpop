import { describe, expect, it, vi } from 'vitest';
import type { Router } from '../router';
import { styleCraftDirection } from './brief';
import { directReel } from './director';
import { autoGraphicPlan, directGraphic, toGraphicPlan } from './graphic';

describe('reel.graphic (prompt-driven motion graphics)', () => {
  it('autoGraphicPlan builds valid full-frame graphicOnly plans for stats, comparisons, flows, and headlines', () => {
    const stat = autoGraphicPlan('Revenue grew $84K in Q4', 'mono', 5000);
    expect(stat.graphicOnly).toBe(true);
    expect(stat.captions).toBe(false);
    expect(stat.scenes[0]?.layout).toBe('full');
    expect(stat.scenes[0]?.content.template).toBe('counter');

    const cmp = autoGraphicPlan('Old Engine vs Reel Engine', 'cream', 4500);
    expect(cmp.scenes[0]?.content.template).toBe('compare');

    const flow = autoGraphicPlan('Step 1: Describe -> Generate -> Export', 'mono', 6000);
    expect(flow.scenes[0]?.content.template).toBe('flow');

    const headline = autoGraphicPlan('Launch day motion kit for video editors', 'cream', 4000);
    expect(headline.scenes[0]?.content.template).toBe('headline');
  });

  it('toGraphicPlan tiles multi-scene outputs with full layout and drops speaker-only templates', () => {
    const built = toGraphicPlan(
      {
        title: 'Q4 Growth',
        brands: [{ name: 'Stripe', domain: 'stripe.com' }],
        scenes: [
          {
            durationMs: 3000,
            bg: 'dark',
            tag: 'GROWTH',
            graphic: {
              template: 'chart',
              kind: 'bars',
              title: 'Quarterly Revenue',
              unit: 'K',
              items: [
                { word: 0, text: 'Q1', value: 12 },
                { word: 1, text: 'Q4', value: 84 },
              ],
            },
          },
          {
            durationMs: 2500,
            graphic: { template: 'none' }, // speaker-only -> dropped
          },
          {
            durationMs: 2500,
            graphic: {
              template: 'logo',
              brand: 'Stripe',
              sub: 'Payments',
            },
          },
        ],
      },
      'Q4 revenue bar chart and Stripe logo',
      'mono',
      'gemini-4-neon',
    );
    expect(built.title).toBe('Q4 Growth');
    expect(built.durationMs).toBe(5500);
    expect(built.plan.graphicOnly).toBe(true);
    expect(built.plan.captions).toBe(false);
    expect(built.plan.scenes).toHaveLength(2);
    expect(built.plan.scenes[0]).toMatchObject({ startMs: 0, endMs: 3000, layout: 'full', bg: 'dark' });
    expect(built.plan.scenes[1]).toMatchObject({ startMs: 3000, endMs: 5500, layout: 'full' });
  });

  it('directGraphic calls router and falls back cleanly when router is null or throws', async () => {
    const offline = await directGraphic(null, { prompt: '10x faster exports', look: 'mono' });
    expect(offline.source).toBe('auto');
    expect(offline.plan.graphicOnly).toBe(true);

    const router = {
      run: vi.fn(async () => ({
        output: {
          title: 'Fast Export',
          brands: [],
          scenes: [
            {
              durationMs: 4000,
              graphic: {
                template: 'counter',
                value: 10,
                suffix: 'x',
                label: 'Faster Exports',
              },
            },
          ],
        },
        ranOn: 'cloud',
        model: 'gemini-4-neon',
        latencyMs: 120,
        cached: false,
      })),
    } as unknown as Router;

    const cloud = await directGraphic(router, {
      prompt: '10x faster exports',
      look: 'mono',
      format: '16:9',
    });
    expect(cloud.source).toBe('cloud');
    expect(cloud.title).toBe('Fast Export');
    expect(cloud.durationMs).toBe(4000);
    expect(cloud.plan.scenes[0]?.content.template).toBe('counter');
  });

  it('toGraphicPlan v2 preserves custom scene blueprints, artDirection, and cutout visuals without truncating headlines', () => {
    const built = toGraphicPlan(
      {
        title: 'Inside the White House',
        brands: [],
        scenes: [
          {
            durationMs: 4500,
            mode: 'custom',
            bg: 'cream',
            tag: 'THE EXECUTIVE RESIDENCE',
            artDirection:
              'Layered Vox paper-collage hero: warm parchment wash + subtle grid, masking tape corners, architectural cutout m0 rising from bottom with drop shadow, kinetic display title with yellow highlighter sweep.',
            visuals: [
              {
                kind: 'illustration',
                query: 'The White House south portico neoclassical facade editorial cutout',
              },
            ],
            graphic: {
              template: 'headline',
              kicker: 'THE EXECUTIVE RESIDENCE',
              title: 'Inside the White House',
            },
          },
        ],
      },
      'design a vox style motion graphic about the white house',
      'cream',
      'gemini-4-neon',
    );
    expect(built.blueprints).toHaveLength(1);
    expect(built.blueprints[0]).toMatchObject({
      mode: 'custom',
      visuals: [
        {
          kind: 'illustration',
          query: 'The White House south portico neoclassical facade editorial cutout',
        },
      ],
    });
    expect(built.blueprints[0]?.artDirection).toContain('masking tape');
    expect(built.plan.scenes[0]?.content).toMatchObject({
      template: 'headline',
      kicker: 'THE EXECUTIVE RESIDENCE',
      title: 'Inside the White House',
    });
  });

  it('styleCraftDirection returns tailored craft rules for Vox/Paper Collage and Dark Tech styles', () => {
    const vox = styleCraftDirection({
      styleId: 'paper-collage',
      promptHint: 'vox style white house explainer',
    });
    expect(vox).toContain('VOX / PAPER-COLLAGE');
    expect(vox).toContain('mp-backdrop');

    const dark = styleCraftDirection({ styleId: 'creator-dark' });
    expect(dark).toContain('DARK STUDIO');
  });

  it('directReel with noVideo forces full-frame graphics and removes speaker-only scenes', async () => {
    const words = [
      { text: 'Here', startMs: 0, endMs: 400 },
      { text: 'are', startMs: 400, endMs: 700 },
      { text: 'three', startMs: 700, endMs: 1100 },
      { text: 'key', startMs: 1100, endMs: 1500 },
      { text: 'takeaways', startMs: 1500, endMs: 2200 },
      { text: 'today.', startMs: 2200, endMs: 2900 },
    ];
    const r = await directReel(null, {
      look: 'mono',
      words,
      durationMs: 3000,
      noVideo: true,
    });
    expect(r.plan.scenes.length).toBeGreaterThan(0);
    for (const s of r.plan.scenes) {
      expect(s.layout).toBe('full');
      expect(['none', 'punch', 'cta']).not.toContain(s.content.template);
    }
  });
});
