'use client';

import { compileProject } from '@motionpop/motion/compiler';
import { FORMATS } from '@motionpop/schemas';
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadCompositionAssets } from '@/lib/composition/assets';
import {
  previewCompileInput,
  previewImages,
  previewImagesKey,
} from '@/lib/composition/project-to-compile';
import { attachPreview, resyncPreview, seekPreview } from '@/lib/editor/preview-bridge';
import { editorStore, useEditor } from '@/lib/stores/editor';

type PlayerEl = HTMLElement & { seek(seconds: number): void; ready?: boolean };

const RECOMPILE_DEBOUNCE_MS = 150;

/**
 * The HyperFrames player showing the compiled project (spec 04 R3.3). Muted: the editor plays
 * the voiceover itself. Recompiles 150 ms after slots, params, format or style change.
 * Library-only compositions use the player's default sandbox; any custom graphic switches it to an
 * opaque origin (D-021, spec 15). Frame-note crops can't read an opaque frame and go without one.
 */
export function PreviewPlayer({ onError }: { onError?: (message: string) => void }) {
  const ref = useRef<PlayerEl | null>(null);
  const project = useEditor((s) => s.project);
  const playheadMs = useEditor((s) => s.playheadMs);
  const [assetsError, setAssetsError] = useState<string | null>(null);

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
      <hyperframes-player
        ref={ref}
        width={size.width}
        height={size.height}
        muted
        aria-label="Video preview"
        style={{ display: 'block', width: '100%', height: '100%', background: 'transparent' }}
      />
      {assetsError && (
        <p className="absolute inset-x-6 bottom-6 rounded-chip bg-glass px-3 py-2 text-[11px] text-text-2 shadow-glass">
          Preview unavailable: {assetsError}
        </p>
      )}
    </>
  );
}
