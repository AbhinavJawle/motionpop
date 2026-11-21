'use client';

import { mountReel, REEL_STAGE_W, type ReelHandle } from '@motionpop/motion/reel';
import { cleanedToSourceMs, keptSourceSegments } from '@motionpop/schemas';
import { useEffect, useMemo, useRef, useState } from 'react';
import { appAudioStore } from '@/lib/audio/app-audio-store';
import { subscribePreviewSeek } from '@/lib/editor/preview-bridge';
import { editorStore, useEditor } from '@/lib/stores/editor';

const VIDEO_DRIFT_SEC = 0.12;
let fontsLink: Promise<void> | null = null;

/** Loads the reel fonts stylesheet once per page (the engine waits for the faces itself). */
function ensureReelFonts(): Promise<void> {
  fontsLink ??= new Promise<void>((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/api/composition/reel-fonts';
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.append(link);
  });
  return fontsLink;
}

/**
 * The talking-head reel preview (spec 25 R4.1): the same `mountReel` engine the export runs, over
 * a muted native <video> that follows the editor's clock through the kept segments. The editor
 * plays the cleaned voice as the master clock, so the preview is the export.
 */
export function ReelPreview() {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const reel = useEditor((s) => s.project?.reel);
  const video = useEditor((s) => s.project?.video);
  const words = useEditor((s) => s.project?.transcript.words);
  const durationMs = useEditor((s) => s.project?.durationMs ?? 0);
  const playing = useEditor((s) => s.playing);
  const [scale, setScale] = useState(0.3);
  const [loaded, setLoaded] = useState<{ src: string; url: string } | null>(null);
  const handleRef = useRef<ReelHandle | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  const src = video?.src ?? null;
  const url = src && loaded?.src === src ? loaded.url : null;
  const segments = useMemo(
    () => (video ? keptSourceSegments(video.originalDurationMs, video.cuts) : []),
    [video],
  );

  // The source video as an object URL.
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    let made: string | null = null;
    void appAudioStore()
      .get(src)
      .then((blob) => {
        if (cancelled || !blob) return;
        made = URL.createObjectURL(blob);
        setLoaded({ src, url: made });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [src]);

  // Fit the 720 × 1280 stage into the frame.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / REEL_STAGE_W));
    ro.observe(el);
    setScale(el.clientWidth / REEL_STAGE_W);
    return () => ro.disconnect();
  }, []);

  // Mount the engine whenever the plan, the words or the video change.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !reel || !video || !url || !words) return;
    let cancelled = false;
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = url;
    videoElRef.current = v;
    let handle: ReelHandle | null = null;
    void ensureReelFonts().then(() => {
      if (cancelled) return;
      handle = mountReel(
        host,
        {
          plan: reel,
          words: words.map((w) => ({ text: w.text, startMs: w.startMs, endMs: w.endMs })),
          durationMs,
          video: { w: video.width, h: video.height },
        },
        [v],
      );
      handleRef.current = handle;
      void handle.ready.then(() => {
        if (!cancelled) handle?.seek(editorStore.getState().playheadMs);
      });
      handle.seek(editorStore.getState().playheadMs);
    });
    return () => {
      cancelled = true;
      handle?.destroy();
      if (handleRef.current === handle) handleRef.current = null;
      v.pause();
      v.removeAttribute('src');
      v.load();
      host.replaceChildren();
    };
  }, [reel, video, url, words, durationMs]);

  // Every clock tick: draw the reel and keep the video on the kept-segment time.
  useEffect(() => {
    const apply = (ms: number) => {
      handleRef.current?.seek(ms);
      const v = videoElRef.current;
      if (!v || v.readyState < 1) return;
      const target = cleanedToSourceMs(ms, segments) / 1000;
      const isPlaying = editorStore.getState().playing;
      if (!isPlaying || Math.abs(v.currentTime - target) > VIDEO_DRIFT_SEC) v.currentTime = target;
    };
    apply(editorStore.getState().playheadMs);
    return subscribePreviewSeek(apply);
  }, [segments, url]);

  useEffect(() => {
    const v = videoElRef.current;
    if (!v) return;
    if (playing) void v.play().catch(() => undefined);
    else v.pause();
  }, [playing, url]);

  return (
    <div ref={frameRef} className="absolute inset-0 overflow-hidden bg-black">
      <div
        ref={hostRef}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 720,
          height: 1280,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
        }}
      />
      {!url && (
        <div className="absolute inset-0 grid place-items-center text-[11px] text-text-3">
          Loading video…
        </div>
      )}
    </div>
  );
}
