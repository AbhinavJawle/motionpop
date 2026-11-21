import { describe, expect, it } from 'vitest';
import { compileProject, type CompileAssets } from './compile';
import { projectCompileInput } from './project';
import { editorialExplainer } from '../styles';
import type { EditorProject } from '@motionpop/schemas';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const ASSETS: CompileAssets = {
  runtimeJs: '/* rt */',
  hyperframesRuntimeJs: '/* hf */',
  fonts: {
    Geist: 'AAAA',
    'Geist Mono': 'AAAA',
  },
  textures: { grain: TINY_PNG, paper: TINY_PNG },
};

function videoProject(): EditorProject {
  return {
    schemaVersion: 1,
    id: 'p-vid-1',
    title: 'Talking head',
    format: '16:9',
    fps: 30,
    styleId: 'editorial-explainer',
    durationMs: 10000,
    voiceover: { src: 'idb:voice', durationMs: 10000 },
    video: {
      src: 'idb:video',
      width: 1920,
      height: 1080,
      originalDurationMs: 12000,
      cuts: [],
      punchIns: [],
      defaultOverlayAnchor: 'top-right',
    },
    transcript: {
      language: 'en',
      ranOn: 'device',
      timingQuality: 'word',
      cleaned: true,
      words: [
        { i: 0, text: 'Revenue', startMs: 0, endMs: 400, filler: false, conf: 1 },
        { i: 1, text: 'grew', startMs: 450, endMs: 800, filler: false, conf: 1 },
        { i: 2, text: '40%', startMs: 850, endMs: 1300, filler: false, conf: 1 },
      ],
    },
    slots: [
      {
        id: 'slot-overlay',
        startMs: 500,
        endMs: 3500,
        wordStart: 0,
        wordEnd: 2,
        reason: 'stat',
        componentId: 'big-number',
        skillId: 'stat',
        prompt: '',
        params: { value: 40, suffix: '%', label: 'Revenue grew' },
        status: 'ready',
        notes: [],
        placement: 'overlay',
        overlayAnchor: 'side-right',
      },
      {
        id: 'slot-cutaway',
        startMs: 4000,
        endMs: 7000,
        wordStart: 0,
        wordEnd: 2,
        reason: 'big reveal',
        componentId: 'big-number',
        skillId: 'stat',
        prompt: '',
        params: { value: 40, suffix: '%', label: 'Full reveal' },
        status: 'ready',
        notes: [],
        placement: 'cutaway',
      },
    ],
    versions: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('compileProject (video overlay & cutaway mode)', () => {
  it('compiles video projects with transparent canvas, anchored overlays, and opaque cutaways', () => {
    const input = projectCompileInput(videoProject(), { mode: 'preview' });
    expect(input.hasVideo).toBe(true);
    expect(input.background).toBe('transparent');

    const html = compileProject({ ...input, style: editorialExplainer }, ASSETS);
    expect(html).toContain('background: transparent;');
    expect(html).toContain('<meta name="color-scheme" content="dark">');
    expect(html).toContain('html { color-scheme: dark; }');
    expect(html).not.toContain('<div class="mp-bg"></div>');
    expect(html).toContain('class="clip mp-slot mp-slot-overlay mp-anchor-side-right"');
    expect(html).toContain('class="clip mp-slot mp-slot-cutaway"');
    expect(html).toContain('<div class="mp-slot-bg"></div>');
  });

  it('compiles custom choreographed video beats full-canvas without scale(0.44) card wrappers', () => {
    const p = videoProject();
    p.slots = [
      {
        id: 'beat-split',
        startMs: 0,
        endMs: 4000,
        wordStart: 0,
        wordEnd: 2,
        reason: 'split beat',
        componentId: 'custom',
        skillId: 'film',
        prompt: 'Split-screen stat',
        params: {
          brief: 'Split-screen stat',
          title: 'Growth',
          html: '<div class="x">40%</div>',
          css: '.x { color: var(--ink); }',
          script: 'const tl = mp.timeline(); return tl;',
          keyMomentMs: 500,
        },
        status: 'ready',
        notes: [],
        videoStage: 'split-left',
      },
      {
        id: 'beat-cut',
        startMs: 4000,
        endMs: 8000,
        wordStart: 0,
        wordEnd: 2,
        reason: 'cutaway beat',
        componentId: 'custom',
        skillId: 'film',
        prompt: 'Full cutaway',
        params: {
          brief: 'Full cutaway',
          title: 'Cutaway',
          html: '<div class="x">40%</div>',
          css: '.x { color: var(--ink); }',
          script: 'const tl = mp.timeline(); return tl;',
          keyMomentMs: 500,
        },
        status: 'ready',
        notes: [],
        videoStage: 'cutaway',
      },
    ];
    const input = projectCompileInput(p, { mode: 'preview' });
    const html = compileProject({ ...input, style: editorialExplainer }, ASSETS);
    expect(html).toContain('id="beat-split" class="clip mp-slot mp-slot-choreo"');
    expect(html).not.toContain('id="beat-split" class="clip mp-slot mp-slot-overlay');
    expect(html).toContain('id="beat-cut" class="clip mp-slot mp-slot-cutaway mp-slot-choreo"');
  });

  it('physically clips split-top-stage (top 50%) and top-card (top 28%) on 9:16 Reels (spec 24)', () => {
    const p = videoProject();
    p.format = '9:16';
    p.slots = [
      {
        id: 'beat-top',
        startMs: 0,
        endMs: 3000,
        wordStart: 0,
        wordEnd: 2,
        reason: 'split beat',
        componentId: 'custom',
        skillId: 'film',
        prompt: 'Split inspector',
        params: {
          brief: 'Split inspector',
          title: 'Inspector',
          html: '<div class="x">Timing</div>',
          css: '.x { color: var(--ink); }',
          script: 'const tl = mp.timeline(); return tl;',
          keyMomentMs: 400,
        },
        status: 'ready',
        notes: [],
        videoStage: 'split-top-stage',
      },
      {
        id: 'beat-card',
        startMs: 3000,
        endMs: 6000,
        wordStart: 0,
        wordEnd: 2,
        reason: 'top card',
        componentId: 'custom',
        skillId: 'film',
        prompt: 'Top pill',
        params: {
          brief: 'Top pill',
          title: 'Pill',
          html: '<div class="x">Zero friction</div>',
          css: '.x { color: #fff; }',
          script: 'const tl = mp.timeline(); return tl;',
          keyMomentMs: 400,
        },
        status: 'ready',
        notes: [],
        videoStage: 'top-card',
      },
    ];
    const input = projectCompileInput(p, { mode: 'preview' });
    const html = compileProject({ ...input, style: editorialExplainer }, ASSETS);
    expect(html).toContain('id="beat-top" class="clip mp-slot mp-slot-choreo mp-slot-top-stage"');
    expect(html).toContain('id="beat-card" class="clip mp-slot mp-slot-choreo mp-slot-top-card"');
    expect(html).toContain('.mp-slot-top-stage > .mp-cam { top: 0; left: 0; right: 0; bottom: auto; height: 50%; overflow: hidden;');
    expect(html).toContain('.mp-slot-top-card > .mp-cam { top: 0; left: 0; right: 0; bottom: auto; height: 28%; overflow: hidden;');
  });
});
