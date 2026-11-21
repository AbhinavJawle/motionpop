'use client';

import {
  mountReel,
  reelBed,
  REEL_STAGE_W,
  type ReelHandle,
  type ReelImage,
} from '@motionpop/motion/reel';
import { SFX_SAMPLE_RATE, encodeWav16 } from '@motionpop/motion/sfx';
import {
  cleanedToSourceMs,
  keptSourceSegments,
  reelMediaOf,
  type ImageAsset,
  type ReelPlan,
} from '@motionpop/schemas';
import { getImage } from '@/lib/images/image-store';
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
 * Blob URLs and sizes for the pictures a reel uses (spec 26), keyed by asset id. Resolves once
 * every one has loaded (or failed), so the engine mounts with all its pictures at once.
 */
function useReelImages(
  reel: ReelPlan | undefined,
  assets: readonly ImageAsset[] | undefined,
): Record<string, ReelImage> | null {
  const ids = useMemo(() => {
    if (!reel) return '';
    return [...new Set(reelMediaOf(reel).flatMap((m) => (m.asset ? [m.asset] : [])))]
      .sort()
      .join(',');
  }, [reel]);
  const [state, setState] = useState<{ ids: string; images: Record<string, ReelImage> } | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    const made: string[] = [];
    const want = ids ? ids.split(',') : [];
    void Promise.all(
      want.map(async (id) => {
        const a = assets?.find((x) => x.id === id && x.status === 'ready');
        const blob = a?.src ? await getImage(a.src).catch(() => null) : null;
        if (!a || !blob) return null;
        const url = URL.createObjectURL(blob);
        made.push(url);
        return [id, { src: url, w: a.width ?? 1024, h: a.height ?? 1024 }] as const;
      }),
    ).then((pairs) => {
      if (cancelled) return;
      const images: Record<string, ReelImage> = {};
      for (const p of pairs) if (p) images[p[0]] = p[1];
      setState({ ids, images });
    });
    return () => {
      cancelled = true;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [ids, assets]);
  return state && state.ids === ids ? state.images : null;
}

/** The reel's sound design as a WAV object URL (spec 26 R4.2): the same bytes the export mixes. */
function useReelBedUrl(
  reel: ReelPlan | undefined,
  words: readonly { startMs: number; endMs: number }[] | undefined,
  durationMs: number,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!reel || !words || durationMs <= 0) return;
    let made: string | null = null;
    // Off the critical path: the picture comes first, the sound a moment later.
    const t = setTimeout(() => {
      const samples = reelBed(reel, durationMs, { voiceLevelDb: -20, words });
      made = URL.createObjectURL(
        new Blob([encodeWav16(samples, SFX_SAMPLE_RATE)], { type: 'audio/wav' }),
      );
      setUrl(made);
    }, 300);
    return () => {
      clearTimeout(t);
      if (made) URL.revokeObjectURL(made);
    };
  }, [reel, words, durationMs]);
  return url;
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
  const assets = useEditor((s) => s.project?.assets);
  const playing = useEditor((s) => s.playing);
  const images = useReelImages(reel, assets);
  const bedUrl = useReelBedUrl(reel, words, durationMs);
  const bedRef = useRef<HTMLAudioElement | null>(null);
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
    if (!host || !reel || !video || !url || !words || !images) return;
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
          images,
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
  }, [reel, video, url, words, durationMs, images]);

  // The sound bed follows the editor clock like the video does.
  useEffect(() => {
    if (!bedUrl) return;
    const a = new Audio(bedUrl);
    a.preload = 'auto';
    bedRef.current = a;
    return () => {
      a.pause();
      a.removeAttribute('src');
      if (bedRef.current === a) bedRef.current = null;
    };
  }, [bedUrl]);

  // Every clock tick: draw the reel and keep the video on the kept-segment time.
  useEffect(() => {
    const apply = (ms: number) => {
      handleRef.current?.seek(ms);
      const v = videoElRef.current;
      if (!v || v.readyState < 1) return;
      const target = cleanedToSourceMs(ms, segments) / 1000;
      const isPlaying = editorStore.getState().playing;
      if (!isPlaying || Math.abs(v.currentTime - target) > VIDEO_DRIFT_SEC) v.currentTime = target;
      const a = bedRef.current;
      if (
        a &&
        a.readyState >= 1 &&
        (!isPlaying || Math.abs(a.currentTime - ms / 1000) > VIDEO_DRIFT_SEC)
      )
        a.currentTime = ms / 1000;
    };
    apply(editorStore.getState().playheadMs);
    return subscribePreviewSeek(apply);
  }, [segments, url]);

  useEffect(() => {
    const v = videoElRef.current;
    if (!v) return;
    const a = bedRef.current;
    if (playing) {
      void v.play().catch(() => undefined);
      if (a) {
        a.currentTime = editorStore.getState().playheadMs / 1000;
        void a.play().catch(() => undefined);
      }
    } else {
      v.pause();
      a?.pause();
    }
  }, [playing, url, bedUrl]);

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
