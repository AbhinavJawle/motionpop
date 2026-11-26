import { builtInSkills } from '@motionpop/ai';
import { fixtureProject } from '@motionpop/motion/testing/project-fixture';
import {
  EditorProjectSchema,
  ReelPlanSchema,
  ReelCaptionStyleSchema,
  type EditorProject,
  type ReelPlan,
} from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { defaultEdit } from '@/lib/configure/defaults';
import { CommandRejected } from './command';
import {
  appendReelScenes,
  deleteReelScene,
  resizeReelSceneBoundary,
  setReel,
  setReelCaptionStyle,
  setReelCaptions,
  setReelLook,
  setReelSceneClip,
  setReelStyle,
  updateReelClipScene,
} from './reel';

const plan: ReelPlan = {
  v: 1,
  look: 'mono',
  focus: { x: 0.5, y: 0.32 },
  captions: true,
  scenes: [
    {
      id: 'r1',
      startMs: 0,
      endMs: 3000,
      layout: 'split',
      bg: 'light',
      content: { template: 'headline', title: 'Hello' },
    },
    { id: 'r2', startMs: 3000, endMs: 6000, layout: 'speaker', content: { template: 'none' } },
  ],
};

function project(withReel = true): EditorProject {
  return EditorProjectSchema.parse({
    ...fixtureProject({ slots: [], durationMs: 6000 }),
    ...(withReel ? { reel: plan } : {}),
  });
}

describe('reel commands (spec 25)', () => {
  it('switches the look with layouts following, and undoes exactly', () => {
    const p = project();
    const cmd = setReelLook('cream');
    const next = cmd.do(p);
    expect(next.reel?.look).toBe('cream');
    expect(next.reel?.scenes[0]?.layout).toBe('card');
    expect(next.reel?.scenes[1]?.layout).toBe('speaker');
    expect(cmd.undo(next)).toEqual(p);
  });

  it('toggles captions and replaces the plan, each one undo step', () => {
    const p = project();
    const off = setReelCaptions(false);
    const a = off.do(p);
    expect(a.reel?.captions).toBe(false);
    expect(off.undo(a)).toEqual(p);
    const replace = setReel({ ...plan, hook: 'New hook' });
    const b = replace.do(p);
    expect(b.reel?.hook).toBe('New hook');
    expect(replace.undo(b)).toEqual(p);
  });

  it('rejects projects without a reel and invalid plans', () => {
    expect(() => setReelLook('cream').do(project(false))).toThrow(CommandRejected);
    expect(() => setReel({ ...plan, scenes: [] }).do(project())).toThrow(CommandRejected);
  });
});

describe('reel style commands (spec 39 R5.6)', () => {
  const styles = builtInSkills.recipes().flatMap((r) => r.styles);
  const withEdit = (): EditorProject =>
    EditorProjectSchema.parse({ ...project(), edit: defaultEdit('video') });
  const change = (st: (typeof styles)[number]) =>
    setReelStyle({ look: st.look, theme: st.theme, captionStyle: st.captionStyle, styleId: st.id });

  it('sets look, theme, caption style and project.edit in one step, and undoes exactly', () => {
    const p = withEdit();
    const st = styles.find((x) => x.id === 'flame-punch')!;
    const cmd = change(st);
    const next = cmd.do(p);
    expect(next.reel?.look).toBe(st.look);
    expect(next.reel?.theme).toEqual(st.theme);
    expect(next.reel?.captionStyle).toBe(st.captionStyle);
    expect(next.edit?.styleId).toBe('flame-punch');
    expect(next.edit?.captions.style).toBe(st.captionStyle);
    expect(ReelPlanSchema.safeParse(next.reel).success).toBe(true);
    expect(cmd.undo(next)).toEqual(p);
  });

  it('removes the theme when the style has none, and restores it on undo', () => {
    const themed = styles.find((x) => x.theme)!;
    const plain = styles.find((x) => !x.theme)!;
    const p = change(themed).do(withEdit());
    expect(p.reel?.theme).toBeDefined();
    const cmd = change(plain);
    const next = cmd.do(p);
    expect(next.reel && 'theme' in next.reel).toBe(false);
    expect(cmd.undo(next)).toEqual(p);
  });

  it('follows the look for layouts (cream turns split into card)', () => {
    const cream = styles.find((x) => x.look === 'cream')!;
    const next = change(cream).do(withEdit());
    expect(next.reel?.scenes[0]?.layout).toBe('card');
  });

  it('works on a reel with no project.edit and leaves edit absent', () => {
    const p = project();
    const cmd = change(styles[0]!);
    const next = cmd.do(p);
    expect(next.edit).toBeUndefined();
    expect(cmd.undo(next)).toEqual(p);
  });

  it('changes only the caption style with setReelCaptionStyle', () => {
    const p = withEdit();
    const cmd = setReelCaptionStyle('boxed');
    const next = cmd.do(p);
    expect(next.reel?.captionStyle).toBe('boxed');
    expect(next.edit?.captions.style).toBe('boxed');
    expect(next.edit?.styleId).toBe(p.edit?.styleId);
    expect(next.reel?.look).toBe(p.reel?.look);
    expect(cmd.undo(next)).toEqual(p);
  });

  it('rejects a project without a reel', () => {
    expect(() => change(styles[0]!).do(project(false))).toThrow(CommandRejected);
    expect(() => setReelCaptionStyle('pop').do(project(false))).toThrow(CommandRejected);
  });

  it('property: do then undo restores the project exactly, after any starting style', () => {
    const style = fc.constantFrom(...styles);
    const caption = fc.constantFrom(...ReelCaptionStyleSchema.options);
    fc.assert(
      fc.property(fc.boolean(), style, style, caption, (hasEdit, first, second, cap) => {
        const base = hasEdit ? withEdit() : project();
        const start = change(first).do(base);
        const style2 = change(second);
        const a = style2.do(start);
        expect(style2.undo(a)).toEqual(start);
        const capCmd = setReelCaptionStyle(cap);
        const b = capCmd.do(a);
        expect(ReelPlanSchema.safeParse(b.reel).success).toBe(true);
        expect(capCmd.undo(b)).toEqual(a);
      }),
      { numRuns: 60 },
    );
  });
});

describe('reel scene slot commands (resize, delete, append)', () => {
  it('resizes adjacent scene boundaries cleanly and undoes', () => {
    const p = project();
    const cmd = resizeReelSceneBoundary('r1', 4200);
    const next = cmd.do(p);
    expect(next.reel?.scenes[0]?.endMs).toBe(4200);
    expect(next.reel?.scenes[1]?.startMs).toBe(4200);
    expect(cmd.undo(next)).toEqual(p);
  });

  it('deletes a scene slot, re-tiles neighbors, and refuses deleting the last scene', () => {
    const p = project();
    const cmd = deleteReelScene('r1');
    const next = cmd.do(p);
    expect(next.reel?.scenes).toHaveLength(1);
    expect(next.reel?.scenes[0]).toMatchObject({ id: 'r2', startMs: 0, endMs: 6000 });
    expect(() => deleteReelScene('r2').do(next)).toThrow(CommandRejected);
    expect(cmd.undo(next)).toEqual(p);
  });

  it('appends new graphic scene slots, extends durationMs, and undoes', () => {
    const p = project();
    const cmd = appendReelScenes([
      {
        id: 'g1',
        startMs: 0,
        endMs: 3500,
        layout: 'full',
        content: { template: 'headline', title: 'Next beat' },
      },
    ]);
    const next = cmd.do(p);
    expect(next.reel?.scenes).toHaveLength(3);
    expect(next.durationMs).toBe(9500);
    expect(next.reel?.scenes[2]).toMatchObject({ startMs: 6000, endMs: 9500, layout: 'full' });
    expect(cmd.undo(next)).toEqual(p);
  });

  it('binds, updates, clears, and undoes native Media Bin clip scenes on a reel (spec 48)', () => {
    const base = project();
    const withMedia: EditorProject = {
      ...base,
      video: {
        src: 'idb:vid',
        width: 1080,
        height: 1920,
        originalDurationMs: 6000,
        cuts: [],
        punchIns: [],
        defaultOverlayAnchor: 'top-right',
      },
      mediaBin: [
        {
          id: 'clip-screen',
          name: 'app-walkthrough.mp4',
          src: 'idb:clip-screen',
          kind: 'screen-recording',
          mimeType: 'video/mp4',
          width: 1920,
          height: 1080,
          durationMs: 14_000,
          moments: [
            {
              startMs: 2500,
              endMs: 6500,
              focusX: 0.72,
              focusY: 0.28,
              zoom: 1.6,
              description: 'Pricing chart click',
            },
          ],
        },
      ],
    };

    const bind = setReelSceneClip('r1', 'clip-screen');
    const bound = bind.do(withMedia);
    expect(bound.reel?.scenes[0]?.layout).toBe('pip');
    expect(bound.reel?.scenes[0]?.content).toMatchObject({
      template: 'clip',
      clipId: 'clip-screen',
      fit: 'screen-window',
      clipStartMs: 2500,
      focusX: 0.72,
      focusY: 0.28,
      zoom: 1.6,
      audioMode: 'mute',
    });
    expect(bind.undo(bound)).toEqual(withMedia);

    const upd = updateReelClipScene('r1', {
      layout: 'full',
      fit: 'cover',
      zoom: 1.9,
      audioMode: 'duck',
      clipStartMs: 4000,
    });
    const updated = upd.do(bound);
    expect(updated.reel?.scenes[0]?.layout).toBe('full');
    expect(updated.reel?.scenes[0]?.content).toMatchObject({
      template: 'clip',
      fit: 'cover',
      zoom: 1.9,
      audioMode: 'duck',
      clipStartMs: 4000,
    });
    expect(upd.undo(updated)).toEqual(bound);

    const clear = setReelSceneClip('r1', null);
    const cleared = clear.do(updated);
    expect(cleared.reel?.scenes[0]?.layout).toBe('speaker');
    expect(cleared.reel?.scenes[0]?.content).toEqual({ template: 'none' });
    expect(clear.undo(cleared)).toEqual(updated);
  });
});
