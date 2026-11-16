'use client';

import { useMemo } from 'react';
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown';
import { Tooltip } from '@/components/ui/tooltip';
import { styleFor } from '@/lib/composition/project-to-compile';
import { setStyle } from '@/lib/commands';
import { styleOptions } from '@/lib/inspector/timing-view';
import { editorStore, useEditor } from '@/lib/stores/editor';
import { SectionLabel } from './parts';

/**
 * The look as a 38×24 tile with three bars (design: "Bar chart version" in the Style row): two
 * muted from the look's chart colours and the accent, at the design's positions.
 */
export function StyleSwatch({ colors }: { colors: { chart: string[]; accent: string } }) {
  const bars = [
    { c: colors.chart[0], h: 3.8 },
    { c: colors.chart[1] ?? colors.chart[0], h: 5.8 },
    { c: colors.accent, h: 8 },
  ];
  return (
    <span
      aria-hidden
      className="flex h-6 w-[38px] shrink-0 items-end gap-[2px] rounded-md bg-card-3 pb-[7px] pl-[9px] shadow-glass"
    >
      {bars.map((b, i) => (
        <span
          key={i}
          className="w-[4.67px] rounded-[2px]"
          style={{ height: b.h, background: b.c }}
        />
      ))}
    </span>
  );
}

/**
 * STYLE (spec 09 R3): label y397, swatch 38×24 at x80, the look's name 11/14 `style-ink`,
 * chevron at x325. A pick applies to the whole video with `SetStyle`, one undo step (D-036).
 */
export function StyleRow() {
  const styleId = useEditor((s) => s.project?.styleId ?? '');
  const current = useEditor((s) => (s.project ? styleFor(s.project) : null));
  const options = useMemo<DropdownOption<string>[]>(
    () =>
      styleOptions().map((s) => ({
        value: s.id,
        label: s.name,
        icon: <StyleSwatch colors={s.colors} />,
      })),
    [],
  );
  // A project saved with a look we no longer ship still shows the look it renders with.
  const value = options.some((o) => o.value === styleId) ? styleId : (current?.id ?? styleId);
  return (
    <div className="mt-5 flex h-6 items-center">
      <SectionLabel className="w-14 shrink-0">Style</SectionLabel>
      <Tooltip content="Applies to the whole video" side="top" className="min-w-0 flex-1">
        <Dropdown
          label="Style"
          value={value}
          options={options}
          className="w-full"
          menuClassName="max-h-64 overflow-y-auto"
          onChange={(id) => {
            if (id !== value) editorStore.getState().exec(setStyle(id));
          }}
        />
      </Tooltip>
    </div>
  );
}
