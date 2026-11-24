'use client';

import type { StockOverlayClip, StockOverlayLayout } from '@motionpop/schemas';
import { useEffect, useMemo, useRef, useState } from 'react';
import { appAudioStore } from '@/lib/audio/app-audio-store';
import { subscribePreviewSeek } from '@/lib/editor/preview-bridge';
import { editorStore, useEditor } from '@/lib/stores/editor';

const VIDEO_DRIFT_SEC = 0.16;

function layoutStyleFor(layout: StockOverlayLayout): {
  left: string;
  top: string;
  width: string;
  height: string;
  borderRadius: string;
  boxShadow: string;
  border: string;
} {
  switch (layout) {
    case 'full':
      return {
        left: '0%',
        top: '0%',
        width: '100%',
        height: '100%',
        borderRadius: '0px',
        boxShadow: 'none',
        border: 'none',
      };
    case 'top':
      return {
        left: '4%',
        top: '4%',
        width: '92%',
        height: '46%',
        borderRadius: '14px',
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.45)',
        border: '2px solid rgba(255, 255, 255, 0.2)',
      };
    case 'pip':
      return {
        left: '56%',
        top: '5%',
        width: '39%',
        height: '28%',
        borderRadius: '12px',
        boxShadow: '0 14px 32px rgba(0, 0, 0, 0.5)',
        border: '2px solid rgba(255, 255, 255, 0.28)',
      };
    case 'card':
    default:
      return {
        left: '7%',
        top: '14%',
        width: '86%',
        height: '52%',
        borderRadius: '16px',
        boxShadow: '0 22px 54px rgba(0, 0, 0, 0.52)',
        border: '2px solid rgba(255, 255, 255, 0.22)',
      };
  }
}

/**
 * Live 60 fps visual overlay renderer for the `Stock Media` timeline layer.
 * Mounted inside `PreviewPane` directly over BOTH `ReelPreview` and `PreviewPlayer`, so placed
 * Pixabay videos & photos appear reliably in preview regardless of project mode.
 */
export function StockOverlaysLayer() {
  const overlays = useEditor((s) => s.project?.stockOverlays);
  const playing = useEditor((s) => s.playing);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const badgeRef = useRef<HTMLSpanElement | null>(null);
  const activeUrlRef = useRef<string>('');

  const key = useMemo(() => (overlays ?? []).map((c) => `${c.id}:${c.src}`).join('|'), [overlays]);
  const [loaded, setLoaded] = useState<{ key: string; urls: Record<string, string> }>({
    key: '',
    urls: {},
  });
  const urls = useMemo(() => (key && loaded.key === key ? loaded.urls : {}), [key, loaded]);

  // Load placed stock video/photo blobs into object URLs for instant 60fps switching.
  useEffect(() => {
    const list = editorStore.getState().project?.stockOverlays ?? [];
    if (!key || list.length === 0) return;
    let cancelled = false;
    const created: string[] = [];
    void Promise.all(
      list.map(async (c) => {
        const blob = await appAudioStore()
          .get(c.src)
          .catch(() => null);
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        created.push(url);
        return [c.id, url] as const;
      }),
    ).then((entries) => {
      if (cancelled) {
        for (const u of created) URL.revokeObjectURL(u);
        return;
      }
      const next: Record<string, string> = {};
      for (const e of entries) if (e) next[e[0]] = e[1];
      setLoaded({ key, urls: next });
    });
    return () => {
      cancelled = true;
      for (const u of created) URL.revokeObjectURL(u);
    };
  }, [key]);

  // Keep `<video>` play/pause synchronized with editor playback.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || v.hidden || !v.src) return;
    if (playing) void v.play().catch(() => undefined);
    else v.pause();
  }, [playing]);

  // Update visible overlay frame-by-frame without React re-renders.
  useEffect(() => {
    const apply = (ms: number) => {
      const box = boxRef.current;
      const vid = videoRef.current;
      const img = imgRef.current;
      const badge = badgeRef.current;
      if (!box || !vid || !img) return;

      const list = editorStore.getState().project?.stockOverlays ?? [];
      // Newest overlapping clip wins if two overlap.
      let active: StockOverlayClip | undefined;
      for (let i = list.length - 1; i >= 0; i--) {
        const c = list[i];
        if (c && ms >= c.startMs && ms < c.endMs) {
          active = c;
          break;
        }
      }
      const url = active ? urls[active.id] : undefined;
      if (!active || !url) {
        box.style.visibility = 'hidden';
        box.style.opacity = '0';
        if (!vid.paused) vid.pause();
        return;
      }

      const geom = layoutStyleFor(active.layout);
      box.style.visibility = 'visible';
      box.style.opacity = '1';
      box.style.left = geom.left;
      box.style.top = geom.top;
      box.style.width = geom.width;
      box.style.height = geom.height;
      box.style.borderRadius = geom.borderRadius;
      box.style.boxShadow = geom.boxShadow;
      box.style.border = geom.border;

      if (badge) {
        badge.textContent = active.attribution ?? active.name;
      }

      const isVideo = active.kind === 'video' || active.mimeType.startsWith('video/');
      const progress = Math.max(
        0,
        Math.min(1, (ms - active.startMs) / Math.max(1, active.endMs - active.startMs)),
      );

      if (isVideo) {
        img.hidden = true;
        vid.hidden = false;
        if (activeUrlRef.current !== url) {
          activeUrlRef.current = url;
          vid.src = url;
        }
        const elapsedMs = Math.max(0, ms - active.startMs);
        const durMs = Math.max(1000, active.clipDurationMs ?? 8000);
        const targetSec = (elapsedMs % durMs) / 1000;
        const isPlaying = editorStore.getState().playing;
        if (vid.readyState >= 1) {
          if (!isPlaying || Math.abs(vid.currentTime - targetSec) > VIDEO_DRIFT_SEC) {
            vid.currentTime = targetSec;
          }
        }
        if (isPlaying && vid.paused) void vid.play().catch(() => undefined);
        else if (!isPlaying && !vid.paused) vid.pause();
      } else {
        vid.hidden = true;
        if (!vid.paused) vid.pause();
        img.hidden = false;
        if (img.src !== url) img.src = url;
        // Subtle Ken Burns drift so photos feel cinematic.
        const zoom = 1 + progress * 0.06;
        img.style.transform = `scale(${zoom.toFixed(4)})`;
      }
    };

    apply(editorStore.getState().playheadMs);
    return subscribePreviewSeek(apply);
  }, [urls, overlays]);

  if (!overlays || overlays.length === 0) return null;

  return (
    <div
      ref={boxRef}
      data-testid="stock-overlay-stage"
      className="pointer-events-none absolute z-[12] overflow-hidden bg-black/80 transition-[opacity] duration-150"
      style={{ visibility: 'hidden', opacity: 0 }}
    >
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        preload="auto"
        hidden
        className="size-full object-cover"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- local IndexedDB blob URL */}
      <img ref={imgRef} alt="" hidden className="size-full object-cover will-change-transform" />
      <span
        ref={badgeRef}
        className="absolute right-2 bottom-2 max-w-[75%] truncate rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] text-white/85 backdrop-blur-xs"
      />
    </div>
  );
}
