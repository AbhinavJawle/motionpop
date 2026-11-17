import type { Slot } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { fixtureProject, fixtureWords } from '../testing/project-fixture';
import { compileProject } from './compile';
import { compileSlot, projectCompileInput } from './project';

const assets = {
  runtimeJs: '/*mp*/',
  hyperframesRuntimeJs: '/*hf*/',
  fonts: { Geist: 'AAAA', 'Geist Mono': 'BBBB' },
  textures: { grain: 'data:image/png;base64,AAAA', paper: 'data:image/png;base64,AAAA' },
};

/** A film beat as a custom slot: a script, its words, and a handover tail. */
function beatSlot(id: string, startMs: number, endMs: number, tailMs: number): Slot {
  return {
    id,
    startMs,
    endMs,
    wordStart: Math.floor(startMs / 700),
    wordEnd: Math.max(Math.floor(startMs / 700), Math.floor((endMs - 1) / 700)),
    reason: 'fixture',
    componentId: 'custom',
    skillId: 'film',
    prompt: 'a beat',
    params: {
      title: 'Beat',
      html: '<div class="hero">x</div>',
      css: '',
      script: 'return { seek() {} };',
      keyMomentMs: 0,
      brief: 'a beat',
      film: { tailMs, over: 'out', headMs: 0 },
    },
    status: 'ready',
    notes: [],
  } as Slot;
}

describe('compileSlot for a film beat', () => {
  it('keeps the tail and the word text of a custom slot', () => {
    const slot = beatSlot('film-1', 0, 4200, 500);
    const c = compileSlot(slot, fixtureProject().transcript);
    expect(c.tailMs).toBe(500);
    expect(c.over).toBe('out');
    expect(c.words?.length).toBeGreaterThan(0);
    expect(c.words?.[0]?.text).toBe(fixtureWords[0]?.text);
  });

  it('leaves out the tail when the beat has none', () => {
    const c = compileSlot(beatSlot('film-1', 0, 4200, 0), fixtureProject().transcript);
    expect(c.tailMs).toBeUndefined();
  });
});

describe('compileProject for a film', () => {
  it('lengthens a slot with a tail and gives it a stacking order', () => {
    const input = projectCompileInput(
      fixtureProject({ slots: [beatSlot('film-1', 0, 4200, 500)] }),
      { mode: 'preview' },
    );
    const html = compileProject(input, assets);
    expect(html).toContain('id="film-1"');
    expect(html).toContain('data-duration="4.7"');
    expect(html).toMatch(/id="film-1"[^>]*style="z-index:/);
  });

  it('adds the grain layer over the beats when the project is a film', () => {
    const project = fixtureProject({ slots: [beatSlot('film-1', 0, 4200, 500)] });
    const withFilm = compileProject(
      projectCompileInput({ ...project, film: storyboardFor(project) }, { mode: 'preview' }),
      assets,
    );
    expect(withFilm).toContain('mp-texture-top');
    expect(withFilm).toContain('"film":true');
  });
});

describe('projectCompileInput film flag', () => {
  it('is set only when the project has a film and a film slot', () => {
    const beats = fixtureProject({ slots: [beatSlot('film-1', 0, 4200, 0)] });
    const filmed = { ...beats, film: storyboardFor(beats) };
    expect(projectCompileInput(filmed, { mode: 'preview' }).film).toBe(true);
    // A film project with no film slot is an ordinary project.
    const none = fixtureProject({ slots: [] });
    expect(
      projectCompileInput({ ...none, film: storyboardFor(none) }, { mode: 'preview' }).film,
    ).toBeUndefined();
    // A film slot in a project without a film record is not flagged either.
    expect(projectCompileInput(beats, { mode: 'preview' }).film).toBeUndefined();
  });
});

/** A minimal film record (one beat, no props) for the flag tests. */
function storyboardFor(project: { format: '16:9' | '9:16' | '1:1' }) {
  void project;
  return {
    storyboard: {
      title: 'A film',
      thesis: 'One idea',
      world: 'A plain ground',
      carrier: 'a dot',
      props: [],
      beats: [
        {
          id: 'b1',
          wordStart: 0,
          wordEnd: 5,
          lead: 'picture' as const,
          idea: 'A plain picture for the beat',
          text: ['Beat'],
          landsOn: 0,
          staging: 'the picture arrives on the voice',
          seam: { kind: 'push' as const, note: 'the picture carries the cut' },
        },
      ],
    },
    props: {},
    madeAt: 1,
  };
}
