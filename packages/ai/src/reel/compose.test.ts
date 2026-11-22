import { lintCustom, REEL_STAGE_EXAMPLES } from '@motionpop/motion';
import { ReelSceneSchema, type ReelScene } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import {
  applyReelCompose,
  checkReelCompose,
  reelComposePromptV1,
  reelComposeTask,
  ReelComposeOutputSchema,
  type ReelComposeInput,
  type ReelComposeOutput,
} from './compose';

const input = (o: Partial<ReelComposeInput> = {}): ReelComposeInput => ({
  note: 'i dont like this its boring make it snappier and use better symbols and animations',
  brief: 'Rebuild the three tools as a snappy row of icon tiles, each landing on its word.',
  look: 'mono',
  layout: 'split',
  area: { w: 720, h: 640 },
  palette: { bg: '#FFFFFF', ink: '#0A0A0A', muted: '#6B6B6B', accent: '#0A0A0A', link: '#2B59FF' },
  durationMs: 3000,
  words: [
    { text: 'three', startMs: 200 },
    { text: 'tools', startMs: 500 },
  ],
  current: { kind: 'template', graphic: { template: 'list', title: 'Tools', items: [] } },
  pictures: [{ id: 'm0', shows: 'the Acme logo' }],
  example: REEL_STAGE_EXAMPLES['split-inspector'],
  ...o,
});

const out = (o: Partial<ReelComposeOutput> = {}): ReelComposeOutput =>
  ReelComposeOutputSchema.parse({
    title: 'Three tools',
    brief: 'Three icon tiles land on the words.',
    html: '<div class="row"><div class="tile">Edit</div></div>',
    css: '.row { display: flex; } .tile { font-size: calc(var(--u) * 4); }',
    script:
      'const tl = mp.timeline();\ntl.from(".tile", { scale: 0.6, opacity: 0 }, { on: "tools", dur: 260, ease: "back" });\nreturn tl;',
    keyMomentMs: 500,
    message: 'Made it snappier.',
    ...o,
  });

const scene = (o: Partial<ReelScene> = {}): ReelScene =>
  ReelSceneSchema.parse({
    id: 'r3',
    startMs: 1000,
    endMs: 4000,
    layout: 'split',
    tag: 'MY STACK',
    carry: true,
    notes: [
      {
        id: 'n1',
        tMs: 300,
        shape: { kind: 'circle', points: [0.5, 0.2, 0.3, 0.06] },
        text: 'boring',
        status: 'open',
      },
    ],
    content: { template: 'headline', title: 'Tools' },
    ...o,
  });

describe('reel.compose (spec 30)', () => {
  it('runs on the strong cloud model at the custom price', () => {
    const t = reelComposeTask(lintCustom, 'KIT');
    expect(t.mode(input(), {} as never)).toBe('ONLY_IN_CLOUD');
    expect(
      t.model({
        modelStrong: 'strong',
        modelFast: 'fast',
        modelFilmBuild: 'b',
        routingOverrides: {},
        routingSlotsDetectDeviceMaxWords: 400,
        killSwitch: false,
      }),
    ).toBe('strong');
    expect(t.cloudCost(input())).toBe(3);
    expect(
      t.cloudCost(input({ fix: { html: '', css: '', script: 'return tl;', problems: 'x' } })),
    ).toBe(0);
    expect(t.system).toContain('KIT');
  });

  it('never accepts picture ids past the 8 a scene can hold (spec 30 review)', () => {
    const eight = Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, shows: `picture ${i}` }));
    const asks = out({
      script: 'mp.image("m8", {}); return tl;',
      newPictures: [{ kind: 'photo', query: 'a desk' }],
    });
    expect(checkReelCompose(asks, input({ pictures: eight }), lintCustom)).toMatch(/m8/);
    expect(
      checkReelCompose(
        out({ script: 'mp.image("m7", {}); return tl;' }),
        input({ pictures: eight }),
        lintCustom,
      ),
    ).toBeNull();
  });

  it('accepts clean kit code and sends every problem back', () => {
    const lint = (p: { html: string; css: string; script: string }) => lintCustom(p);
    expect(checkReelCompose(out(), input(), lint)).toBeNull();
    expect(
      checkReelCompose(out({ script: 'const r = Math.random(); return tl;' }), input(), lint),
    ).toMatch(/randomness/);
    expect(checkReelCompose(out({ keyMomentMs: 9000 }), input(), lint)).toMatch(/after the scene/);
    expect(checkReelCompose(out({ css: '.a { transition: all 1s; }' }), input(), lint)).toMatch(
      /transition/,
    );
    // Pictures: listed ids and the ones it asked for, nothing else.
    expect(
      checkReelCompose(out({ script: 'mp.image("m0", {}); return tl;' }), input(), lint),
    ).toBeNull();
    expect(
      checkReelCompose(out({ script: 'mp.image("m1", {}); return tl;' }), input(), lint),
    ).toMatch(/m1/);
    expect(
      checkReelCompose(
        out({
          script: 'mp.image("m1", {}); return tl;',
          newPictures: [{ kind: 'illustration', query: 'a rocket' }],
        }),
        input(),
        lint,
      ),
    ).toBeNull();
    // The reel painted the panel already.
    expect(checkReelCompose(out({ script: 'mp.stage({}); return tl;' }), input(), lint)).toMatch(
      /already painted/,
    );
    expect(
      checkReelCompose(
        out({ script: 'mp.stage({}); return tl;' }),
        input({ layout: 'speaker' }),
        lint,
      ),
    ).toBeNull();
  });

  it('tells the writer the note, the area, what is on screen and the repair', () => {
    const p = reelComposePromptV1(
      input({
        fix: { html: '<b>x</b>', css: '', script: 'return tl;', problems: '- runs off the edge' },
      }),
    );
    expect(p).toContain(`CREATOR'S NOTE: "i dont like this its boring`);
    expect(p).toContain('W 720 × H 640');
    expect(p).toContain('0:three@200 1:tools@500');
    expect(p).toContain('m0 = the Acme logo');
    expect(p).toContain('"list" template');
    expect(p).toContain('- runs off the edge');
    const revise = reelComposePromptV1(
      input({
        current: {
          kind: 'custom',
          title: 'Old',
          brief: 'An old one.',
          html: '<i>o</i>',
          css: '',
          script: 'return tl;',
        },
      }),
    );
    expect(revise).toContain('the graphic you wrote before, "Old"');
    expect(revise).toContain('<i>o</i>');
  });

  it('puts the graphic on the scene: same id, times and notes, pictures kept then requested', () => {
    const logo = { kind: 'logo' as const, query: 'Acme|acme.example', asset: 'img1' };
    const next = applyReelCompose(
      scene(),
      'mono',
      out({ newPictures: [{ kind: 'photo', query: 'a desk' }], keyMomentMs: 2900 }),
      [logo],
    );
    expect(next).toMatchObject({
      id: 'r3',
      startMs: 1000,
      endMs: 4000,
      layout: 'split',
      tag: 'MY STACK',
    });
    expect(next.notes).toHaveLength(1);
    expect(next.carry).toBeUndefined();
    expect(next.content).toMatchObject({
      template: 'custom',
      title: 'Three tools',
      keyMomentMs: 2900,
      media: [logo, { kind: 'photo', query: 'a desk' }],
    });
    // Layouts follow the look.
    expect(applyReelCompose(scene({ layout: 'card' }), 'mono', out(), []).layout).toBe('split');
    expect(applyReelCompose(scene({ layout: 'split' }), 'cream', out(), []).layout).toBe('card');
    expect(applyReelCompose(scene(), 'mono', out(), []).content).not.toHaveProperty('media');
  });
});
