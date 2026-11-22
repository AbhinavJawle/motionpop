'use client';

import type { FrameNote } from '@motionpop/schemas';
import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Chip, CostChip } from '@/components/ui/chip';
import { Shimmer } from '@/components/ui/shimmer';
import { cn } from '@/lib/cn';
import { chipFor, type Route } from '@/lib/ai/route';
import type { BubblePlacement } from '@/lib/notes/geometry';
import { popIn } from '@/lib/motion/presets';

/** The violet of the note's ellipse, number disc and leader line (editor-generating.png). */
export const NOTE_STROKE = '#A995EF';

const pct = (n: number) => `${(n * 100).toFixed(3)}%`;

/** The numbered disc: 14 px violet-fill circle with the number. */
export function NumberDisc({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="flex size-[15px] shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,#8070DA,#554496)] text-[9px] leading-none font-medium text-white"
    >
      {n}
    </span>
  );
}

/**
 * A bubble pinned to a note's placement: glass pill, number, then its content. Pointer events are
 * on (the layer around it is not), so it can be clicked while the frame stays untouched.
 */
export function BubbleShell({
  placement,
  label,
  busy,
  children,
  className,
}: {
  placement: BubblePlacement;
  label: string;
  busy?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      {...popIn}
      role="group"
      aria-label={label}
      aria-busy={busy}
      data-note-bubble
      className={cn(
        'pointer-events-auto absolute z-30 flex min-h-[28px] items-center gap-2 overflow-hidden rounded-[10px] bg-[rgb(21_21_29/0.92)] px-2 py-[5px] text-[13px] leading-[17px] text-text shadow-glass backdrop-blur-[16px]',
        className,
      )}
      style={{
        left: pct(placement.box.x),
        top: pct(placement.box.y),
        width: pct(placement.box.w),
        minHeight: pct(placement.box.h),
      }}
    >
      {busy && <Shimmer tone="violet" />}
      {children}
    </motion.div>
  );
}

/** The draft: "What should change?", with the route chip, Enter saves and Esc cancels. */
export function NoteInput({
  n,
  placement,
  route,
  cost,
  onSave,
  onCancel,
}: {
  n: number;
  placement: BubblePlacement;
  route: Route;
  /** A cost range for the cloud chip (reel notes may write a new graphic, spec 30). */
  cost?: { label: string; hint: string };
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const chip = chipFor(route);
  const reason = route.kind === 'disabled' ? route.reason : null;
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (text.trim() !== '') onSave(text.trim());
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel();
    }
  };
  return (
    <BubbleShell placement={placement} label={`New note ${n}`}>
      <NumberDisc n={n} />
      <input
        autoFocus
        aria-label="What should change?"
        value={text}
        maxLength={300}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="What should change?"
        className="min-w-0 flex-1 bg-transparent text-[12px] leading-4 text-text outline-none placeholder:text-placeholder"
      />
      {reason ? (
        <Chip tone="neutral" className="shrink-0">
          {reason}
        </Chip>
      ) : chip ? (
        <CostChip
          route={chip.route}
          credits={chip.route === 'cloud' ? chip.credits : 0}
          {...(chip.route === 'cloud' && cost ? { label: cost.label, hint: cost.hint } : {})}
        />
      ) : null}
    </BubbleShell>
  );
}

export type NoteNotice =
  { kind: 'escalate'; message: string } | { kind: 'device-failed' } | { kind: 'failed' };

/** A saved note: its text, then what state it is in. */
export function NoteView({
  note,
  n,
  placement,
  fixed,
  fixedMessage,
  busy,
  notice,
  onDelete,
  onReopen,
  onFixAgain,
  onTryCloud,
}: {
  note: FrameNote;
  n: number;
  placement: BubblePlacement;
  /** Shown as fixed (for 4 s after the fix). */
  fixed: boolean;
  /** What the fix changed, in one sentence (reel notes, spec 29). */
  fixedMessage?: string | undefined;
  busy: boolean;
  notice: NoteNotice | null;
  onDelete: () => void;
  onReopen: () => void;
  onFixAgain: () => void;
  onTryCloud: () => void;
}) {
  return (
    <BubbleShell
      placement={placement}
      label={`Note ${n}: ${note.text}`}
      busy={busy}
      className="group flex-wrap"
    >
      <NumberDisc n={n} />
      <span className="relative min-w-0 flex-1 truncate" title={note.text}>
        {note.text}
      </span>
      {busy && <span className="relative shrink-0 text-[10px] text-text-3">Pip is on it…</span>}
      {fixed && !busy && (
        <span className="relative flex shrink-0 items-center gap-1.5 text-[10px] leading-[13px]">
          <span className="text-mint">✓ Fixed</span>
          <button
            type="button"
            onClick={onReopen}
            className="text-text-3 underline-offset-2 transition-colors hover:text-text hover:underline"
          >
            Still there?
          </button>
        </span>
      )}
      {!busy && !fixed && (
        <span className="relative flex shrink-0 items-center gap-1.5 text-[10px] leading-[13px]">
          {note.status === 'open' && (
            <button
              type="button"
              onClick={onFixAgain}
              className="text-text-3 underline-offset-2 transition-colors hover:text-text hover:underline"
            >
              {notice ? 'Fix again' : 'Fix it'}
            </button>
          )}
          <button
            type="button"
            aria-label={`Delete note ${n}`}
            onClick={onDelete}
            className="rounded p-0.5 text-text-3 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-text focus-visible:opacity-100"
          >
            <X className="size-3" strokeWidth={1.5} aria-hidden />
          </button>
        </span>
      )}
      {fixed && !busy && fixedMessage && (
        <span
          className="relative basis-full pb-0.5 pl-[23px] text-[10px] leading-[13px] text-text-2"
          data-note-fixed-message
        >
          {fixedMessage}
        </span>
      )}
      {!busy && !fixed && notice !== null && (
        <span className="relative flex basis-full items-center gap-3 pb-0.5 pl-[23px] text-[10px] leading-[13px] text-text-2">
          {notice.kind === 'escalate' && <span>{notice.message}</span>}
          {notice.kind === 'device-failed' && (
            <>
              <span>Couldn’t do that on your device.</span>
              <button
                type="button"
                onClick={onTryCloud}
                className="text-violet-ink hover:underline"
              >
                Try in the cloud ☁ 1
              </button>
            </>
          )}
          {notice.kind === 'failed' && <span>Couldn’t fix that note.</span>}
        </span>
      )}
    </BubbleShell>
  );
}
