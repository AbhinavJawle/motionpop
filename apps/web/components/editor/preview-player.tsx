'use client';

import { compileProject } from '@motionpop/motion/compiler';
import { FORMATS, activePunchIn, cleanedToSourceMs, keptSourceSegments } from '@motionpop/schemas';
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
import { editorStore, useEditor } from '@/lib/stores/editor';

type PlayerEl = HTMLElement & { seek(seconds: number): void; ready?: boolean };

const RECOMPILE_DEBOUNCE_MS = 150;
const VIDEO_DRIFT_SEC = 0.14;

/**
 * The HyperFrames player showing the compiled project (spec 04 R3.3), layered over the live
 * cut/zoomed `<video>` element when `project.video` is present (spec 18 R5). Muted: the editor
 * plays the cleaned voiceover track itself as the master clock.
 */
export function PreviewPlayer({ onError }: { onError?: (message: string) => void }) {
  const ref = useRef<PlayerEl | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const project = useEditor((s) => s.project);
  const playheadMs = useEditor((s) => s.playheadMs);
  const playing = useEditor((s) => s.playing);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [loadedVideo, setLoadedVideo] = useState<{ src: string; url: string } | null>(null);

  const videoSrc = project?.video?.src ?? null;
  const videoUrl = videoSrc && loadedVideo?.src === videoSrc ? loadedVideo.url : null;

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

  // Synchronize `<video>` source clock (skipping enabled cuts) and punch-in zoom on every tick.
  useEffect(() => {
    if (!videoUrl) return;
    return subscribePreviewSeek((ms) => {
      const el = videoRef.current;
      const vid = editorStore.getState().project?.video;
      if (!el || !vid) return;
      const segments = keptSourceSegments(vid.originalDurationMs, vid.cuts);
      const targetSec = cleanedToSourceMs(ms, segments) / 1000;
      const isPlaying = editorStore.getState().playing;
      if (el.readyState >= 1) {
        if (!isPlaying || Math.abs(el.currentTime - targetSec) > VIDEO_DRIFT_SEC) {
          el.currentTime = targetSec;
        }
      }
      const punch = activePunchIn(ms, vid.punchIns);
      if (punch) {
        el.style.transformOrigin = `${Math.round(punch.focusX * 100)}% ${Math.round(punch.focusY * 100)}%`;
        el.style.transform = `scale(${punch.scale})`;
      } else {
        el.style.transformOrigin = '50% 50%';
        el.style.transform = 'scale(1)';
      }
    });
  }, [videoUrl]);

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
        <video
          ref={videoRef}
          src={videoUrl}
          muted
          playsInline
          preload="auto"
          data-testid="preview-video-layer"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-transform duration-200 ease-out"
        />
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
