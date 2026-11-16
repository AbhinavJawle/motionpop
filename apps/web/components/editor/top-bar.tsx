'use client';

import type { Format } from '@motionpop/schemas';
import { ChevronDown, ChevronLeft, History, Pencil, Redo2, Undo2, Upload } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PipAvatar } from '@/components/pip/pip-avatar';
import { AccountMenu } from '@/components/settings/account-menu';
import { BrandKitChip } from '@/components/ui/brand-kit-chip';
import { Button } from '@/components/ui/button';
import { CreditsChip } from '@/components/ui/credits-chip';
import { SegmentedPills } from '@/components/ui/segmented-pills';
import { Tooltip } from '@/components/ui/tooltip';
import { renameProject, setFormat } from '@/lib/commands';
import { cn } from '@/lib/cn';
import { useCreditsBalance } from '@/lib/credits/use-credits-client';
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

/** Editor top bar (editor.png; "Top bar" in design/figma-export.css): 56 px. */
export function TopBar() {
  const title = useEditor((s) => s.project?.title ?? '');
  const format = useEditor((s) => s.project?.format ?? '16:9');
  const canUndo = useEditor(selectCanUndo);
  const canRedo = useEditor(selectCanRedo);
  const exec = useEditor((s) => s.exec);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const balance = useCreditsBalance();

  return (
    <header className="relative flex h-14 shrink-0 items-center border-b border-white/6 bg-raised-grad pr-[28px] pl-5">
      <Link href="/dashboard" className="flex items-center gap-[7px]" aria-label="motionpop home">
        <PipAvatar size={24} ring={false} />
        <span className="text-[19px] leading-[25px] font-semibold tracking-[-0.2px]">
          motionpop
        </span>
      </Link>
      <span aria-hidden className="mr-4 ml-6 h-5 w-px bg-line-strong" />
      <Link
        href="/dashboard"
        className="flex items-center gap-1 text-xs leading-4 text-text-2 transition-colors hover:text-text"
      >
        <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden />
        Home
      </Link>
      <ProjectTitle
        title={title}
        onRename={(next) => {
          if (next !== title) exec(renameProject(next));
        }}
      />

      <div className="absolute left-1/2 -translate-x-1/2 -ml-4">
        <SegmentedPills
          label="Video format"
          options={FORMATS}
          value={format}
          onChange={(next) => {
            if (next !== format) exec(setFormat(next));
          }}
        />
      </div>

      <div className="ml-auto flex items-center">
        <div className="flex items-center gap-[15px]">
          <IconAction label="Undo" shortcut="⌘Z" disabled={!canUndo} onClick={undo}>
            <Undo2 className="size-[18px]" strokeWidth={1.5} />
          </IconAction>
          <IconAction label="Redo" shortcut="⇧⌘Z" disabled={!canRedo} onClick={redo}>
            <Redo2 className="size-[18px]" strokeWidth={1.5} />
          </IconAction>
          <IconAction label="Version history" onClick={showVersions}>
            <History className="size-[18px]" strokeWidth={1.5} />
          </IconAction>
        </div>
        <BrandKitChip className="ml-[19px]" onClick={() => toast('Brand kit is on its way.')} />
        <CreditsChip
          className="ml-3"
          credits={balance}
          onClick={() => openSettingsPanel('credits')}
        />
        <ExportButton />
        <span className="ml-5">
          <AccountMenu onOpenSettings={() => openSettingsPanel(null)} />
        </span>
      </div>
    </header>
  );
}

/**
 * "Export button" (editor.png). While a render runs it takes the status look of the dashboard's
 * "Rendering 64%" chip (violet ring, spinner) and a click reopens the progress (spec 08 R4.4).
 */
function ExportButton() {
  const view = useExportUi((s) => s.view);
  const starting = useExportUi((s) => s.starting);
  const rendering = starting || isActive(view?.status);
  if (!rendering) {
    return (
      <Button
        variant="primary"
        size="lg"
        className="ml-3 h-9 w-[114px] gap-0 pr-3 pl-[13px]"
        onClick={() => exportStore.getState().openFromButton()}
      >
        <Upload className="size-4" strokeWidth={1.5} aria-hidden />
        <span className="ml-2.5">Export</span>
        <ChevronDown className="ml-auto size-3" strokeWidth={1.5} aria-hidden />
      </Button>
    );
  }
  const percent = view?.progress ?? 0;
  return (
    <Button
      variant="secondary"
      size="lg"
      className="ml-3 h-9 w-[114px] gap-0 border border-violet pl-[13px] shadow-violet"
      aria-label={`Rendering ${percent}%. Open export progress`}
      onClick={() => exportStore.getState().openFromButton()}
    >
      <span
        aria-hidden
        className="size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-violet/30 border-t-violet motion-reduce:animate-none"
      />
      <span className="ml-2.5 whitespace-nowrap">
        Rendering <span className="tabular font-mono">{percent}%</span>
      </span>
    </Button>
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
        className="text-text-2 transition-colors hover:text-text disabled:text-text-4 disabled:hover:text-text-4"
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
    <div className="ml-8 flex items-center gap-3">
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
          className="h-7 w-56 rounded-lg bg-card px-2 text-sm leading-[18px] font-medium text-text shadow-glass outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(title);
            setEditing(true);
          }}
          className={cn('group flex items-center gap-3 text-sm leading-[18px] font-medium')}
          aria-label={`Rename project, ${title}`}
        >
          <span className="max-w-64 truncate">{title}</span>
          <Pencil
            className="size-3.5 text-text-2 transition-colors group-hover:text-text"
            strokeWidth={1.5}
            aria-hidden
          />
        </button>
      )}
    </div>
  );
}
