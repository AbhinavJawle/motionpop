'use client';

import type { Slot, Version } from '@motionpop/schemas';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { restoreVersion } from '@/lib/commands';
import { styleFor } from '@/lib/composition/project-to-compile';
import {
  canPage,
  glyphKind,
  lastPageStart,
  pageStart,
  positionLabel,
  restorable,
  slotVersions,
  TILES_PER_PAGE,
  versionTitle,
  type GlyphKind,
} from '@/lib/inspector/versions-view';
import { useNow } from '@/lib/inspector/use-now';
import { editorStore, useEditor } from '@/lib/stores/editor';
import { Divider, SectionLabel } from './parts';

/**
 * VERSIONS (spec 09 R5): hairline at y499, label 9 px at y517, ‹ at x89, three 58×32 tiles from
 * x105 (8 px apart), › at x304 and "v3" in mono at x323. The current tile has the violet to
 * ember outline. A click restores a version in one undo step; versions of another component are
 * greyed. Tiles are glyphs from the look's colours (D-041).
 */
export function VersionsStrip({ slot }: { slot: Slot }) {
  const all = useEditor((s) => s.project?.versions);
  const versions = useMemo(
    () => (all ? slotVersions({ versions: all }, slot.id) : []),
    [all, slot.id],
  );
  const colors = useEditor((s) => (s.project ? styleFor(s.project).colors : null));
  const count = versions.length;
  const now = useNow();
  // The newest page, again whenever a version is added or dropped.
  const [seenCount, setSeenCount] = useState(count);
  const [start, setStart] = useState(lastPageStart(count));
  if (seenCount !== count) {
    setSeenCount(count);
    setStart(lastPageStart(count));
  }
  const shown = versions.slice(start, start + TILES_PER_PAGE);
  const label = positionLabel(versions, slot.currentVersionId);
  const older = canPage(start, count, 'older');
  const newer = canPage(start, count, 'newer');

  return (
    <section aria-label="Versions" data-inspector-versions>
      <Divider soft className="mt-2" />
      <div className="relative mt-[6px] h-8">
        <SectionLabel className="absolute top-[11px] left-0 text-[9px] leading-[12px]">
          Versions
        </SectionLabel>
        <PageButton
          dir="older"
          disabled={!older}
          onClick={() => setStart(pageStart(start, count, 'older'))}
        />
        <ul className="absolute top-0 left-[85px] flex gap-2" aria-label="Versions of this graphic">
          {shown.map((v) => (
            <li key={v.id}>
              <Tile slot={slot} version={v} colors={colors} now={now} />
            </li>
          ))}
        </ul>
        <PageButton
          dir="newer"
          disabled={!newer}
          onClick={() => setStart(pageStart(start, count, 'newer'))}
        />
        {label && (
          <span
            aria-label={`Current version ${label}`}
            className="tabular absolute top-[14px] left-[303px] font-mono text-[9px] leading-[12px] text-violet-ink-2"
          >
            {label}
          </span>
        )}
      </div>
    </section>
  );
}

function PageButton({
  dir,
  disabled,
  onClick,
}: {
  dir: 'older' | 'newer';
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = dir === 'older' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={dir === 'older' ? 'Older versions' : 'Newer versions'}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'absolute top-0 flex h-8 w-[14px] items-center justify-center text-text-2 transition-colors hover:text-text disabled:text-text-4 disabled:hover:text-text-4',
        dir === 'older' ? 'left-[64px]' : 'left-[279px]',
      )}
    >
      <Icon className="size-3.5" strokeWidth={1.5} aria-hidden />
    </button>
  );
}

type Colors = { chart: string[]; accent: string; ink: string } | null;

function Tile({
  slot,
  version,
  colors,
  now,
}: {
  slot: Slot;
  version: Version;
  colors: Colors;
  now: number;
}) {
  const current = version.id === slot.currentVersionId;
  const can = restorable(slot, version);
  const other = version.componentId !== slot.componentId;
  const title = versionTitle(version, now);
  return (
    <Tooltip content={other ? `${title} · another graphic` : title} side="top">
      <button
        type="button"
        aria-label={`${version.label ?? 'Version'}${current ? ' (current)' : ''}`}
        aria-current={current ? 'true' : undefined}
        disabled={!can}
        onClick={() => editorStore.getState().exec(restoreVersion(slot.id, version.id))}
        className={cn(
          'block h-8 w-[58px] rounded-md p-px transition-transform enabled:hover:-translate-y-px',
          current
            ? 'bg-[linear-gradient(90deg,var(--color-violet),var(--color-ember-pink)_70%,var(--color-ember))] shadow-[0_0_12px_rgb(139_124_255/0.15)]'
            : 'bg-transparent',
          other && 'opacity-40',
          !can && !current && 'cursor-not-allowed',
        )}
      >
        <span className="block size-full rounded-[5px] bg-card-3 shadow-glass">
          <Glyph kind={glyphKind(version.componentId)} colors={colors} />
        </span>
      </button>
    </Tooltip>
  );
}

/** The tile's picture at 58×32: three bars, two text lines, or two halves (from the look's colours). */
function Glyph({ kind, colors }: { kind: GlyphKind; colors: Colors }) {
  // The design's muted violet for the supporting shapes; the look only sets the accent.
  const muted = 'var(--color-glyph)';
  const muted2 = muted;
  const accent = colors?.accent ?? 'var(--color-ember)';
  return (
    <svg aria-hidden width="56" height="30" viewBox="0 0 58 32" className="block">
      {kind === 'bars' && (
        <>
          <rect x="8" y="16" width="10" height="10" rx="2" fill={muted} />
          <rect x="23" y="10" width="10" height="16" rx="2" fill={muted2} />
          <rect x="38" y="4" width="10" height="22" rx="2" fill={accent} />
        </>
      )}
      {kind === 'lines' && (
        <>
          <rect x="9" y="9" width="34" height="5" rx="2" fill={muted2} />
          <rect x="9" y="18" width="22" height="5" rx="2" fill={accent} />
        </>
      )}
      {kind === 'split' && (
        <>
          <rect x="8" y="6" width="19" height="19" rx="3" fill={muted} />
          <rect x="30" y="6" width="19" height="19" rx="3" fill={accent} />
        </>
      )}
    </svg>
  );
}
