'use client';

import { compileProject, thumbnailTimeMs } from '@motionpop/motion/compiler';
import { FORMATS, msToFrame, type EditorProject, type Format } from '@motionpop/schemas';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { loadCompositionAssets } from '@/lib/composition/assets';
import { projectCompileInput } from '@/lib/composition/project-to-compile';

type PlayerEl = HTMLElement & { seek(seconds: number): void };

/** The largest size with the format's ratio that fits the box (a letterbox for 9:16 and 1:1). */
export function fitBox(
  format: Format,
  boxW: number,
  boxH: number,
): { width: number; height: number } {
  const size = FORMATS[format];
  const scale = Math.min(boxW / size.width, boxH / size.height);
  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
}

/**
 * A paused still of the video in `format`, at the first rendered slot's key moment (the moment
 * `thumb.jpg` is taken at). The same compiled preview as the editor, in a paused HyperFrames
 * player (library-only composition, default sandbox, D-021). Only the video frame: the editor's
 * "Ready in 4.2s" badge and frame notes are chrome, not part of the video (design §13.1).
 */
export function VideoStill({
  project,
  format,
  boxW,
  boxH,
  className,
  radius,
}: {
  project: EditorProject;
  format: Format;
  boxW: number;
  boxH: number;
  className?: string;
  radius: number;
}) {
  const ref = useRef<PlayerEl | null>(null);
  const [failed, setFailed] = useState(false);
  const input = useMemo(
    () => projectCompileInput(project, { mode: 'preview', format }),
    [project, format],
  );
  const key = useMemo(() => JSON.stringify(input), [input]);
  const atMs = useMemo(
    () => thumbnailTimeMs(input.slots, project.durationMs),
    [input, project.durationMs],
  );
  const size = fitBox(format, boxW, boxH);
  const dim = FORMATS[format];

  useEffect(() => {
    void import('@hyperframes/player');
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const seek = () => {
      if (typeof el.seek === 'function') el.seek(msToFrame(atMs, 30) / 30);
    };
    el.addEventListener('ready', seek);
    loadCompositionAssets()
      .then((assets) => {
        if (cancelled) return;
        el.setAttribute('srcdoc', compileProject(input, assets));
        setFailed(false);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      el.removeEventListener('ready', seek);
    };
    // `key` captures every input change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, atMs]);

  return (
    <div
      className={cn(
        'relative flex items-center justify-center overflow-hidden bg-frame',
        className,
      )}
      style={{ width: boxW, height: boxH, borderRadius: radius }}
      data-testid="video-still"
    >
      <div style={{ width: size.width, height: size.height }} className="relative overflow-hidden">
        <hyperframes-player
          ref={ref}
          width={dim.width}
          height={dim.height}
          muted
          aria-label="Video still"
          style={{ display: 'block', width: '100%', height: '100%', background: 'transparent' }}
        />
      </div>
      {failed && <span className="absolute text-[9px] text-text-3">No preview</span>}
    </div>
  );
}
