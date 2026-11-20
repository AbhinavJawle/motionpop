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
    expect(html).not.toContain('<div class="mp-bg"></div>');
    expect(html).toContain('class="clip mp-slot mp-slot-overlay mp-anchor-side-right"');
    expect(html).toContain('class="clip mp-slot mp-slot-cutaway"');
    expect(html).toContain('<div class="mp-slot-bg"></div>');
  });
});
