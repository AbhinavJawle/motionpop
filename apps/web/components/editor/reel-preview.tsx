'use client';

import {
  cutsFromSegments,
  decodeWavStereo16,
  encodeWavStereo16,
  mixReelMusic,
  mountReel,
  stageSizeForFormat,
  type ReelClipMedia,
  type ReelCustomAssets,
  type ReelHandle,
  type ReelImage,
} from '@motionpop/motion/reel';
import {
  SFX_SAMPLE_RATE,
  decodeWav16,
  encodeWav16,
  voiceLevelDb as measureVoiceLevel,
} from '@motionpop/motion/sfx';
import {
  cleanedToSourceMs,
  isVideoReel,
  keptSourceSegments,
  reelBedSound,
  reelClipIdsOf,
  reelMediaOf,
  reelSceneData,
  type Format,
  type ImageAsset,
  type MediaClip,
  type ReelPlan,
} from '@motionpop/schemas';
import { getImage } from '@/lib/images/image-store';
import { previewReelBed } from '@/lib/sound/reel-bed';
import { customPictures, loadReelCustomAssets } from '@/lib/reel/custom-assets';
import { useEffect, useMemo, useRef, useState } from 'react';
import { appAudioStore } from '@/lib/audio/app-audio-store';
import { isIdbAudioRef } from '@/lib/audio/audio-store';
import { subscribePreviewSeek } from '@/lib/editor/preview-bridge';
import { editorStore, useEditor } from '@/lib/stores/editor';
import { MissingVideoOverlay, type MissingVideoReason } from './missing-video-overlay';

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

const hasCustomScene = (reel: ReelPlan | undefined): boolean =>
  Boolean(reel?.scenes.some((s) => s.content.template === 'custom'));

/**
 * For a reel with AI-written scenes (spec 30): the custom runtime, and those scenes' pictures as
 * data URLs (a sandboxed frame can't read the page's blob: URLs). `undefined` while loading;
 * `null` when the reel has none or the runtime is missing (the scenes then show their title).
 */
function sameCustom(
  a: { assets: ReelCustomAssets; images: Record<string, ReelImage> } | null,
  b: { assets: ReelCustomAssets; images: Record<string, ReelImage> } | null,
): boolean {
  if (a === null || b === null) return a === b;
  if (a.assets.js !== b.assets.js || a.assets.fontCss !== b.assets.fontCss) return false;
  const ka = Object.keys(a.images);
  if (ka.length !== Object.keys(b.images).length) return false;
  return ka.every((k) => {
    const x = a.images[k];
    const y = b.images[k];
    return !!x && !!y && x.src === y.src && x.w === y.w && x.h === y.h;
  });
}

function useReelCustom(
  reel: ReelPlan | undefined,
  assets: readonly ImageAsset[] | undefined,
): { assets: ReelCustomAssets; images: Record<string, ReelImage> } | null | undefined {
  const ids = useMemo(() => {
    if (!reel) return '';
    const custom = { scenes: reel.scenes.filter((s) => s.content.template === 'custom') };
    return [...new Set(reelMediaOf(custom).flatMap((m) => (m.asset ? [m.asset] : [])))]
      .sort()
      .join(',');
  }, [reel]);
  const wanted = hasCustomScene(reel);
  const [state, setState] = useState<{
    key: string;
    value: { assets: ReelCustomAssets; images: Record<string, ReelImage> } | null;
  } | null>(null);
  const key = `${wanted}|${ids}`;
  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    void (async () => {
      const runtime = await loadReelCustomAssets();
      const images = await customPictures(ids ? ids.split(',') : [], assets);
      if (cancelled) return;
      const value = runtime ? { assets: runtime, images } : null;
      // Same scenes, same pictures (an unrelated asset landed): keep the old object, or the
      // preview would tear down and reload every AI-written frame.
      setState((prev) =>
        prev && prev.key === key && sameCustom(prev.value, value) ? prev : { key, value },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [wanted, ids, assets, key]);
  if (!wanted) return null;
  return state && state.key === key ? state.value : undefined;
}

/**
 * Blob URLs and sizes for creator-uploaded Media Bin clips referenced by `clip` scenes (spec 48).
 */
function useReelClips(
  reel: ReelPlan | undefined,
  mediaBin: readonly MediaClip[] | undefined,
): Record<string, ReelClipMedia> | null {
  const clipKey = useMemo(() => {
    const wanted = reelClipIdsOf(reel);
    if (wanted.length === 0 || !mediaBin?.length) return '';
    return wanted
      .map((id) => {
        const c = mediaBin.find((x) => x.id === id);
        return c ? `${c.id}:${c.src}` : '';
      })
      .filter(Boolean)
      .sort()
      .join('|');
  }, [reel, mediaBin]);
  const [state, setState] = useState<{ key: string; clips: Record<string, ReelClipMedia> }>({
    key: '',
    clips: {},
  });
  useEffect(() => {
    if (!clipKey) return;
    const bin = editorStore.getState().project?.mediaBin ?? [];
    const wanted = new Set(reelClipIdsOf(editorStore.getState().project?.reel));
    const list = bin.filter((c) => wanted.has(c.id));
    let cancelled = false;
    const made: string[] = [];
    void Promise.all(
      list.map(async (c) => {
        const blob = await appAudioStore()
          .get(c.src)
          .catch(() => null);
        if (!blob || cancelled) return null;
        const url = URL.createObjectURL(blob);
        made.push(url);
        const media: ReelClipMedia = {
          src: url,
          isVideo: c.mimeType.startsWith('video/'),
          w: c.width,
          h: c.height,
          ...(c.durationMs !== undefined ? { durationMs: c.durationMs } : {}),
          name: c.name,
        };
        return [c.id, media] as const;
      }),
    ).then((pairs) => {
      if (cancelled) {
        made.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      const clips: Record<string, ReelClipMedia> = {};
      for (const p of pairs) if (p) clips[p[0]] = p[1];
      setState({ key: clipKey, clips });
    });
    return () => {
      cancelled = true;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [clipKey]);
  if (!clipKey) return {};
  return state.key === clipKey ? state.clips : null;
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
        if (!a || !blob || cancelled) return null;
        const url = URL.createObjectURL(blob);
        made.push(url);
        return [id, { src: url, w: a.width ?? 1024, h: a.height ?? 1024 }] as const;
      }),
    ).then((pairs) => {
      if (cancelled) {
        made.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
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

/** Starts the sound tracks at `sec` (editor clock). */
function playTracks(els: readonly HTMLAudioElement[], sec: number): void {
  for (const a of els) {
    a.currentTime = sec;
    void a.play().catch(() => undefined);
  }
}

function pauseTracks(els: readonly HTMLAudioElement[], release = false): void {
  for (const a of els) {
    a.pause();
    if (release) a.removeAttribute('src');
  }
}

/** Keeps the tracks on the editor clock: always when paused, past the drift limit when playing. */
function syncTracks(els: readonly HTMLAudioElement[], sec: number, playing: boolean): void {
  for (const a of els)
    if (a.readyState >= 1 && (!playing || Math.abs(a.currentTime - sec) > VIDEO_DRIFT_SEC))
      a.currentTime = sec;
}

/**
 * The voice's measured level (dBFS), the same measurement the export makes, so effects and
 * music sit at the same distance under the voice in the preview and in the file.
 */
function useVoiceLevel(
  src: string | undefined,
  words: readonly { startMs: number; endMs: number }[] | undefined,
): number | null {
  const [level, setLevel] = useState<number | null>(null);
  useEffect(() => {
    if (!src || !words) return;
    let cancelled = false;
    void appAudioStore()
      .get(src)
      .then(async (blob) => {
        if (!blob || cancelled) return;
        const pcm = decodeWav16(new Uint8Array(await blob.arrayBuffer()));
        if (!cancelled) setLevel(pcm ? measureVoiceLevel(pcm.samples, pcm.sampleRate, words) : -20);
      })
      .catch(() => {
        if (!cancelled) setLevel(-20);
      });
    return () => {
      cancelled = true;
    };
  }, [src, words]);
  return level;
}

/** The reel's generated music (spec 27 R3.2), levelled and ducked like the export does it. */
function useReelMusicUrl(
  src: string | undefined,
  words: readonly { startMs: number; endMs: number }[] | undefined,
  voiceLevel: number | null,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!src || !words || voiceLevel === null) return;
    let cancelled = false;
    let made: string | null = null;
    void appAudioStore()
      .get(src)
      .then(async (blob) => {
        if (!blob || cancelled) return;
        const pcm = decodeWavStereo16(new Uint8Array(await blob.arrayBuffer()));
        if (!pcm || cancelled) return;
        const mixed = mixReelMusic(pcm, { voiceLevelDb: voiceLevel, words });
        made = URL.createObjectURL(new Blob([encodeWavStereo16(mixed)], { type: 'audio/wav' }));
        setUrl(made);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [src, words, voiceLevel]);
  return src && words && voiceLevel !== null ? url : null;
}

/** The reel's sound design as a WAV object URL (spec 26 R4.2): the same bytes the export mixes. */
function useReelBedUrl(
  reel: ReelPlan | undefined,
  words: readonly { startMs: number; endMs: number }[] | undefined,
  durationMs: number,
  voiceLevel: number | null,
  /** The project's sound settings (spec 37 R3.4), as `reelBedSound` JSON so it compares by value. */
  soundKey: string,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!reel || !words || durationMs <= 0 || voiceLevel === null) return;
    const sound = JSON.parse(soundKey) as ReturnType<typeof reelBedSound>;
    let made: string | null = null;
    // Off the critical path: the picture comes first, the sound a moment later.
    const t = setTimeout(() => {
      const samples = previewReelBed(reel, durationMs, voiceLevel, words, sound);
      made = URL.createObjectURL(
        new Blob([encodeWav16(samples, SFX_SAMPLE_RATE)], { type: 'audio/wav' }),
      );
      setUrl(made);
    }, 300);
    return () => {
      clearTimeout(t);
      if (made) URL.revokeObjectURL(made);
    };
  }, [reel, words, durationMs, voiceLevel, soundKey]);
  return url;
}

/**
 * The talking-head reel preview (spec 25 R4.1): the same `mountReel` engine the export runs, over
 * a muted native <video> that follows the editor's clock through the kept segments. The editor
 * plays the cleaned voice as the master clock, so the preview is the export.
 */
export function ReelPreview({ transparent = false }: { transparent?: boolean } = {}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const storedReel = useEditor((s) => s.project?.reel);
  const format: Format = useEditor((s) =>
    isVideoReel(s.project) ? '9:16' : (s.project?.format ?? '16:9'),
  );
  const stage = useMemo(() => stageSizeForFormat(format), [format]);
  // The engine sees the plan without its frame notes (spec 29): adding or fixing the status of a
  // note never remounts the stage or reloads the video; a real scene change does.
  const engineKey = useMemo(
    () =>
      storedReel
        ? JSON.stringify({ ...storedReel, scenes: storedReel.scenes.map(reelSceneData) })
        : '',
    [storedReel],
  );
  const reel = useMemo(
    () => (engineKey ? (JSON.parse(engineKey) as ReelPlan) : undefined),
    [engineKey],
  );
  const video = useEditor((s) => s.project?.video);
  const graphicOnly = Boolean(reel?.graphicOnly && !video);
  const words = useEditor((s) => s.project?.transcript.words);
  const durationMs = useEditor((s) => s.project?.durationMs ?? 0);
  const assets = useEditor((s) => s.project?.assets);
  const mediaBin = useEditor((s) => s.project?.mediaBin);
  const playing = useEditor((s) => s.playing);
  const images = useReelImages(reel, assets);
  const clips = useReelClips(reel, mediaBin);
  const custom = useReelCustom(reel, assets);
  const voiceSrc = useEditor((s) => s.project?.voiceover.src);
  const voiceLevel = useVoiceLevel(graphicOnly ? undefined : voiceSrc, words);
  const soundKey = useEditor((s) =>
    s.project ? JSON.stringify(reelBedSound(s.project)) : '{"sfx":true,"sfxGainDb":0,"music":null}',
  );
  const bedUrl = useReelBedUrl(
    graphicOnly ? undefined : reel,
    words,
    durationMs,
    voiceLevel,
    soundKey,
  );
  const musicUrl = useReelMusicUrl(graphicOnly ? undefined : reel?.music?.src, words, voiceLevel);
  // The sound tracks under the voice (effects bed, music), all following the editor clock.
  const tracksRef = useRef<HTMLAudioElement[]>([]);
  const [scale, setScale] = useState(0.3);
  const [loaded, setLoaded] = useState<
    | { src: string; status: 'ready'; url: string }
    | { src: string; status: 'missing'; reason: MissingVideoReason }
    | null
  >(null);
  const [retrySeq, setRetrySeq] = useState(0);
  const handleRef = useRef<ReelHandle | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  const src = video?.src ?? null;
  const videoLoad = src && loaded?.src === src ? loaded : null;
  const url = videoLoad?.status === 'ready' ? videoLoad.url : null;
  const segments = useMemo(
    () => (video ? keptSourceSegments(video.originalDurationMs, video.cuts) : []),
    [video],
  );

  // The source video as an object URL (talking-head video reels only).
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    let made: string | null = null;
    void appAudioStore()
      .get(src)
      .then((blob) => {
        if (cancelled) return;
        if (!blob) {
          setLoaded({
            src,
            status: 'missing',
            reason: isIdbAudioRef(src) ? 'local-only' : 'unavailable',
          });
          return;
        }
        made = URL.createObjectURL(blob);
        setLoaded({ src, status: 'ready', url: made });
      })
      .catch(() => {
        if (!cancelled) {
          setLoaded({
            src,
            status: 'missing',
            reason: isIdbAudioRef(src) ? 'local-only' : 'unavailable',
          });
        }
      });
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [src, retrySeq]);

  // Fit the stage into the frame at the active aspect ratio.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const updateScale = () => setScale(el.clientWidth / stage.w);
    const ro = new ResizeObserver(updateScale);
    ro.observe(el);
    updateScale();
    return () => ro.disconnect();
  }, [stage.w]);

  // Mount the engine whenever the plan, format, transparency, words, or video change.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !reel || !images || !clips || custom === undefined) return;
    if (video && !url) return;
    let cancelled = false;
    let v: HTMLVideoElement | null = null;
    if (video && url) {
      v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.src = url;
      videoElRef.current = v;
    } else {
      videoElRef.current = null;
    }
    let handle: ReelHandle | null = null;
    void ensureReelFonts().then(() => {
      if (cancelled) return;
      handle = mountReel(
        host,
        {
          plan: reel,
          words: (words ?? []).map((w) => ({ text: w.text, startMs: w.startMs, endMs: w.endMs })),
          durationMs,
          format,
          ...(transparent && !video ? { transparent: true } : {}),
          ...(video ? { video: { w: video.width, h: video.height } } : {}),
          images,
          ...(Object.keys(clips).length ? { clips } : {}),
          // AI-written scenes run sandboxed in their own frames (spec 30).
          ...(custom
            ? { custom: custom.assets, customImages: custom.images, customSandbox: true }
            : {}),
          // Jump cuts on the reel clock: the framing alternates on them (spec 27 R1.2).
          cuts: video
            ? cutsFromSegments(segments.map((k) => ({ srcStartMs: k.startMs, srcEndMs: k.endMs })))
            : [],
        },
        v ? [v] : [],
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
      if (v) {
        v.pause();
        v.removeAttribute('src');
        v.load();
      }
      host.replaceChildren();
    };
  }, [reel, video, url, words, durationMs, format, transparent, images, clips, segments, custom]);

  // The sound tracks follow the editor clock like the video does.
  useEffect(() => {
    const els = [bedUrl, musicUrl].flatMap((u) => {
      if (!u) return [];
      const a = new Audio(u);
      a.preload = 'auto';
      return [a];
    });
    tracksRef.current = els;
    if (editorStore.getState().playing) playTracks(els, editorStore.getState().playheadMs / 1000);
    return () => {
      pauseTracks(els, true);
      if (tracksRef.current === els) tracksRef.current = [];
    };
  }, [bedUrl, musicUrl]);

  // Every clock tick: draw the reel and keep the video (if any), active clip videos & sound tracks on the editor clock.
  useEffect(() => {
    const apply = (ms: number) => {
      handleRef.current?.seek(ms);
      const isPlaying = editorStore.getState().playing;
      syncTracks(tracksRef.current, ms / 1000, isPlaying);
      if (isPlaying && hostRef.current) {
        for (const cv of hostRef.current.querySelectorAll<HTMLVideoElement>('video[data-reel-clip-preview]')) {
          const sceneHost = cv.closest<HTMLElement>('[data-reel-scene]');
          const visible = sceneHost ? sceneHost.style.display !== 'none' : true;
          if (visible && cv.paused) void cv.play().catch(() => undefined);
          else if (!visible && !cv.paused) cv.pause();
        }
      }
      const v = videoElRef.current;
      if (!v || v.readyState < 1) return;
      const target = cleanedToSourceMs(ms, segments) / 1000;
      if (!isPlaying || Math.abs(v.currentTime - target) > VIDEO_DRIFT_SEC) v.currentTime = target;
    };
    apply(editorStore.getState().playheadMs);
    return subscribePreviewSeek(apply);
  }, [segments, url]);

  useEffect(() => {
    const v = videoElRef.current;
    const clipVids = hostRef.current
      ? Array.from(hostRef.current.querySelectorAll<HTMLVideoElement>('video[data-reel-clip-preview]'))
      : [];
    if (playing) {
      if (v) void v.play().catch(() => undefined);
      for (const cv of clipVids) {
        const sceneHost = cv.closest<HTMLElement>('[data-reel-scene]');
        if (!sceneHost || sceneHost.style.display !== 'none') {
          void cv.play().catch(() => undefined);
        }
      }
      playTracks(tracksRef.current, editorStore.getState().playheadMs / 1000);
    } else {
      if (v) v.pause();
      for (const cv of clipVids) cv.pause();
      pauseTracks(tracksRef.current);
    }
  }, [playing, url, bedUrl, musicUrl]);

  return (
    <div
      ref={frameRef}
      className={
        transparent && !video
          ? 'absolute inset-0 overflow-hidden bg-transparent'
          : 'absolute inset-0 overflow-hidden bg-black'
      }
    >
      <div
        ref={hostRef}
        data-reel-stage
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: stage.w,
          height: stage.h,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
        }}
      />
      {Boolean(video) && videoLoad?.status === 'missing' && (
        <MissingVideoOverlay
          reason={videoLoad.reason}
          onRetry={() => {
            setLoaded(null);
            setRetrySeq((n) => n + 1);
          }}
        />
      )}
      {Boolean(video) && !url && videoLoad?.status !== 'missing' && (
        <div className="absolute inset-0 grid place-items-center text-[11px] text-text-3">
          Loading video…
        </div>
      )}
    </div>
  );
}
