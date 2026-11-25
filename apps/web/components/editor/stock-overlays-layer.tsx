'use client';

import {
  MAX_TIMELINE_LANES,
  resolvedMediaLanes,
  stockOverlayBoxFor,
  type StockOverlayClip,
  type StockOverlayLayout,
} from '@motionpop/schemas';
import { useEffect, useMemo, useRef, useState } from 'react';
import { appAudioStore } from '@/lib/audio/app-audio-store';
import { subscribePreviewSeek } from '@/lib/editor/preview-bridge';
import { editorStore, useEditor } from '@/lib/stores/editor';

const VIDEO_DRIFT_SEC = 0.16;
const LANE_SLOTS = Array.from({ length: MAX_TIMELINE_LANES }, (_, i) => i);

function layoutStyleFor(layout: StockOverlayLayout): {
  left: string;
  top: string;
  width: string;
  height: string;
  borderRadius: string;
  boxShadow: string;
  border: string;
} {
  const box = stockOverlayBoxFor(layout);
  const pct = (n: number) => `${(n * 100).toFixed(2).replace(/\.00$/, '')}%`;
  const isFull = layout === 'full';
  return {
    left: pct(box.x),
    top: pct(box.y),
    width: pct(box.w),
    height: pct(box.h),
    borderRadius: `${box.radiusPx}px`,
    boxShadow: isFull
      ? 'none'
      : layout === 'top'
        ? '0 16px 40px rgba(0, 0, 0, 0.45)'
        : layout === 'pip'
          ? '0 14px 32px rgba(0, 0, 0, 0.5)'
          : '0 22px 54px rgba(0, 0, 0, 0.52)',
    border: isFull
      ? 'none'
      : layout === 'pip'
        ? '2px solid rgba(255, 255, 255, 0.28)'
        : '2px solid rgba(255, 255, 255, 0.22)',
  };
}

/**
 * Live 60 fps multi-lane visual overlay renderer for the `Stock Media` timeline layers (spec 45).
 * Mounted inside `PreviewPane` directly over BOTH `ReelPreview` and `PreviewPlayer`, stacking
 * lanes 0..3 simultaneously in ascending z-order, skipping hidden lanes, and honoring each clip's
 * `sourceOffsetMs` for seamless split/trim playback.
 */
export function StockOverlaysLayer() {
  const overlays = useEditor((s) => s.project?.stockOverlays);
  const lanes = useEditor((s) => s.project?.stockMediaLanes);
  const playing = useEditor((s) => s.playing);

  const boxRefs = useRef<(HTMLDivElement | null)[]>([]);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const imgRefs = useRef<(HTMLImageElement | null)[]>([]);
  const badgeRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const pendingSeekSecRefs = useRef<number[]>(Array(MAX_TIMELINE_LANES).fill(0));

  // Key object URLs by unique `src` so splitting a clip never revokes/flickers the active video!
  const uniqueSrcs = useMemo(() => {
    const set = new Set<string>();
    for (const c of overlays ?? []) set.add(c.src);
    return [...set].sort();
  }, [overlays]);
  const srcKey = useMemo(() => uniqueSrcs.join('|'), [uniqueSrcs]);
  const [loaded, setLoaded] = useState<{ key: string; urls: Record<string, string> }>({
    key: '',
    urls: {},
  });
  const urlsBySrc = useMemo(
    () => (srcKey && loaded.key === srcKey ? loaded.urls : {}),
    [srcKey, loaded],
  );

  // Load unique placed stock video/photo blobs into object URLs for instant 60fps switching.
  useEffect(() => {
    const srcs = srcKey ? srcKey.split('|') : [];
    if (srcs.length === 0) return;
    let cancelled = false;
    const created: string[] = [];
    void Promise.all(
      srcs.map(async (src) => {
        const blob = await appAudioStore()
          .get(src)
          .catch(() => null);
        if (!blob || cancelled) return null;
        const url = URL.createObjectURL(blob);
        created.push(url);
        return [src, url] as const;
      }),
    ).then((entries) => {
      if (cancelled) {
        for (const u of created) URL.revokeObjectURL(u);
        return;
      }
      const next: Record<string, string> = {};
      for (const e of entries) if (e) next[e[0]] = e[1];
      setLoaded({ key: srcKey, urls: next });
    });
    return () => {
      cancelled = true;
      for (const u of created) URL.revokeObjectURL(u);
    };
  }, [srcKey]);

  // Keep every active `<video>` synchronized with editor play/pause.
  useEffect(() => {
    for (const v of videoRefs.current) {
      if (!v || v.hidden || !v.src) continue;
      if (playing) void v.play().catch(() => undefined);
      else v.pause();
    }
  }, [playing]);

  // Update all lanes frame-by-frame without React re-renders.
  useEffect(() => {
    const apply = (ms: number) => {
      const proj = editorStore.getState().project;
      const list = proj?.stockOverlays ?? [];
      const hiddenLanes = new Set(
        resolvedMediaLanes(proj ?? {})
          .filter((l) => l.hidden)
          .map((l) => l.index),
      );
      const isPlaying = editorStore.getState().playing;

      for (let laneIdx = 0; laneIdx < MAX_TIMELINE_LANES; laneIdx++) {
        const box = boxRefs.current[laneIdx];
        const vid = videoRefs.current[laneIdx];
        const img = imgRefs.current[laneIdx];
        const badge = badgeRefs.current[laneIdx];
        if (!box || !vid || !img) continue;

        let active: StockOverlayClip | undefined;
        if (!hiddenLanes.has(laneIdx)) {
          // Newest overlapping clip within this lane wins.
          for (let i = list.length - 1; i >= 0; i--) {
            const c = list[i];
            if (c && (c.track ?? 0) === laneIdx && ms >= c.startMs && ms < c.endMs) {
              active = c;
              break;
            }
          }
        }

        const url = active ? urlsBySrc[active.src] : undefined;
        if (!active || !url) {
          box.style.visibility = 'hidden';
          box.style.opacity = '0';
          if (!vid.paused) vid.pause();
          continue;
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
          if (vid.getAttribute('src') !== url) {
            vid.src = url;
          }
          const elapsedMs = (active.sourceOffsetMs ?? 0) + Math.max(0, ms - active.startMs);
          const realDurMs =
            Number.isFinite(vid.duration) && vid.duration > 0
              ? vid.duration * 1000
              : (active.clipDurationMs ?? 8000);
          const durMs = Math.max(250, realDurMs);
          const targetSec = (elapsedMs % durMs) / 1000;
          pendingSeekSecRefs.current[laneIdx] = targetSec;
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
      }
    };

    apply(editorStore.getState().playheadMs);
    return subscribePreviewSeek(apply);
  }, [urlsBySrc, overlays, lanes]);

  if (!overlays || overlays.length === 0) return null;

  return (
    <div data-testid="stock-overlay-stage" className="pointer-events-none absolute inset-0 z-[12]">
      {LANE_SLOTS.map((laneIdx) => (
        <div
          key={laneIdx}
          ref={(el) => {
            boxRefs.current[laneIdx] = el;
          }}
          data-testid={`stock-overlay-lane-${laneIdx}`}
          className="pointer-events-none absolute overflow-hidden bg-black/80 transition-[opacity] duration-150"
          style={{ visibility: 'hidden', opacity: 0, zIndex: laneIdx + 1 }}
        >
          <video
            ref={(el) => {
              videoRefs.current[laneIdx] = el;
            }}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              const target = pendingSeekSecRefs.current[laneIdx] ?? 0;
              if (Number.isFinite(v.duration) && v.duration > 0) {
                v.currentTime = target % v.duration;
              } else {
                v.currentTime = target;
              }
              if (editorStore.getState().playing && !v.hidden) {
                void v.play().catch(() => undefined);
              }
            }}
            muted
            loop
            playsInline
            preload="auto"
            hidden
            className="size-full object-cover"
          />
          {/* eslint-disable-next-line @next/next/no-img-element -- local IndexedDB blob URL */}
          <img
            ref={(el) => {
              imgRefs.current[laneIdx] = el;
            }}
            alt=""
            hidden
            className="size-full object-cover will-change-transform"
          />
          <span
            ref={(el) => {
              badgeRefs.current[laneIdx] = el;
            }}
            className="absolute right-2 bottom-2 max-w-[75%] truncate rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] text-white/85 backdrop-blur-xs"
          />
        </div>
      ))}
    </div>
  );
}
