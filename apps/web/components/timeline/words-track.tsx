'use client';

import type { Word } from '@motionpop/schemas';
import { useLayoutEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { addSlot } from '@/lib/commands';
import { msToX, xToMs } from '@/lib/timeline/geometry';
import { draftedSlotForWords } from '@/lib/timeline/add-graphic';
import { declutterWords, estimateText, type MeasureText } from '@/lib/timeline/declutter';
import { editorStore, selectSelectedSlot, selectWords, useEditor } from '@/lib/stores/editor';
import { useFrame, useTimeline } from './timeline-context';

/** Above this many words only the visible range is rendered (spec 04 NFR). */
const VIRTUALIZE_ABOVE = 600;

/** Real text widths for the words track (13 px, the body font), cached per text. */
function createMeasure(): MeasureText {
  if (typeof document === 'undefined') return estimateText;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return estimateText;
  ctx.font = `13px ${getComputedStyle(document.body).fontFamily}`;
  const cache = new Map<string, number>();
  return (text) => {
    let w = cache.get(text);
    if (w === undefined) {
      w = ctx.measureText(text).width;
      cache.set(text, w);
    }
    return w;
  };
}
let sharedMeasure: MeasureText | undefined;

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
    let inView: ReadonlyArray<Word> = words;
    if (words.length > VIRTUALIZE_ABOVE) {
      const from = view.scrollMs - 2000;
      const to = view.scrollMs + widthPx / view.pxPerMs + 2000;
      inView = words.filter((w) => w.endMs >= from && w.startMs <= to);
    }
    // Zoomed far out, draw a readable sample instead of overlapping text.
    sharedMeasure ??= createMeasure();
    return declutterWords(inView, view, sharedMeasure);
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

  // Shift-drag across words → a suggested slot spanning them (R6.2, "Add graphic here").
  const createBand = useRef<HTMLSpanElement>(null);
  const suppressClick = useRef(false);
  const showCreateBand = (a: number, b: number | null) => {
    const el = createBand.current;
    if (!el) return;
    const first = words[Math.min(a, b ?? a)];
    const last = words[Math.max(a, b ?? a)];
    if (b === null || !first || !last) {
      el.style.display = 'none';
      return;
    }
    const v = editorStore.getState().view;
    const lastSpan = spans.current[last.i];
    const left = msToX(first.startMs, v) - 5;
    const right = lastSpan ? lastSpan.offsetLeft + lastSpan.offsetWidth + 6 : msToX(last.endMs, v);
    el.style.display = 'block';
    el.style.left = `${left}px`;
    el.style.width = `${right - left}px`;
  };
  const startCreate = (e: ReactPointerEvent<HTMLButtonElement>, anchor: number) => {
    e.preventDefault();
    const el = e.currentTarget;
    const area = el.closest<HTMLElement>('[data-time-area]');
    const pointerId = e.pointerId;
    el.setPointerCapture(pointerId);
    suppressClick.current = true;
    let hovered = anchor;
    showCreateBand(anchor, anchor);
    const onMove = (ev: PointerEvent) => {
      if (!area) return;
      const ms = xToMs(ev.clientX - area.getBoundingClientRect().left, editorStore.getState().view);
      const i = Math.max(0, currentWordIndex(words, ms));
      if (i !== hovered) {
        hovered = i;
        showCreateBand(anchor, i);
      }
    };
    const finish = (commit: boolean) => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
      showCreateBand(anchor, null);
      // The click that follows this pointerup must not seek.
      setTimeout(() => (suppressClick.current = false), 0);
      if (!commit) return;
      const st = editorStore.getState();
      if (!st.project) return;
      const id = `slot-${crypto.randomUUID().slice(0, 8)}`;
      const slot = draftedSlotForWords(st.project, anchor, hovered, id, document);
      if (!slot)
        return st.reject(
          'Add graphic',
          'Those words already have a graphic, or there’s no room for one.',
        );
      if (st.exec(addSlot(slot))) st.select(id);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
  };

  if (words.length === 0) {
    return (
      <p className="absolute top-1/2 left-4 -translate-y-1/2 text-[11px] text-text-3">
        No transcript yet.
      </p>
    );
  }

  return (
    <>
      <span
        ref={band}
        aria-hidden
        className="absolute top-1 hidden h-[26px] rounded-md bg-violet/12"
      />
      <span
        ref={createBand}
        aria-hidden
        className="pointer-events-none absolute top-1 z-[1] hidden h-[26px] rounded-md border border-dashed border-violet/70 bg-violet/10"
      >
        <span className="absolute -top-[19px] left-0 rounded-full bg-violet px-2 py-px text-[9px] leading-3 font-medium whitespace-nowrap text-[#fff] shadow-violet-glow">
          ✦ Add graphic here
        </span>
      </span>
      {visible.map((w) => (
        <button
          key={w.i}
          ref={(el) => {
            spans.current[w.i] = el;
          }}
          type="button"
          tabIndex={-1}
          data-state="upcoming"
          onPointerDown={(e) => {
            e.stopPropagation();
            if (e.shiftKey && e.button === 0) startCreate(e, w.i);
          }}
          onClick={() => {
            if (!suppressClick.current) clock.seek(w.startMs);
          }}
          className="absolute top-[8px] font-sans text-[13px] leading-[17px] whitespace-nowrap text-text-3 transition-colors duration-150 hover:text-text data-[state=current]:text-text data-[state=spoken]:text-text-2"
          style={{ left: msToX(w.startMs, view) }}
        >
          {w.text}
        </button>
      ))}
      <span
        ref={underline}
        aria-hidden
        className="pointer-events-none absolute top-[27px] h-0.5 rounded-full bg-ember/90 opacity-0 transition-[left,width] duration-100"
      />
    </>
  );
}
