'use client';

import type { Word } from '@motionpop/schemas';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { msToX } from '@/lib/timeline/geometry';
import { selectSelectedSlot, selectWords, useEditor } from '@/lib/stores/editor';
import { useFrame, useTimeline } from './timeline-context';

/** Above this many words only the visible range is rendered (spec 04 NFR). */
const VIRTUALIZE_ABOVE = 600;

/** Index of the word being spoken at `ms` (the last word that started), or -1. */
export function currentWordIndex(words: ReadonlyArray<Word>, ms: number): number {
  let lo = 0;
  let hi = words.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((words[mid]?.startMs ?? 0) <= ms) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/**
 * WORDS track, karaoke style (spec 04 R4.3): spoken words `text-2`, the current word bright
 * with an ember underline glow, upcoming words dim. The selected slot's words sit on one
 * continuous violet band. Word states are written as data attributes every frame.
 */
export function WordsTrack() {
  const { view, widthPx, clock } = useTimeline();
  const words = useEditor(selectWords);
  const selected = useEditor(selectSelectedSlot);
  const spans = useRef<Array<HTMLButtonElement | null>>([]);
  const underline = useRef<HTMLSpanElement>(null);
  const lastIndex = useRef(-2);

  const visible = useMemo(() => {
    if (words.length <= VIRTUALIZE_ABOVE) return words;
    const from = view.scrollMs - 2000;
    const to = view.scrollMs + widthPx / view.pxPerMs + 2000;
    return words.filter((w) => w.endMs >= from && w.startMs <= to);
  }, [words, view, widthPx]);

  const apply = (ms: number) => {
    const i = currentWordIndex(words, ms);
    const active = i >= 0 && ms < (words[i]?.endMs ?? 0) + 250 ? i : -1;
    if (active === lastIndex.current) return;
    lastIndex.current = active;
    const pivot = active >= 0 ? active : i;
    for (const w of visible) {
      const el = spans.current[w.i];
      if (!el) continue;
      el.dataset.state = w.i === active ? 'current' : w.i <= pivot ? 'spoken' : 'upcoming';
    }
    const u = underline.current;
    const el = active >= 0 ? spans.current[active] : null;
    if (u) {
      if (el) {
        u.style.opacity = '1';
        u.style.left = `${el.offsetLeft}px`;
        u.style.width = `${el.offsetWidth}px`;
      } else u.style.opacity = '0';
    }
  };
  useFrame(apply);

  // Newly mounted spans (zoom, scroll, virtualisation) start as "upcoming": re-apply.
  useLayoutEffect(() => {
    lastIndex.current = -2;
    apply(clock.currentMs);
  });

  // The selected slot's band: 5 px before its first word to 6 px after its last word's text.
  const band = useRef<HTMLSpanElement>(null);
  const bandFrom = selected?.wordStart;
  const bandTo = selected?.wordEnd;
  useLayoutEffect(() => {
    const el = band.current;
    if (!el) return;
    const a = bandFrom === undefined ? null : spans.current[bandFrom];
    const b = bandTo === undefined ? null : spans.current[bandTo];
    if (!a || !b) {
      el.style.display = 'none';
      return;
    }
    const left = a.offsetLeft - 5;
    el.style.display = 'block';
    el.style.left = `${left}px`;
    el.style.width = `${b.offsetLeft + b.offsetWidth + 6 - left}px`;
  }, [bandFrom, bandTo, view, visible]);

  if (words.length === 0) {
    return (
      <p className="absolute top-1/2 left-4 -translate-y-1/2 text-[11px] text-text-3">
        No transcript yet.
      </p>
    );
  }

  return (
    <>
      <span ref={band} aria-hidden className="absolute top-1.5 hidden h-8 rounded-md bg-violet/12" />
      {visible.map((w) => (
        <button
          key={w.i}
          ref={(el) => {
            spans.current[w.i] = el;
          }}
          type="button"
          tabIndex={-1}
          data-state="upcoming"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => clock.seek(w.startMs)}
          className="absolute top-[15px] text-[13px] leading-[17px] whitespace-nowrap text-text-3 transition-colors duration-150 hover:text-text data-[state=current]:text-text data-[state=spoken]:text-text-2"
          style={{ left: msToX(w.startMs, view) }}
        >
          {w.text}
        </button>
      ))}
      <span
        ref={underline}
        aria-hidden
        className="pointer-events-none absolute top-[35px] h-0.5 rounded-full bg-ember/90 opacity-0 shadow-[0_0_7px_rgb(255_122_61/0.4)] transition-[left,width] duration-100"
      />
    </>
  );
}
