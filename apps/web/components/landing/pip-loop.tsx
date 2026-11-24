'use client';

import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/cn';
import { useStill } from '@/lib/motion/use-still';

export type PipLoopName = 'clapper' | 'juggle' | 'plane' | 'caption' | 'sound' | 'craft' | 'sketch';

/** Whether this browser shows VP9 alpha (Chrome, Edge, Firefox). Safari plays the file opaque. */
function playsAlphaWebm(): boolean {
  const ua = navigator.userAgent;
  const safari = /safari/i.test(ua) && !/chrome|chromium|crios|edg|fxios|android/i.test(ua);
  if (safari) return false;
  return document.createElement('video').canPlayType('video/webm; codecs="vp9"') !== '';
}

const noop = () => () => undefined;

/**
 * One of Pip's animated loops (spec 34): a transparent WebM rendered from a Rive project (the
 * founder's, or `rive/pip-plane` for the paper plane), with its first frame as a still for reduced
 * motion and browsers without alpha video.
 * Decorative: the copy around it carries the meaning.
 */
export function PipLoop({ name, className }: { name: PipLoopName; className?: string }) {
  const still = useStill();
  // False on the server and during hydration (the still), then the browser's real answer.
  const alpha = useSyncExternalStore(noop, playsAlphaWebm, () => false);

  if (still || !alpha) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a small static still
      <img
        src={`/pip/${name}.webp`}
        alt=""
        aria-hidden
        className={cn('object-contain', className)}
        draggable={false}
      />
    );
  }
  return (
    <video
      className={cn('object-contain', className)}
      src={`/pip/${name}.webm`}
      poster={`/pip/${name}.webp`}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden
      tabIndex={-1}
      disablePictureInPicture
    />
  );
}
