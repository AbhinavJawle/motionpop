// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPanelBody } from '@/components/editor/audio-panel';
import { MediaPanelBody } from '@/components/editor/media-panel';
import { StockOverlaysLayer } from '@/components/editor/stock-overlays-layer';
import { addStockAudio, addStockOverlay } from '@/lib/commands';
import { projectArb } from '@/lib/commands/test-support';
import { PlaybackClock } from '@/lib/editor/playback';
import { editorStore } from '@/lib/stores/editor';
import { Timeline } from './timeline';

describe('Stock Media & Stock Audio timeline layers (React 19 + Zustand stability)', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete (Element.prototype as { animate?: unknown }).animate;
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(el: Element) {
          // Trigger one initial width measurement so TimeArea mounts all tracks including StockMediaTrack & StockAudioTrack.
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

  it('renders Timeline, StockMediaTrack, StockAudioTrack, and StockOverlaysLayer with undefined stock arrays without infinite loop errors', () => {
    const base = fc.sample(projectArb, 1)[0]!;
    delete base.stockOverlays;
    delete base.stockAudio;
    editorStore.getState().load(base);
    const clock = new PlaybackClock(editorStore);

    render(
      <>
        <StockOverlaysLayer />
        <Timeline clock={clock} peaks={null} bucketMs={100} />
      </>,
    );

    expect(screen.getByText('Stock Media')).toBeTruthy();
    expect(screen.getByText('Stock Audio')).toBeTruthy();
    expect(screen.getByText('Add Pixabay video / photo at playhead')).toBeTruthy();
    expect(screen.getByText('Add SFX / music at playhead')).toBeTruthy();
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    clock.dispose();
  });

  it('renders placed stock overlays and stock audio clips, cycles layout & deletes cleanly with zero console errors', () => {
    const base = fc.sample(projectArb, 1)[0]!;
    editorStore.getState().load(base);
    editorStore.getState().exec(
      addStockOverlay({
        id: 'ov-live-1',
        name: 'Coffee steam',
        src: 'idb:coffee-1',
        kind: 'video',
        mimeType: 'video/mp4',
        startMs: 0,
        endMs: 2000,
        clipDurationMs: 5000,
        layout: 'card',
        provider: 'pixabay',
        attribution: 'Pixabay · NickyPe',
      }),
    );
    editorStore.getState().exec(
      addStockAudio({
        id: 'sa-live-1',
        name: 'Woosh-1',
        src: 'idb:whoosh-1',
        kind: 'sfx',
        mimeType: 'audio/mpeg',
        startMs: 500,
        endMs: 1300,
        volume: 0.9,
        attribution: 'Woosh-1 (CC0)',
      }),
    );

    const clock = new PlaybackClock(editorStore);
    render(
      <>
        <StockOverlaysLayer />
        <Timeline clock={clock} peaks={null} bucketMs={100} />
      </>,
    );

    expect(screen.getByTestId('stock-overlay-clip-ov-live-1')).toBeTruthy();
    expect(screen.getByTestId('stock-audio-clip-sa-live-1')).toBeTruthy();
    expect(screen.getByTestId('stock-overlay-stage')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Remove Coffee steam'));
    expect(editorStore.getState().project?.stockOverlays).toBeUndefined();

    fireEvent.click(screen.getByLabelText('Remove Woosh-1'));
    expect(editorStore.getState().project?.stockAudio).toBeUndefined();
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    clock.dispose();
  });

  it('mounts MediaPanelBody and AudioPanelBody cleanly with zero console errors', () => {
    const base = fc.sample(projectArb, 1)[0]!;
    editorStore.getState().load(base);

    render(
      <>
        <MediaPanelBody />
        <AudioPanelBody />
      </>,
    );

    expect(screen.getByTestId('media-panel')).toBeTruthy();
    expect(screen.getByTestId('audio-panel')).toBeTruthy();
    expect(screen.getByTestId('audio-tab-search')).toBeTruthy();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('adds extra visual & audio lanes, toggles hide/mute, splits clips with sourceOffsetMs, and removes extra lanes cleanly', () => {
    const base = fc.sample(projectArb, 1)[0]!;
    base.durationMs = 8000;
    base.voiceover.durationMs = 8000;
    delete base.stockOverlays;
    delete base.stockAudio;
    editorStore.getState().load(base);
    editorStore.getState().exec(
      addStockOverlay({
        id: 'ov-split-1',
        name: 'Mountain Drone',
        src: 'idb:drone',
        kind: 'video',
        mimeType: 'video/mp4',
        startMs: 1000,
        endMs: 5000,
        clipDurationMs: 10_000,
        layout: 'card',
        provider: 'upload',
      }),
    );
    editorStore.getState().exec(
      addStockAudio({
        id: 'sa-split-1',
        name: 'Pulse Beat',
        src: 'idb:pulse',
        kind: 'music',
        mimeType: 'audio/mpeg',
        startMs: 0,
        endMs: 6000,
        volume: 0.3,
      }),
    );

    const clock = new PlaybackClock(editorStore);
    clock.seek(2500);
    render(
      <>
        <StockOverlaysLayer />
        <Timeline clock={clock} peaks={null} bucketMs={100} />
      </>,
    );

    // Add an extra Stock Media lane and Stock Audio lane
    fireEvent.click(screen.getByTestId('add-media-lane-btn'));
    fireEvent.click(screen.getByTestId('add-audio-lane-btn'));
    expect(screen.getByText('Media 2')).toBeTruthy();
    expect(screen.getByText('Audio 2')).toBeTruthy();

    // Hide lane 0 & mute lane 0
    fireEvent.click(screen.getByLabelText('Hide Stock Media'));
    expect(editorStore.getState().project?.stockMediaLanes?.[0]?.hidden).toBe(true);
    fireEvent.click(screen.getByLabelText('Show Stock Media'));

    fireEvent.click(screen.getByLabelText('Mute Stock Audio'));
    expect(editorStore.getState().project?.stockAudioLanes?.[0]?.muted).toBe(true);
    fireEvent.click(screen.getByLabelText('Unmute Stock Audio'));

    // Split stock overlay at playhead (2500ms) via the header Split button
    fireEvent.click(screen.getByTestId('timeline-split-btn'));
    const overlays = editorStore.getState().project?.stockOverlays ?? [];
    expect(overlays).toHaveLength(2);
    expect(overlays[0]).toMatchObject({ id: 'ov-split-1', startMs: 1000, endMs: 2500 });
    expect(overlays[1]).toMatchObject({ startMs: 2500, endMs: 5000, sourceOffsetMs: 1500 });

    // Select stock audio clip & split at 2500ms
    editorStore.getState().selectItem({ kind: 'stockAudio', id: 'sa-split-1' });
    fireEvent.click(screen.getByTestId('timeline-split-btn'));
    const audios = editorStore.getState().project?.stockAudio ?? [];
    expect(audios).toHaveLength(2);
    expect(audios[0]).toMatchObject({ id: 'sa-split-1', startMs: 0, endMs: 2500 });
    expect(audios[1]).toMatchObject({ startMs: 2500, endMs: 6000, sourceOffsetMs: 2500 });

    // Remove the extra lanes
    fireEvent.click(screen.getByLabelText('Remove Media 2 track'));
    fireEvent.click(screen.getByLabelText('Remove Audio 2 track'));
    expect(screen.queryByText('Media 2')).toBeNull();
    expect(screen.queryByText('Audio 2')).toBeNull();
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    clock.dispose();
  });

  it('splits the main video track into selectable segments and merges manual split seams cleanly', () => {
    const base = fc.sample(projectArb, 1)[0]!;
    base.durationMs = 8000;
    base.voiceover.durationMs = 8000;
    base.video = {
      src: 'idb:main-vid',
      width: 1080,
      height: 1920,
      originalDurationMs: 8000,
      cuts: [],
      punchIns: [],
      defaultOverlayAnchor: 'top-right',
    };
    delete base.stockOverlays;
    delete base.stockAudio;
    editorStore.getState().load(base);

    const clock = new PlaybackClock(editorStore);
    clock.seek(3000);
    render(<Timeline clock={clock} peaks={null} bucketMs={100} />);

    // Split main video at 3000ms
    fireEvent.click(screen.getByTestId('timeline-split-btn'));
    expect(editorStore.getState().project?.video?.splits).toEqual([3000]);
    expect(screen.getByTestId('video-segment-0')).toBeTruthy();
    expect(screen.getByTestId('video-segment-1')).toBeTruthy();

    // Selecting segment 1 exposes both Split and Cut controls; clicking Cut adds a manual VideoCut
    fireEvent.click(screen.getByTestId('video-segment-1'));
    expect(screen.getByLabelText('Cut video segment')).toBeTruthy();

    // Merge split seam back
    fireEvent.click(screen.getByLabelText('Merge video split at 3.0s'));
    expect(editorStore.getState().project?.video?.splits).toBeUndefined();
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    clock.dispose();
  });
});
