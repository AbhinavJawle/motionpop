'use client';

import { compileProject } from '@motionpop/motion/compiler';
import {
  FORMATS,
  cleanedToSourceMs,
  keptSourceSegments,
  videoStageRectAt,
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
 * dancing `<video>` stage when `project.video` is present (spec 18 R5, spec 19 R4.1). Muted:
 * the editor plays the cleaned voiceover track itself as the master clock.
 */
export function PreviewPlayer({ onError }: { onError?: (message: string) => void }) {
  const ref = useRef<PlayerEl | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const project = useEditor((s) => s.project);
  const playheadMs = useEditor((s) => s.playheadMs);
  const playing = useEditor((s) => s.playing);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [loadedVideo, setLoadedVideo] = useState<{ src: string; url: string } | null>(null);

  const videoSrc = project?.video?.src ?? null;
  const videoUrl = videoSrc && loadedVideo?.src === videoSrc ? loadedVideo.url : null;
  const lookBg = project ? lookFor(project.styleId).colors.bg : 'transparent';

  // Load the uploaded video blob into a managed object URL when present.
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

  // Keep `<video>` play/pause synchronized with the editor's PlaybackClock.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !videoUrl) return;
    if (playing) {
      void el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  }, [playing, videoUrl]);

  // Synchronize `<video>` source clock (skipping enabled cuts) and dancing choreography stage on every tick.
  useEffect(() => {
    if (!videoUrl) return;
    const applyStage = (ms: number) => {
      const el = videoRef.current;
      const stageEl = stageRef.current;
      const proj = editorStore.getState().project;
      const vid = proj?.video;
      if (!el || !stageEl || !vid || !proj) return;
      const segments = keptSourceSegments(vid.originalDurationMs, vid.cuts);
      const targetSec = cleanedToSourceMs(ms, segments) / 1000;
      const isPlaying = editorStore.getState().playing;
      if (el.readyState >= 1) {
        if (!isPlaying || Math.abs(el.currentTime - targetSec) > VIDEO_DRIFT_SEC) {
          el.currentTime = targetSec;
        }
      }
      const dims = FORMATS[proj.format];
      const rect = videoStageRectAt(ms, vid.stages, vid.punchIns, dims.width, dims.height);
      stageEl.style.left = `${(rect.x / dims.width) * 100}%`;
      stageEl.style.top = `${(rect.y / dims.height) * 100}%`;
      stageEl.style.width = `${(rect.w / dims.width) * 100}%`;
      stageEl.style.height = `${(rect.h / dims.height) * 100}%`;
      stageEl.style.borderRadius = `${Math.round((rect.radius / Math.min(dims.width, dims.height)) * 1000) / 10}%`;
      stageEl.style.opacity = String(rect.opacity);
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
    };
    applyStage(editorStore.getState().playheadMs);
    return subscribePreviewSeek(applyStage);
  }, [videoUrl, project?.video?.stages, project?.video?.punchIns, project?.format]);

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
    attachPreview(el);
    const onReady = () => resyncPreview();
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
  return (
    <>
      {videoUrl && (
        <div
          aria-hidden
          data-testid="preview-video-backdrop"
          className="pointer-events-none absolute inset-0"
          style={{ background: lookBg }}
        >
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
          zIndex: 1,
          display: 'block',
          width: '100%',
          height: '100%',
          background: 'transparent',
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
