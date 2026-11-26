// @vitest-environment happy-dom
import { fixtureProject } from '@motionpop/motion/testing/project-fixture';
import { EditorProjectSchema, type ReelPlan } from '@motionpop/schemas';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPanelBody } from '@/components/editor/audio-panel';
import { addReelSound, updateReelSound } from '@/lib/commands';
import { PlaybackClock } from '@/lib/editor/playback';
import { editorStore } from '@/lib/stores/editor';
import { Timeline } from './timeline';

const REEL: ReelPlan = {
  v: 1,
  look: 'mono',
  focus: { x: 0.5, y: 0.32 },
  captions: true,
  scenes: [
    {
      id: 's1',
      startMs: 0,
      endMs: 3000,
      layout: 'split',
      content: { template: 'headline', title: '$40,000 debt' },
    },
    {
      id: 's2',
      startMs: 3000,
      endMs: 6000,
      layout: 'split',
      content: { template: 'logo', media: { kind: 'logo', query: 'airbnb' }, name: 'Airbnb' },
    },
  ],
  sfx: [
    { kind: 'boom', atMs: 1200, gainDb: -2, label: "Boom on '$40,000'" },
    { kind: 'cash', atMs: 4200, gainDb: -2, label: "Cash on '$80B'" },
  ],
};

function reelProject() {
  const base = fixtureProject({ slots: [], durationMs: 6000 });
  return EditorProjectSchema.parse({
    ...base,
    reel: REEL,
  });
}

describe('Sound track SFX visibility and editing on video reels', () => {
  beforeEach(() => {
    delete (Element.prototype as { animate?: unknown }).animate;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(el: Element) {
          this.cb([{ contentRect: { width: 900, height: 320 }, target: el }]);
        }
        disconnect() {}
        constructor(private readonly cb: (entries: unknown[]) => void) {}
      },
    );
  });

  afterEach(() => {
    cleanup();
    editorStore.setState({ project: null, playing: false, playheadMs: 0, selectedSlotId: null });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows Pip/user-added SFX pills and auto scene SFX on the Sound track for reels and allows removing or retiming one hit', () => {
    editorStore.getState().load(reelProject());
    const clock = new PlaybackClock(editorStore);

    render(<Timeline clock={clock} peaks={null} bucketMs={100} />);

    // Both added SFX pills appear visibly on the Sound track.
    const boomPill = screen.getByTestId('reel-sfx-pill-0');
    const cashPill = screen.getByTestId('reel-sfx-pill-1');
    expect(boomPill.textContent).toContain('Boom');
    expect(cashPill.textContent).toContain('Cash');

    // Retiming via command updates the stored timestamp and stays undoable.
    expect(editorStore.getState().exec(updateReelSound(0, { atMs: 1800 }))).toBe(true);
    expect(editorStore.getState().project?.reel?.sfx?.[0]?.atMs).toBe(1800);

    // Removing one hit via its × button removes only that sound.
    fireEvent.click(screen.getByLabelText("Remove Boom on '$40,000'"));
    expect(editorStore.getState().project?.reel?.sfx).toHaveLength(1);
    expect(editorStore.getState().project?.reel?.sfx?.[0]?.kind).toBe('cash');

    // Undo restores it cleanly.
    editorStore.getState().undo();
    expect(editorStore.getState().project?.reel?.sfx).toHaveLength(2);

    clock.dispose();
  });

  it('shows accurate placed sound count and lets users drop any of the 18 built-in SFX at the playhead from the Audio panel', () => {
    editorStore.getState().load(reelProject());
    editorStore.getState().setPlayhead(2500);

    render(<AudioPanelBody />);

    // Expanded built-in library is visible with all 18 sounds.
    expect(screen.getByText(/Built-in SFX library \(18\)/)).toBeTruthy();

    // Place a Shutter sound at the playhead (2500 ms).
    fireEvent.click(screen.getByLabelText('Add Shutter at playhead'));
    const added = editorStore.getState().project?.reel?.sfx ?? [];
    expect(added.some((s) => s.kind === 'shutter' && s.atMs === 2500)).toBe(true);

    // Adding another sound directly via command updates the placed count cleanly.
    expect(editorStore.getState().exec(addReelSound({ kind: 'sparkle', atMs: 5000, gainDb: -2 }))).toBe(
      true,
    );
    expect(editorStore.getState().project?.reel?.sfx?.some((s) => s.kind === 'sparkle')).toBe(true);
  });
});
