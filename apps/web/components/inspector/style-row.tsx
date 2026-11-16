'use client';

import { ChevronDown } from 'lucide-react';
import { styleFor } from '@/lib/composition/project-to-compile';
import { useEditor } from '@/lib/stores/editor';
import { SectionLabel } from './parts';

/** The colours of the look as a 38×24 tile with three dots (design: "Bar chart version" in the Style row). */
export function StyleSwatch() {
  const colors = useEditor((s) => (s.project ? styleFor(s.project).colors : null));
  const dots = colors ? [colors.chart[0], colors.chart[1], colors.accent] : [];
  return (
    <span
      aria-hidden
      className="flex h-6 w-[38px] items-end justify-center gap-[2px] rounded-md bg-card-3 pb-[7px] shadow-glass"
    >
      {dots.map((c, i) => (
        <span
          key={i}
          className="rounded-sm"
          style={{ width: 5, height: [4, 6, 8][i], background: c }}
        />
      ))}
    </span>
  );
}

/** STYLE: label y397, swatch 38×24 at x80, name 11/14 `style-ink`, chevron at x325 (task 14 adds the dropdown). */
export function StyleRow() {
  const name = useEditor((s) => (s.project ? styleFor(s.project).name : ''));
  return (
    <div className="mt-5 flex h-6 items-center">
      <SectionLabel className="w-[60px]">Style</SectionLabel>
      <StyleSwatch />
      <span className="ml-[10px] flex-1 text-[11px] leading-[14px] text-style-ink">{name}</span>
      <ChevronDown className="size-3 text-text-2" strokeWidth={1.5} aria-hidden />
    </div>
  );
}
