'use client';

import type { Format } from '@motionpop/schemas';
import {
  ChevronDown,
  ChevronLeft,
  History,
  Moon,
  Pencil,
  Redo2,
  Sun,
  Undo2,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { btn, paper, PipMark } from '@/components/paper/kit';
import { AccountMenu } from '@/components/settings/account-menu';
import { BrandKitChip } from '@/components/ui/brand-kit-chip';
import { Tooltip } from '@/components/ui/tooltip';
import { renameProject, setFormat } from '@/lib/commands';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion/presets';
import { useCreditsBalance } from '@/lib/credits/use-credits-client';
import { toggleRailPanel } from '@/lib/editor/rail-panel';
import { useEditorTheme } from '@/lib/editor/theme';
import { SaveIndicator } from './preview-pane';
import { openSettingsPanel } from '@/lib/editor/settings-panel';
import { isActive } from '@/lib/renders/export-flow';
import { exportStore, useExportUi } from '@/lib/renders/export-store';
import { NO_SELECTION_TOAST, scrollToVersions } from '@/lib/inspector/versions-view';
import { editorStore, selectCanRedo, selectCanUndo, useEditor } from '@/lib/stores/editor';

const FORMATS: readonly { value: Format; label: string }[] = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
];

/** The history button (spec 09 R5.5): to VERSIONS in the inspector, or a hint when no graphic is selected. */
function showVersions() {
  const selected = editorStore.getState().selectedSlotId !== null;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!selected || !scrollToVersions(document, still)) toast(NO_SELECTION_TOAST);
}

/**
 * Editor top bar (spec 38 R1.2): the dashboard's black film-strip bar. Pip home, the breadcrumb in
 * poster type, the format switch, history, brand, credits, an ember Export and the account menu.
 */
export function TopBar() {
  const title = useEditor((s) => s.project?.title ?? '');
  const format = useEditor((s) => s.project?.format ?? '16:9');
  // The chip's dots show the project's brand colours once it has a brand kit.
  const brandAccent = useEditor((s) => s.project?.brand?.accent ?? null);
  const brandAccent2 = useEditor((s) => s.project?.brand?.accent2 ?? null);
  const brandDots = brandAccent
    ? ([brandAccent, brandAccent2 ?? brandAccent, '#ffffff'] as const)
    : (['var(--color-flame)', 'var(--color-pip)', '#ffffff'] as const);
  const canUndo = useEditor(selectCanUndo);
  const canRedo = useEditor(selectCanRedo);
  const exec = useEditor((s) => s.exec);
  const setRail = useEditor((s) => s.setRail);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const balance = useCreditsBalance();
  const theme = useEditorTheme((s) => s.theme);
  const toggleTheme = useEditorTheme((s) => s.toggle);

  return (
    <header
      data-ink-bar
      className={cn(paper.bar, 'relative flex h-14 shrink-0 items-center pr-3 pl-3')}
    >
      <Link
        href="/dashboard"
        aria-label="motionpop home"
        className="flex size-9 items-center justify-center rounded-lg transition-transform hover:-rotate-6"
      >
        <PipMark className="h-7" />
      </Link>
      <nav aria-label="Breadcrumb" className="ml-2 flex min-w-0 items-center gap-1.5">
        <Link
          href="/dashboard"
          className="flex items-center gap-0.5 rounded-md px-1 py-1 font-poster text-[19px] leading-none tracking-[0.02em] text-paper/60 uppercase transition-colors hover:text-paper"
        >
          <ChevronLeft className="size-4" strokeWidth={2} aria-hidden />
          Projects
        </Link>
        <span aria-hidden className="font-poster text-[19px] leading-none text-paper/35">
          /
        </span>
        <ProjectTitle
          title={title}
          onRename={(next) => {
            if (next !== title) exec(renameProject(next));
          }}
        />
      </nav>
      <span className="ml-3">
        <SaveIndicator onInk />
      </span>

      <div className="absolute left-1/2 -translate-x-1/2">
        <FormatSwitch
          value={format}
          onChange={(next) => {
            if (next !== format) exec(setFormat(next));
          }}
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="flex items-center gap-0.5">
          <IconAction label="Undo" shortcut="⌘Z" disabled={!canUndo} onClick={undo}>
            <Undo2 className="size-4" strokeWidth={1.75} />
          </IconAction>
          <IconAction label="Redo" shortcut="⇧⌘Z" disabled={!canRedo} onClick={redo}>
            <Redo2 className="size-4" strokeWidth={1.75} />
          </IconAction>
          <IconAction label="Version history" onClick={showVersions}>
            <History className="size-4" strokeWidth={1.75} />
          </IconAction>
          <IconAction label={theme === 'dark' ? 'Light mode' : 'Dark mode'} onClick={toggleTheme}>
            {theme === 'dark' ? (
              <Sun className="size-4" strokeWidth={1.75} />
            ) : (
              <Moon className="size-4" strokeWidth={1.75} />
            )}
          </IconAction>
        </div>
        <span aria-hidden className="mx-1 h-5 w-px bg-paper/20" />
        <BrandKitChip
          colors={brandDots}
          className="bg-transparent text-paper/75 shadow-none ring-1 ring-paper/25 hover:bg-paper/10 hover:text-paper"
          onClick={() => {
            toggleRailPanel('brand');
            setRail('brand');
          }}
        />
        <button
          type="button"
          onClick={() => openSettingsPanel('credits')}
          aria-label={balance === null ? 'Credits loading' : `${balance} credits`}
          className="h-8 rounded-lg px-2 font-mono text-[12px] text-paper/70 transition-colors hover:text-paper"
        >
          <span className="font-poster text-[22px] leading-none tracking-[0.02em] text-paper tabular">
            {balance ?? '–'}
          </span>{' '}
          credits
        </button>
        <ExportButton />
        <span className="ml-1">
          <AccountMenu size={30} onOpenSettings={() => openSettingsPanel(null)} />
        </span>
      </div>
    </header>
  );
}

/** 16:9 · 9:16 · 1:1 as ink segments: the chosen one is a white tile (spec 38). */
function FormatSwitch({ value, onChange }: { value: Format; onChange: (next: Format) => void }) {
  const layoutId = useId();
  return (
    <div
      role="radiogroup"
      aria-label="Video format"
      className="flex h-9 items-center gap-0.5 rounded-[10px] p-[3px] ring-1 ring-paper/25"
    >
      {FORMATS.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative h-[28px] min-w-[54px] rounded-[7px] px-3 font-poster text-[19px] leading-none tracking-[0.03em] transition-colors',
              selected ? 'text-ink' : 'text-paper/60 hover:text-paper',
            )}
          >
            {selected && (
              <motion.span
                layoutId={layoutId}
                transition={spring}
                className="absolute inset-0 rounded-[7px] bg-paper"
              />
            )}
            <span className="relative top-[1px]">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Export (spec 38): the ember button that presses into its shadow, like "New project". While a
 * render runs it shows the progress and a click reopens it (spec 08 R4.4).
 */
function ExportButton() {
  const view = useExportUi((s) => s.view);
  const starting = useExportUi((s) => s.starting);
  const rendering = starting || isActive(view?.status);
  if (!rendering) {
    return (
      <button
        type="button"
        className={btn('flame', 'sm', true, 'h-9 gap-2 pr-2.5 pl-3')}
        onClick={() => exportStore.getState().openFromButton()}
      >
        <Upload className="size-3.5" strokeWidth={2} aria-hidden />
        Export
        <ChevronDown className="size-3.5" strokeWidth={2} aria-hidden />
      </button>
    );
  }
  const percent = view?.progress ?? 0;
  return (
    <button
      type="button"
      className={btn('ink', 'sm', true, 'h-9 gap-2.5 pl-3')}
      aria-label={`Rendering ${percent}%. Open export progress`}
      onClick={() => exportStore.getState().openFromButton()}
    >
      <span
        aria-hidden
        className="size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-paper/30 border-t-flame motion-reduce:animate-none"
      />
      <span className="whitespace-nowrap">
        Rendering <span className="tabular">{percent}%</span>
      </span>
    </button>
  );
}

function IconAction({
  label,
  shortcut,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip content={shortcut ? `${label} ${shortcut}` : label}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className="flex size-8 items-center justify-center rounded-md text-paper/70 transition-colors hover:bg-paper/10 hover:text-paper disabled:text-paper/25 disabled:hover:bg-transparent"
      >
        {children}
      </button>
    </Tooltip>
  );
}

export function ProjectTitle({
  title,
  onRename,
}: {
  title: string;
  onRename: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next) onRename(next);
    else setDraft(title);
  };

  return (
    <div className="flex min-w-0 items-center">
      {editing ? (
        <input
          ref={inputRef}
          aria-label="Project title"
          value={draft}
          maxLength={80}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft(title);
              setEditing(false);
            }
          }}
          className="h-8 w-64 rounded-md bg-paper px-2 font-poster text-[21px] leading-none tracking-[0.02em] text-ink uppercase outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(title);
            setEditing(true);
          }}
          className={cn(
            'group flex h-8 items-center gap-2 rounded-md px-1.5 font-poster text-[22px] leading-none tracking-[0.02em] text-paper uppercase transition-colors hover:bg-paper/10',
          )}
          aria-label={`Rename project, ${title}`}
        >
          <span className="relative top-[1px] max-w-72 truncate">{title}</span>
          <Pencil
            className="size-3.5 text-paper/60 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            strokeWidth={1.5}
            aria-hidden
          />
        </button>
      )}
    </div>
  );
}
