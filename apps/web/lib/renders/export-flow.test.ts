import { APP_CONFIG_DEFAULTS, type Slot } from '@motionpop/schemas';
import { bigNumberSlot, fixtureProject } from '@motionpop/motion/testing/project-fixture';
import { isRenderable } from '@motionpop/motion/compiler';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  exportOptionsState,
  leftOutNote,
  renderErrorMessage,
  RENDER_ERROR_COPY,
  secondsText,
  stageLine,
  startFailureMessage,
  viewOf,
  type ExportOptionsInput,
} from './export-flow';
import type { RenderView } from './render-client';

const baseProject = () => fixtureProject({ slots: [bigNumberSlot('s1', 0, 3000)] });

const view = (over: Partial<RenderView> = {}): RenderView => ({
  renderId: 'r1',
  status: 'queued',
  progress: 0,
  costCredits: 5,
  title: 'T',
  format: '16:9',
  resolution: '1080p',
  durationMs: 18_000,
  ...over,
});

const input = (over: Partial<ExportOptionsInput> = {}): ExportOptionsInput => ({
  project: baseProject(),
  options: { format: '16:9', resolution: '1080p', captions: false, music: false },
  config: APP_CONFIG_DEFAULTS,
  mode: 'cloud',
  balance: 120,
  online: true,
  isRenderable: (s: Slot, f) => isRenderable(s, f),
  ...over,
});

describe('viewOf', () => {
  it('maps the render status to a view', () => {
    expect(viewOf(false, null)).toBe('options');
    expect(viewOf(true, null)).toBe('starting');
    expect(viewOf(false, view({ status: 'queued' }))).toBe('progress');
    expect(viewOf(false, view({ status: 'rendering' }))).toBe('progress');
    expect(viewOf(false, view({ status: 'encoding' }))).toBe('progress');
    expect(viewOf(false, view({ status: 'done', progress: 100 }))).toBe('ready');
    expect(viewOf(false, view({ status: 'error', error: 'internal' }))).toBe('error');
  });
  it('a render wins over the starting flag', () => {
    expect(viewOf(true, view())).toBe('progress');
  });
});

describe('copy', () => {
  it('has a message for every render error code, and credits come back for each', () => {
    for (const [code, text] of Object.entries(RENDER_ERROR_COPY)) {
      expect(text, code).toMatch(/Your credits are back\.$/);
    }
  });
  it('drops the refund sentence for free (offline) renders', () => {
    expect(renderErrorMessage('render-failed', true)).toBe('Pip dropped a frame.');
    expect(renderErrorMessage(undefined, false)).toBe(RENDER_ERROR_COPY.internal);
  });
  it('says what each stage is', () => {
    expect(stageLine('queued')).toBe('Warming up…');
    expect(stageLine('rendering')).toBe('Rendering frames…');
    expect(stageLine('encoding')).toBe('Encoding…');
  });
  it('has copy for each API refusal', () => {
    expect(startFailureMessage({ ok: false, error: 'daily-limit' })).toBe(
      "That's today's exports. More tomorrow.",
    );
    expect(startFailureMessage({ ok: false, error: 'cost-changed' }, 3)).toContain('3 credits');
    expect(startFailureMessage({ ok: false, error: 'start-failed' })).toContain(
      'Nothing was charged',
    );
  });
  it('formats the left-out note and the seconds', () => {
    expect(leftOutNote(0)).toBeNull();
    expect(leftOutNote(1)).toBe("1 slot isn't ready and will be left out.");
    expect(leftOutNote(2)).toBe("2 slots aren't ready and will be left out.");
    expect(secondsText(18_000)).toBe('18 sec');
    expect(secondsText(100)).toBe('1 sec');
  });
});

describe('exportOptionsState', () => {
  it('prices 1080p at 5 and shows the balance', () => {
    const s = exportOptionsState(input());
    expect(s.cost).toBe(5);
    expect(s.canExport).toBe(true);
    expect(s.rightText).toEqual({ tone: 'muted', text: '120 available' });
    expect(s.blockNote).toBeNull();
  });
  it('720p costs 3', () => {
    const s = exportOptionsState(
      input({ options: { format: '16:9', resolution: '720p', captions: false, music: false } }),
    );
    expect(s.cost).toBe(3);
  });
  it('blocks when the balance is below the cost (R1.9)', () => {
    const s = exportOptionsState(input({ balance: 4 }));
    expect(s.canExport).toBe(false);
    expect(s.rightText).toEqual({
      tone: 'error',
      text: 'Not enough credits. Small edits stay free.',
    });
  });
  it('allows exactly the balance', () => {
    expect(exportOptionsState(input({ balance: 5 })).canExport).toBe(true);
  });
  it('blocks a video over the limit (R1.11)', () => {
    const p = baseProject();
    const s = exportOptionsState(
      input({ project: { ...p, durationMs: 200_000 }, config: APP_CONFIG_DEFAULTS }),
    );
    expect(s.canExport).toBe(false);
    expect(s.blockNote).toBe('Exports are up to 3 min for now.');
  });
  it('blocks a project with nothing to render (R1.8)', () => {
    const p = baseProject();
    const s = exportOptionsState(input({ project: { ...p, slots: [] } }));
    expect(s.canExport).toBe(false);
    expect(s.blockNote).toBe('Add a graphic first.');
  });
  it('blocks while offline with "Needs connection" (R1.12), but not in local mode', () => {
    const cloud = exportOptionsState(input({ online: false }));
    expect(cloud.canExport).toBe(false);
    expect(cloud.rightText.text).toBe('Needs connection');
    const local = exportOptionsState(input({ online: false, mode: 'offline', balance: null }));
    expect(local.canExport).toBe(true);
  });
  it('shows "Local render · free" and no cost in offline mode', () => {
    const s = exportOptionsState(input({ mode: 'offline', balance: null }));
    expect(s.cost).toBeNull();
    expect(s.rightText).toEqual({ tone: 'mint', text: 'Local render · free' });
  });
  it('blocks when exports are paused', () => {
    const s = exportOptionsState(
      input({ config: { ...APP_CONFIG_DEFAULTS, exportsEnabled: false } }),
    );
    expect(s.canExport).toBe(false);
    expect(s.blockNote).toContain('paused');
  });
  it('counts slots that will not render in this format as left out', () => {
    const p = baseProject();
    const s = exportOptionsState(
      input({
        project: {
          ...p,
          slots: [...p.slots, { ...bigNumberSlot('s2', 4000, 7000), status: 'suggested' as const }],
        },
      }),
    );
    expect(s.leftOut).toBe(1);
    expect(s.leftOutNote).not.toBeNull();
  });
  it('property: the cost shown is never negative and the button follows balance ≥ cost', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.constantFrom('720p', '1080p') as fc.Arbitrary<'720p' | '1080p'>,
        fc.integer({ min: 1_000, max: 170_000 }),
        (balance, resolution, durationMs) => {
          const p = baseProject();
          const s = exportOptionsState(
            input({
              balance,
              project: { ...p, durationMs },
              options: { format: '16:9', resolution, captions: false, music: false },
            }),
          );
          expect(s.cost).toBeGreaterThanOrEqual(0);
          if (s.cost !== null && s.renderable > 0) expect(s.canExport).toBe(balance >= s.cost);
        },
      ),
    );
  });
});
