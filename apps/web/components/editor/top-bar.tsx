'use client';

import type { Format } from '@motionpop/schemas';
import { ChevronDown, ChevronLeft, History, Pencil, Redo2, Undo2, Upload } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PipAvatar } from '@/components/pip/pip-avatar';
import { BrandKitChip } from '@/components/ui/brand-kit-chip';
import { Button } from '@/components/ui/button';
import { CreditsChip } from '@/components/ui/credits-chip';
import { SegmentedPills } from '@/components/ui/segmented-pills';
import { Tooltip } from '@/components/ui/tooltip';
import { renameProject, setFormat } from '@/lib/commands';
import { cn } from '@/lib/cn';
import { selectCanRedo, selectCanUndo, useEditor } from '@/lib/stores/editor';

const FORMATS: readonly { value: Format; label: string }[] = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
];

/** Placeholder until credits are wired to Firestore (spec 13). */
const CREDITS_PLACEHOLDER = 120;

/** Editor top bar (editor.png; "Top bar" in design/figma-export.css): 56 px. */
export function TopBar() {
  const title = useEditor((s) => s.project?.title ?? '');
  const format = useEditor((s) => s.project?.format ?? '16:9');
  const canUndo = useEditor(selectCanUndo);
  const canRedo = useEditor(selectCanRedo);
  const exec = useEditor((s) => s.exec);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);

  return (
    <header className="relative flex h-14 shrink-0 items-center border-b border-white/6 bg-raised-grad pr-[28px] pl-5">
      <Link href="/" className="flex items-center gap-[7px]" aria-label="motionpop home">
        <PipAvatar size={24} ring={false} />
        <span className="text-[19px] leading-[25px] font-semibold tracking-[-0.2px]">
          motionpop
        </span>
      </Link>
      <span aria-hidden className="mr-4 ml-6 h-5 w-px bg-line-strong" />
      <Link
        href="/"
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
          <IconAction
            label="Version history"
            onClick={() => toast('Version history is on its way.')}
          >
            <History className="size-[18px]" strokeWidth={1.5} />
          </IconAction>
        </div>
        <BrandKitChip className="ml-[19px]" onClick={() => toast('Brand kit is on its way.')} />
        <CreditsChip
          className="ml-3"
          credits={CREDITS_PLACEHOLDER}
          onClick={() => toast('Credits and plans are on their way.')}
        />
        <Button
          variant="primary"
          size="lg"
          className="ml-3 h-9 w-[114px] gap-0 pr-3 pl-[13px]"
          onClick={() => toast('Export is on its way. Pip is polishing the render farm.')}
        >
          <Upload className="size-4" strokeWidth={1.5} aria-hidden />
          <span className="ml-2.5">Export</span>
          <ChevronDown className="ml-auto size-3" strokeWidth={1.5} aria-hidden />
        </Button>
        <span className="ml-5">
          <PipAvatar size={32} />
        </span>
      </div>
    </header>
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

function ProjectTitle({ title, onRename }: { title: string; onRename: (next: string) => void }) {
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
