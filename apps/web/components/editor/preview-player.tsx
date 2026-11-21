'use client';

import { compileProject } from '@motionpop/motion/compiler';
import {
  FORMATS,
  cleanedToSourceMs,
  keptSourceSegments,
  mediaLayerRectAt,
  videoStageRectAt,
  type MediaClip,
} from '@motionpop/schemas';
import { useEffect, useMemo, useRef, useState } from 'react';
import { appAudioStore } from '@/lib/audio/app-audio-store';
import { loadCompositionAssets } from '@/lib/composition/assets';
import {
  previewCompileInput,
  previewImages,
  previewImagesKey,
} from '@/lib/composition/project-to-compile';
import {
  attachPreview,
  resyncPreview,
  seekPreview,
  subscribePreviewSeek,
} from '@/lib/editor/preview-bridge';
import { lookFor } from '@/lib/motion/registry';
import { editorStore, useEditor } from '@/lib/stores/editor';

type PlayerEl = HTMLElement & { seek(seconds: number): void; ready?: boolean };

const RECOMPILE_DEBOUNCE_MS = 150;
const VIDEO_DRIFT_SEC = 0.14;

/**
 * The HyperFrames player showing the compiled project (spec 04 R3.3), layered over the live
 * dual-layer dancing video stages when `project.video` or `project.mediaBin` is present
 * (spec 18 R5, spec 19 R4.1, spec 20 R4.1). Muted: the editor plays the cleaned voiceover track
 * itself as the master clock.
 */
export function PreviewPlayer({ onError }: { onError?: (message: string) => void }) {
  const ref = useRef<PlayerEl | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStageRef = useRef<HTMLDivElement | null>(null);
  const mediaChromeRef = useRef<HTMLDivElement | null>(null);
  const mediaTitleRef = useRef<HTMLSpanElement | null>(null);
  const mediaVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaImgRef = useRef<HTMLImageElement | null>(null);

  const project = useEditor((s) => s.project);
  const playheadMs = useEditor((s) => s.playheadMs);
  const playing = useEditor((s) => s.playing);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [loadedVideo, setLoadedVideo] = useState<{ src: string; url: string } | null>(null);
  const [loadedClips, setLoadedClips] = useState<{ key: string; urls: Record<string, string> }>({
    key: '',
    urls: {},
  });
  const activeClipUrlRef = useRef<string>('');

  const videoSrc = project?.video?.src ?? null;
  const videoUrl = videoSrc && loadedVideo?.src === videoSrc ? loadedVideo.url : null;
  const lookBg = project ? lookFor(project.styleId).colors.bg : 'transparent';
  const mediaBinKey = useMemo(
    () => (project?.mediaBin ?? []).map((c) => `${c.id}:${c.src}`).join('|'),
    [project?.mediaBin],
  );
  const clipUrls = useMemo(
    () => (mediaBinKey && loadedClips.key === mediaBinKey ? loadedClips.urls : {}),
    [mediaBinKey, loadedClips],
  );

  // Load the uploaded A-roll video blob into a managed object URL when present.
  useEffect(() => {
    if (!videoSrc) return;
    let cancelled = false;
    let url: string | null = null;
    void appAudioStore()
      .get(videoSrc)
      .then((blob) => {
        if (cancelled || !blob) return;
        url = URL.createObjectURL(blob);
        setLoadedVideo({ src: videoSrc, url });
      })
      .catch(() => {
        if (!cancelled) setLoadedVideo(null);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [videoSrc]);

  // Load all Media Bin clip blobs into managed object URLs for instant 60fps switching.
  useEffect(() => {
    const clips = editorStore.getState().project?.mediaBin ?? [];
    if (!mediaBinKey || clips.length === 0) return;
    let cancelled = false;
    const created: string[] = [];
    void Promise.all(
      clips.map(async (c) => {
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
      for (const e of entries) {
        if (e) next[e[0]] = e[1];
      }
      setLoadedClips({ key: mediaBinKey, urls: next });
    });
    return () => {
      cancelled = true;
      for (const u of created) URL.revokeObjectURL(u);
    };
  }, [mediaBinKey]);

  // Keep `<video>` play/pause synchronized with the editor's PlaybackClock.
  useEffect(() => {
    const el = videoRef.current;
    if (el && videoUrl) {
      if (playing) void el.play().catch(() => undefined);
      else el.pause();
    }
    const mel = mediaVideoRef.current;
    if (mel && mel.src && !mel.hidden) {
      if (playing) void mel.play().catch(() => undefined);
      else mel.pause();
    }
  }, [playing, videoUrl]);

  // Synchronize A-roll `<video>` AND secondary Media Bin stage (B-roll / screen recording / screenshot) at 60fps.
  useEffect(() => {
    if (!videoUrl && Object.keys(clipUrls).length === 0) return;
    const applyStage = (ms: number) => {
      const proj = editorStore.getState().project;
      const vid = proj?.video;
      if (!proj) return;
      const dims = FORMATS[proj.format];
      const isPlaying = editorStore.getState().playing;

      // 1. A-roll speaker stage
      const el = videoRef.current;
      const stageEl = stageRef.current;
      if (el && stageEl && vid) {
        const segments = keptSourceSegments(vid.originalDurationMs, vid.cuts);
        const targetSec = cleanedToSourceMs(ms, segments) / 1000;
        if (el.readyState >= 1) {
          if (!isPlaying || Math.abs(el.currentTime - targetSec) > VIDEO_DRIFT_SEC) {
            el.currentTime = targetSec;
          }
        }
        const rect = videoStageRectAt(ms, vid.stages, vid.punchIns, dims.width, dims.height);
        stageEl.style.left = `${(rect.x / dims.width) * 100}%`;
        stageEl.style.top = `${(rect.y / dims.height) * 100}%`;
        stageEl.style.width = `${(rect.w / dims.width) * 100}%`;
        stageEl.style.height = `${(rect.h / dims.height) * 100}%`;
        stageEl.style.borderRadius = `${Math.round((rect.radius / Math.min(dims.width, dims.height)) * 1000) / 10}%`;
        stageEl.style.opacity = String(rect.opacity);
        // Float speaker PiP cleanly above screen-showcase window; keep behind media-card-pop.
        stageEl.style.zIndex = rect.mode === 'screen-showcase' ? '3' : '1';
        stageEl.style.boxShadow =
          rect.shadow > 0.01 ? `0 20px 56px rgba(0, 0, 0, ${rect.shadow})` : 'none';
        const fx = Math.round(rect.focusX * 100);
        const fy = Math.round(rect.focusY * 100);
        el.style.objectPosition = `${fx}% ${fy}%`;
        el.style.transformOrigin = `${fx}% ${fy}%`;
        el.style.transform = `scale(${rect.scale})`;
        const brightness = Math.max(0.2, 1 - rect.dim);
        el.style.filter =
          rect.blurPx > 0.1 || rect.dim > 0.01
            ? `blur(${rect.blurPx}px) brightness(${brightness.toFixed(3)})`
            : 'none';
      }

      // 2. Secondary Media Bin stage (B-roll / Screen Recording / Screenshot, spec 20)
      const mediaStageEl = mediaStageRef.current;
      const mediaVidEl = mediaVideoRef.current;
      const mediaImgEl = mediaImgRef.current;
      const mediaChromeEl = mediaChromeRef.current;
      const mediaTitleEl = mediaTitleRef.current;
      if (!mediaStageEl || !mediaVidEl || !mediaImgEl) return;

      const mRect = mediaLayerRectAt(ms, vid?.stages, dims.width, dims.height);
      const clip: MediaClip | undefined = mRect.clipId
        ? proj.mediaBin?.find((c) => c.id === mRect.clipId)
        : undefined;
      const clipUrl = clip ? clipUrls[clip.id] : undefined;

      if (!mRect.visible || !clip || !clipUrl) {
        mediaStageEl.style.opacity = '0';
        mediaStageEl.style.visibility = 'hidden';
        if (!mediaVidEl.paused) mediaVidEl.pause();
        return;
      }

      mediaStageEl.style.visibility = 'visible';
      mediaStageEl.style.opacity = String(mRect.opacity);
      mediaStageEl.style.zIndex = String(mRect.zIndex + 1);
      mediaStageEl.style.left = `${(mRect.x / dims.width) * 100}%`;
      mediaStageEl.style.top = `${(mRect.y / dims.height) * 100}%`;
      mediaStageEl.style.width = `${(mRect.w / dims.width) * 100}%`;
      mediaStageEl.style.height = `${(mRect.h / dims.height) * 100}%`;
      mediaStageEl.style.borderRadius = `${Math.round((mRect.radius / Math.min(dims.width, dims.height)) * 1000) / 10}%`;
      mediaStageEl.style.boxShadow =
        mRect.shadow > 0.01 ? `0 28px 72px rgba(0, 0, 0, ${mRect.shadow})` : 'none';
      mediaStageEl.style.transform =
        Math.abs(mRect.rotateX) > 0.05 || Math.abs(mRect.rotateY) > 0.05
          ? `perspective(1200px) rotateX(${mRect.rotateX}deg) rotateY(${mRect.rotateY}deg)`
          : 'none';

      if (mediaChromeEl) {
        mediaChromeEl.style.display = mRect.framed ? 'flex' : 'none';
      }
      if (mediaTitleEl && mRect.framed) {
        mediaTitleEl.textContent = clip.name.replace(/\.[^.]+$/, '');
      }

      const mfx = Math.round(mRect.focusX * 100);
      const mfy = Math.round(mRect.focusY * 100);
      const isVideoClip = clip.mimeType.startsWith('video/');

      if (isVideoClip) {
        mediaImgEl.hidden = true;
        mediaVidEl.hidden = false;
        if (activeClipUrlRef.current !== clipUrl) {
          activeClipUrlRef.current = clipUrl;
          mediaVidEl.src = clipUrl;
        }
        const elapsedMs = Math.max(0, ms - mRect.beatStartMs);
        const clipDur = Math.max(1000, clip.durationMs ?? 10_000);
        const clipTargetSec = ((mRect.clipStartMs + elapsedMs) % clipDur) / 1000;
        if (mediaVidEl.readyState >= 1) {
          if (!isPlaying || Math.abs(mediaVidEl.currentTime - clipTargetSec) > VIDEO_DRIFT_SEC * 1.5) {
            mediaVidEl.currentTime = clipTargetSec;
          }
        }
        if (isPlaying && mediaVidEl.paused) {
          void mediaVidEl.play().catch(() => undefined);
        } else if (!isPlaying && !mediaVidEl.paused) {
          mediaVidEl.pause();
        }
        mediaVidEl.style.objectFit = mRect.framed ? 'contain' : 'cover';
        mediaVidEl.style.objectPosition = `${mfx}% ${mfy}%`;
        mediaVidEl.style.transformOrigin = `${mfx}% ${mfy}%`;
        mediaVidEl.style.transform = `scale(${mRect.scale})`;
      } else {
        if (!mediaVidEl.paused) mediaVidEl.pause();
        mediaVidEl.hidden = true;
        mediaImgEl.hidden = false;
        if (mediaImgEl.src !== clipUrl) mediaImgEl.src = clipUrl;
        mediaImgEl.style.objectFit = mRect.mode === 'broll-full' ? 'cover' : 'contain';
        mediaImgEl.style.objectPosition = `${mfx}% ${mfy}%`;
        mediaImgEl.style.transformOrigin = `${mfx}% ${mfy}%`;
        mediaImgEl.style.transform = `scale(${mRect.scale})`;
      }
    };
    applyStage(editorStore.getState().playheadMs);
    return subscribePreviewSeek(applyStage);
  }, [videoUrl, clipUrls, project?.video?.stages, project?.video?.punchIns, project?.format]);

  // Only what the composition depends on: title renames and selection don't recompile.
  const input = useMemo(() => (project ? previewCompileInput(project) : null), [project]);
  const imagesKey = useMemo(() => (project ? previewImagesKey(project) : ''), [project]);
  const key = useMemo(() => (input ? JSON.stringify(input) + imagesKey : ''), [input, imagesKey]);

  useEffect(() => {
    void import('@hyperframes/player').then(() => resyncPreview());
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ensureTransparentIframe = () => {
      const iframe = el.shadowRoot?.querySelector('iframe');
      if (!iframe) return;
      iframe.setAttribute('allowtransparency', 'true');
      iframe.style.background = 'transparent';
      iframe.style.colorScheme = 'dark';
    };
    attachPreview(el);
    ensureTransparentIframe();
    const onReady = () => {
      ensureTransparentIframe();
      resyncPreview();
    };
    el.addEventListener('ready', onReady);
    return () => {
      el.removeEventListener('ready', onReady);
      attachPreview(null);
    };
  }, []);

  useEffect(() => {
    if (!input) return;
    let cancelled = false;
    const t = setTimeout(() => {
      const current = editorStore.getState().project;
      Promise.all([loadCompositionAssets(), current ? previewImages(current) : {}])
        .then(([assets, images]) => {
          if (cancelled || !ref.current) return;
          // Generated code (spec 15) only ever runs with an opaque origin (D-021); set before the
          // composition so it never loads same-origin, even for one frame.
          if (input.slots.some((s) => s.componentId === 'custom')) {
            ref.current.setAttribute('sandbox-origin', 'opaque');
          } else ref.current.removeAttribute('sandbox-origin');
          // Pictures join the compile input's own images (the globe's imagery), never replace them.
          ref.current.setAttribute(
            'srcdoc',
            compileProject({ ...input, images: { ...input.images, ...images } }, assets),
          );
          setAssetsError(null);
        })
        .catch((e: unknown) => {
          const message = e instanceof Error ? e.message : String(e);
          setAssetsError(message);
          onError?.(message);
        });
    }, RECOMPILE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // `key` captures every input change; `input` itself changes identity on unrelated edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    seekPreview(playheadMs);
  }, [playheadMs]);

  const size = FORMATS[project?.format ?? '16:9'];
  const hasAnyVideoLayer = Boolean(videoUrl) || Object.keys(clipUrls).length > 0;
  return (
    <>
      {hasAnyVideoLayer && (
        <div
          aria-hidden
          data-testid="preview-video-backdrop"
          className="pointer-events-none absolute inset-0"
          style={{ background: lookBg }}
        >
          {videoUrl && (
            <div
              ref={stageRef}
              data-testid="preview-video-stage"
              className="pointer-events-none absolute inset-0 overflow-hidden will-change-transform"
            >
              <video
                ref={videoRef}
                src={videoUrl}
                muted
                playsInline
                preload="auto"
                data-testid="preview-video-layer"
                className="pointer-events-none h-full w-full object-cover"
              />
            </div>
          )}
          <div
            ref={mediaStageRef}
            data-testid="preview-media-stage"
            style={{ visibility: 'hidden', opacity: 0 }}
            className="pointer-events-none absolute flex flex-col overflow-hidden bg-[#0b0c12] ring-1 ring-white/14 will-change-transform"
          >
            <div
              ref={mediaChromeRef}
              style={{ display: 'none' }}
              className="h-6 shrink-0 items-center gap-1.5 border-b border-white/10 bg-[#141620] px-2.5"
            >
              <span className="size-2 rounded-full bg-[#FF5F56]" />
              <span className="size-2 rounded-full bg-[#FFBD2E]" />
              <span className="size-2 rounded-full bg-[#27C93F]" />
              <span
                ref={mediaTitleRef}
                className="ml-2 truncate font-mono text-[10px] text-white/60"
              />
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <video
                ref={mediaVideoRef}
                muted
                playsInline
                loop
                preload="auto"
                hidden
                data-testid="preview-media-video"
                className="pointer-events-none h-full w-full object-cover"
              />
              {/* Managed local blob URL from Media Bin for screenshots/photos. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={mediaImgRef}
                alt=""
                hidden
                data-testid="preview-media-image"
                className="pointer-events-none h-full w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
      <hyperframes-player
        ref={ref}
        width={size.width}
        height={size.height}
        muted
        aria-label="Video preview"
        style={{
          position: 'relative',
          zIndex: 5,
          display: 'block',
          width: '100%',
          height: '100%',
          background: 'transparent',
          colorScheme: 'dark',
        }}
      />
      {assetsError && (
        <p className="absolute inset-x-6 bottom-6 z-10 rounded-chip bg-glass px-3 py-2 text-[11px] text-text-2 shadow-glass">
          Preview unavailable: {assetsError}
        </p>
      )}
    </>
  );
}
