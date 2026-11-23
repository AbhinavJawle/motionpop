import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import s from './paper.module.css';

/** Spec 35 paper kit: the class names, for the odd place a component needs one directly. */
export const paper = s;

type Tone = 'ink' | 'paper' | 'flame';
type Size = 'sm' | 'md' | 'lg';

/** Classes for a button that presses into its ink shadow. */
export function btn(tone: Tone = 'ink', size: Size = 'md', onInk = false, className?: string) {
  return cn(s.btn, s[tone], size !== 'md' && s[size], onInk && s.onInk, className);
}

/** Poster type (Bebas Neue, uppercase, line-height 0.9) for titles and big numbers. */
export const poster = s.poster;

/**
 * Marks a screen as paper (spec 35 R1.2): the shared tokens turn to paper and ink for the whole
 * document while it is mounted. Body text is Geist Mono, like a typed script.
 */
export function PaperPage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-paper
      className={cn(
        s.desk,
        'min-h-dvh bg-paper font-mono text-[14px] leading-[1.6] text-ink',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The plush Pip mark beside the wordmark. */
export function PipMark({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- a tiny static mark
  return <img src="/pip/plush.webp" alt="" aria-hidden className={cn('h-8 w-auto', className)} />;
}

/** Pip's handwritten speech bubble. Decorative unless it carries the only copy. */
export function Bubble({
  children,
  right = false,
  className,
}: {
  children: ReactNode;
  right?: boolean;
  className?: string;
}) {
  return <span className={cn(s.bubble, right && s.bubbleRight, className)}>{children}</span>;
}

/** A strip of film sprockets (top or bottom edge of a frame). */
export function Sprockets({ className }: { className?: string }) {
  return <div aria-hidden className={cn(s.sprockets, className)} />;
}
