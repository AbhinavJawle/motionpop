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
});
