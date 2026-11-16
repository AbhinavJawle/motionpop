import { describe, expect, it } from 'vitest';
import { createExportStore } from './export-store';
import type { RenderView } from './render-client';

const view = (status: RenderView['status'], progress = 0): RenderView => ({
  renderId: 'r1',
  status,
  progress,
  costCredits: 5,
  title: 'T',
  format: '16:9',
  resolution: '1080p',
  durationMs: 18_000,
});

describe('export store', () => {
  it('opens the options, then follows a render', () => {
    const s = createExportStore();
    s.getState().openFromButton();
    expect(s.getState().open).toBe(true);
    s.getState().beginStart();
    expect(s.getState().starting).toBe(true);
    s.getState().follow('r1', view('queued'));
    expect(s.getState()).toMatchObject({ starting: false, renderId: 'r1' });
    s.getState().applyView(view('rendering', 30));
    expect(s.getState().view?.progress).toBe(30);
  });

  it('closing during a render keeps it', () => {
    const s = createExportStore();
    s.getState().openFromButton();
    s.getState().follow('r1', view('rendering', 10));
    s.getState().close();
    expect(s.getState()).toMatchObject({ open: false, renderId: 'r1' });
    s.getState().openFromButton();
    expect(s.getState()).toMatchObject({ open: true, renderId: 'r1' });
  });

  it('closing a finished render forgets it, and the button starts fresh', () => {
    const s = createExportStore();
    s.getState().openFromButton();
    s.getState().follow('r1', view('done', 100));
    s.getState().close();
    expect(s.getState().renderId).toBeNull();
    s.getState().follow('r2', view('error'));
    s.getState().openFromButton();
    expect(s.getState()).toMatchObject({ renderId: null, view: null, open: true });
  });

  it('the Open toast shows the finished render as it is', () => {
    const s = createExportStore();
    s.getState().follow('r1', view('done', 100));
    s.getState().openAsIs();
    expect(s.getState()).toMatchObject({ open: true, renderId: 'r1' });
  });

  it('ignores a view of another render', () => {
    const s = createExportStore();
    s.getState().follow('r1', view('queued'));
    s.getState().applyView({ ...view('done', 100), renderId: 'r2' });
    expect(s.getState().view?.status).toBe('queued');
  });

  it('a refused start keeps the modal on the options with the message', () => {
    const s = createExportStore();
    s.getState().beginStart();
    s.getState().failStart('Not enough credits.');
    expect(s.getState()).toMatchObject({ starting: false, startError: 'Not enough credits.' });
    s.getState().setOptions({ format: '9:16', resolution: '720p', captions: false, music: false });
    expect(s.getState().startError).toBeNull();
  });
});
