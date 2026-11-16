import { describe, expect, it } from 'vitest';
import { lookFor, componentFor, isScene, schemaFor, sceneFor } from '../registry';
import { editorialExplainer, fieldNotes, paperCollage } from '../styles';
import {
  bigNumberSlot,
  fixtureProject,
  statPunchSlot,
  FIXTURE_DURATION_MS,
} from '../testing/project-fixture';
import { isRenderable, projectCompileInput } from './project';

describe('registry (moved from apps/web, spec 08 task 4)', () => {
  it('finds components and scenes, and nothing for unknown or inherited names', () => {
    expect(componentFor('big-number')?.id).toBe('big-number');
    expect(componentFor('stat-punch')?.id).toBe('stat-punch');
    expect(isScene('stat-punch')).toBe(true);
    expect(isScene('big-number')).toBe(false);
    expect(sceneFor('stat-punch')?.id).toBe('stat-punch');
    expect(componentFor('toString')).toBeUndefined();
    expect(componentFor('__proto__')).toBeUndefined();
    expect(schemaFor('nope')).toBeUndefined();
    expect(schemaFor('big-number')).toBeDefined();
  });
});

describe('lookFor (spec 08 review F4)', () => {
  it('resolves a look, then a style pack, then the editorial explainer', () => {
    expect(lookFor('field-notes')).toBe(fieldNotes);
    expect(lookFor('paper-collage')).toBe(paperCollage);
    expect(lookFor('editorial-explainer')).toBe(editorialExplainer);
    expect(lookFor('no-such-style')).toBe(editorialExplainer);
    expect(lookFor('toString')).toBe(editorialExplainer);
    expect(lookFor('__proto__')).toBe(editorialExplainer);
  });
});

describe('isRenderable', () => {
  it('needs a ready slot, a known component and valid params', () => {
    const ok = bigNumberSlot('a', 0, 3000);
    expect(isRenderable(ok)).toBe(true);
    expect(isRenderable({ ...ok, status: 'suggested' })).toBe(false);
    expect(isRenderable({ ...ok, status: 'failed' })).toBe(false);
    expect(isRenderable({ ...ok, componentId: 'nope' })).toBe(false);
    expect(isRenderable({ ...ok, params: { value: 'forty' } })).toBe(false);
  });

  it('checks the format against the component, when one is given', () => {
    const ok = bigNumberSlot('a', 0, 3000);
    for (const f of ['16:9', '9:16', '1:1'] as const) {
      const supported = componentFor(ok.componentId)?.formats.includes(f) ?? false;
      expect(isRenderable(ok, f)).toBe(supported);
    }
  });

  it('leaves image slots out for now (review F5)', () => {
    const scene = statPunchSlot('s', 0, 4000);
    expect(isRenderable(scene)).toBe(true);
    const withImage = {
      ...scene,
      params: { ...scene.params, images: [{ id: 'img-1', url: 'blob:x' }] },
    };
    expect(isRenderable(withImage)).toBe(false);
  });
});

describe('projectCompileInput', () => {
  const project = fixtureProject({
    slots: [
      bigNumberSlot('a', 700, 3500),
      { ...bigNumberSlot('b', 4200, 7000), status: 'suggested' },
      statPunchSlot('c', 8400, 12600),
    ],
  });

  it('keeps ready slots only, and gives scenes the voice', () => {
    const input = projectCompileInput(project, { mode: 'preview' });
    expect(input.slots.map((s) => s.id)).toEqual(['a', 'c']);
    expect(input.slots[0]?.words).toBeUndefined();
    expect(input.slots[1]?.words?.length).toBeGreaterThan(0);
    expect(input.durationMs).toBe(FIXTURE_DURATION_MS);
    expect(input.style).toBe(editorialExplainer);
  });

  it('adds only what the caller asks for', () => {
    const preview = projectCompileInput(project, { mode: 'preview' });
    expect(preview.voiceSrc).toBeUndefined();
    expect(preview.background).toBeUndefined();
    const render = projectCompileInput(project, {
      mode: 'render',
      format: '9:16',
      background: 'style',
      voiceSrc: 'assets/voice.wav',
    });
    expect(render).toMatchObject({
      mode: 'render',
      format: '9:16',
      background: 'style',
      voiceSrc: 'assets/voice.wav',
    });
  });

  it('uses the project look for the preview and the render alike', () => {
    const p = fixtureProject({ styleId: 'field-notes', slots: [bigNumberSlot('a', 700, 3500)] });
    expect(projectCompileInput(p, { mode: 'preview' }).style).toBe(fieldNotes);
    expect(projectCompileInput(p, { mode: 'render' }).style).toBe(fieldNotes);
  });
});

describe('slot timing reaches the compile input (spec 09 task 8)', () => {
  it('carries timing for components and scenes, and leaves it out when unset', () => {
    const withTiming = { ...bigNumberSlot('a', 0, 3000), timing: { speed: 0.8, fade: false } };
    const scene = { ...statPunchSlot('b', 4000, 7000), timing: { ease: 'out' as const } };
    const plain = bigNumberSlot('c', 8000, 11000);
    const input = projectCompileInput(fixtureProject({ slots: [withTiming, scene, plain] }), {
      mode: 'render',
    });
    expect(input.slots.map((s) => s.timing)).toEqual([
      { speed: 0.8, fade: false },
      { ease: 'out' },
      undefined,
    ]);
    expect(input.slots[2]).not.toHaveProperty('timing');
    // A copy: later edits to the project's slot do not leak into the compile input.
    expect(input.slots[0]?.timing).not.toBe(withTiming.timing);
  });
});

describe('captions step aside under verbatim scenes (founder QA, 2026-11-16)', () => {
  it('drops the caption groups that overlap a hook-statement, keeps the rest', () => {
    const hook = {
      ...statPunchSlot('h', 700, 3500),
      componentId: 'hook-statement',
      params: { content: { line: 'A line on screen' }, beats: [], images: [] },
    };
    const withHook = fixtureProject({ slots: [hook] });
    const without = fixtureProject({ slots: [] });
    expect(isRenderable(hook)).toBe(true);
    const all = projectCompileInput(without, { mode: 'preview' }).captions?.groups ?? [];
    const kept = projectCompileInput(withHook, { mode: 'preview' }).captions?.groups ?? [];
    expect(all.length).toBeGreaterThan(kept.length);
    for (const g of kept) expect(g.openMs >= 3500 || g.closeMs <= 700).toBe(true);
  });
});
