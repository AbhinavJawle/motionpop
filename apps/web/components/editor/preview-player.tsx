'use client';

import { compileProject } from '@motionpop/motion/compiler';
import { FORMATS } from '@motionpop/schemas';
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadCompositionAssets } from '@/lib/composition/assets';
import { previewCompileInput } from '@/lib/composition/project-to-compile';
import { attachPreview, resyncPreview, seekPreview } from '@/lib/editor/preview-bridge';
import { useEditor } from '@/lib/stores/editor';

type PlayerEl = HTMLElement & { seek(seconds: number): void; ready?: boolean };

const RECOMPILE_DEBOUNCE_MS = 150;

/**
 * The HyperFrames player showing the compiled project (spec 04 R3.3). Muted: the editor plays
 * the voiceover itself. Recompiles 150 ms after slots, params, format or style change.
 * Library-only compositions use the player's default sandbox (D-021).
 */
export function PreviewPlayer({ onError }: { onError?: (message: string) => void }) {
  const ref = useRef<PlayerEl | null>(null);
  const project = useEditor((s) => s.project);
  const playheadMs = useEditor((s) => s.playheadMs);
  const [assetsError, setAssetsError] = useState<string | null>(null);

  // Only what the composition depends on: title renames and selection don't recompile.
  const input = useMemo(() => (project ? previewCompileInput(project) : null), [project]);
  const key = useMemo(() => (input ? JSON.stringify(input) : ''), [input]);

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
      loadCompositionAssets()
        .then((assets) => {
          if (cancelled || !ref.current) return;
          ref.current.setAttribute('srcdoc', compileProject(input, assets));
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
