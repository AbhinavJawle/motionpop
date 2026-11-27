'use client';

import type { FrameNote } from '@motionpop/schemas';
import { ArrowUp, Server, X, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
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
      className="flex size-[16px] shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,#8070DA,#554496)] text-[10px] leading-none font-medium text-[#fff]"
    >
      {n}
    </span>
  );
}

/**
 * Anchors a floating bubble to its placement while allowing it to extend cleanly past narrow
 * portrait frames without getting clipped or fighting Framer Motion's scale transform.
 */
function anchorStyle(placement: BubblePlacement, minWidthPx: number, anchorBottom = false): CSSProperties {
  const centerX = placement.box.x + placement.box.w / 2;
  const vertical: CSSProperties = anchorBottom
    ? { bottom: pct(Math.max(0.02, 1 - (placement.box.y + placement.box.h))) }
    : { top: pct(placement.box.y) };
  return {
    left: pct(centerX),
    transform: 'translateX(-50%)',
    width: `min(88vw, max(${pct(placement.box.w)}, ${minWidthPx}px))`,
    ...vertical,
  };
}

/**
 * A bubble pinned to a note's placement: glass pill, number, then its content. Pointer events are
 * on (the layer around it is not), so it can be clicked while the frame stays untouched.
 */
export function BubbleShell({
  placement,
  label,
  busy,
  minWidthPx = 240,
  anchorBottom = false,
  zClass = 'z-30',
  children,
  className,
}: {
  placement: BubblePlacement;
  label: string;
  busy?: boolean;
  minWidthPx?: number;
  anchorBottom?: boolean;
  zClass?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('pointer-events-none absolute', zClass)}
      style={anchorStyle(placement, minWidthPx, anchorBottom)}
    >
      <motion.div
        {...popIn}
        role="group"
        aria-label={label}
        aria-busy={busy}
        data-note-bubble
        className={cn(
          'pointer-events-auto relative flex min-h-[30px] w-full items-center gap-2 overflow-hidden rounded-[12px] border border-line-strong bg-paper px-2.5 py-1.5 text-[13px] leading-[18px] text-text shadow-glass backdrop-blur-md',
          className,
        )}
      >
        {busy && <Shimmer tone="violet" />}
        {children}
      </motion.div>
    </div>
  );
}

/** The draft: roomy multi-line composer ("What should change?"), Enter saves, Shift+Enter newline, Esc cancels. */
export function NoteInput({
  n,
  placement,
  route,
  cost,
  enginePicker,
  onSave,
  onCancel,
}: {
  n: number;
  placement: BubblePlacement;
  route: Route;
  /** A cost range for the cloud chip (reel notes may write a new graphic, spec 30). */
  cost?: { label: string; hint: string };
  /** Shown when both Gemini Nano and Local AI (Ollama/LM Studio) are connected so user can flip mid-note. */
  enginePicker?: {
    active: 'nano' | 'local-llm';
    localModel: string;
    onChange: (next: 'nano' | 'local-llm') => void;
  };
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const chip = chipFor(route);
  const reason = route.kind === 'disabled' ? route.reason : null;
  const canSubmit = text.trim() !== '';

  // Auto-grow height up to ~5 lines so long edits stay fully visible while typing.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(132, Math.max(48, el.scrollHeight))}px`;
  }, [text]);

  const submit = () => {
    const trimmed = text.trim();
    if (trimmed !== '') onSave(trimmed);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <BubbleShell
      placement={placement}
      label={`New note ${n}`}
      minWidthPx={340}
      anchorBottom={placement.box.y > 0.68}
      zClass="z-40"
      className="flex-col items-stretch gap-2 border-violet/50 bg-dialog px-3 py-2.5 shadow-[0_14px_38px_rgba(0,0,0,0.65)] ring-1 ring-white/10"
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5">
          <NumberDisc n={n} />
        </div>
        <textarea
          ref={textareaRef}
          autoFocus
          rows={2}
          aria-label="What should change?"
          value={text}
          maxLength={300}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="What should change?"
          className="min-h-[48px] w-full min-w-0 flex-1 resize-none bg-transparent text-[14px] leading-[20px] text-text outline-none placeholder:text-text-2/70"
        />
        <button
          type="button"
          aria-label="Cancel note"
          onClick={onCancel}
          className="-mt-0.5 -mr-1 shrink-0 rounded-md p-1 text-text-3 transition-colors hover:bg-white/5 hover:text-text"
        >
          <X className="size-3.5" strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line-soft pt-2">
        <div className="flex min-w-0 items-center gap-2">
          {enginePicker ? (
            <div
              role="group"
              aria-label="Note AI engine"
              className="inline-flex min-w-0 items-center rounded-md border border-line-strong bg-white/5 p-0.5 text-[10px]"
            >
              <button
                type="button"
                aria-pressed={enginePicker.active === 'nano'}
                onClick={() => enginePicker.onChange('nano')}
                className={cn(
                  'inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors',
                  enginePicker.active === 'nano'
                    ? 'bg-mint-tint text-mint-ink'
                    : 'text-text-3 hover:text-text',
                )}
              >
                <Zap className="size-2.5 fill-current" strokeWidth={0} aria-hidden />
                Nano
              </button>
              <button
                type="button"
                aria-pressed={enginePicker.active === 'local-llm'}
                onClick={() => enginePicker.onChange('local-llm')}
                title={enginePicker.localModel}
                className={cn(
                  'inline-flex max-w-[116px] items-center gap-1 truncate rounded px-1.5 py-0.5 font-mono font-medium transition-colors',
                  enginePicker.active === 'local-llm'
                    ? 'bg-mint-tint text-mint-ink'
                    : 'text-text-3 hover:text-text',
                )}
              >
                <Server className="size-2.5 shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="truncate">{enginePicker.localModel}</span>
              </button>
            </div>
          ) : reason ? (
            <Chip tone="neutral" className="shrink-0">
              {reason}
            </Chip>
          ) : chip ? (
            <CostChip
              route={chip.route}
              credits={chip.route === 'cloud' ? chip.credits : 0}
              {...(chip.route === 'cloud' && chip.byok ? { byok: true } : {})}
              {...(chip.route === 'cloud' && chip.localLlm ? { localLlm: true } : {})}
              {...(chip.route === 'cloud' && !chip.localLlm && !chip.byok && cost
                ? { label: cost.label, hint: cost.hint }
                : {})}
            />
          ) : null}
          <span className="hidden text-[11px] text-text-3 sm:inline">Enter to apply</span>
        </div>
        <button
          type="button"
          aria-label="Apply note"
          disabled={!canSubmit}
          onClick={submit}
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-[12px] leading-none font-medium transition-colors',
            canSubmit
              ? 'bg-violet text-[#fff] hover:bg-violet/90'
              : 'cursor-not-allowed bg-white/5 text-text-4',
          )}
        >
          Apply
          <ArrowUp className="size-3" strokeWidth={2} aria-hidden />
        </button>
      </div>
    </BubbleShell>
  );
}

export type NoteNotice =
  | {
      kind: 'escalate';
      message: string;
      offerCloud?: boolean;
      offerAltLocal?: 'nano' | 'local-llm';
    }
  | { kind: 'device-failed'; offerAltLocal?: 'local-llm' }
  | { kind: 'failed'; message?: string; offerCloud?: boolean; offerAltLocal?: 'nano' };

/** A saved note: its text, then what state it is in. */
export function NoteView({
  note,
  n,
  placement,
  fixed,
  fixedMessage,
  busy,
  notice,
  canTryCloud = true,
  cloudLabel = '1',
  localModel,
  onDelete,
  onReopen,
  onFixAgain,
  onTryCloud,
  onTryAltLocal,
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
  /** False when offline or signed out (hides the "Try in the cloud" action). */
  canTryCloud?: boolean;
  /** Credit label shown on the cloud escalation action (e.g. "1" or "1–6"). */
  cloudLabel?: string;
  /** Active local LLM model name, for one-click fallback buttons when both local engines are connected. */
  localModel?: string | null;
  onDelete: () => void;
  onReopen: () => void;
  onFixAgain: () => void;
  onTryCloud: () => void;
  onTryAltLocal?: (target: 'nano' | 'local-llm') => void;
}) {
  return (
    <BubbleShell
      placement={placement}
      label={`Note ${n}: ${note.text}`}
      busy={busy}
      minWidthPx={notice ? 280 : 240}
      anchorBottom={placement.box.y > 0.68}
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
        <span className="relative flex basis-full flex-wrap items-center gap-x-3 gap-y-1 pb-0.5 pl-[23px] text-[10px] leading-[13px] text-text-2">
          {notice.kind === 'escalate' && (
            <>
              <span>{notice.message}</span>
              {notice.offerAltLocal && onTryAltLocal && (
                <button
                  type="button"
                  onClick={() => onTryAltLocal(notice.offerAltLocal!)}
                  className="shrink-0 text-mint-ink hover:underline"
                >
                  {notice.offerAltLocal === 'nano'
                    ? 'Try Gemini Nano · free'
                    : `Try ${localModel || 'Local AI'} · 0`}
                </button>
              )}
              {canTryCloud && notice.offerCloud !== false && (
                <button
                  type="button"
                  onClick={onTryCloud}
                  className="shrink-0 text-violet-ink hover:underline"
                >
                  Try in the cloud ☁ {cloudLabel}
                </button>
              )}
            </>
          )}
          {notice.kind === 'device-failed' && (
            <>
              <span>Couldn’t do that on your device.</span>
              {notice.offerAltLocal === 'local-llm' && onTryAltLocal && (
                <button
                  type="button"
                  onClick={() => onTryAltLocal('local-llm')}
                  className="shrink-0 text-mint-ink hover:underline"
                >
                  Try {localModel || 'Local AI'} · 0
                </button>
              )}
              {canTryCloud && (
                <button
                  type="button"
                  onClick={onTryCloud}
                  className="shrink-0 text-violet-ink hover:underline"
                >
                  Try in the cloud ☁ {cloudLabel}
                </button>
              )}
            </>
          )}
          {notice.kind === 'failed' && (
            <>
              <span>{notice.message ?? 'Couldn’t fix that note.'}</span>
              {notice.offerAltLocal === 'nano' && onTryAltLocal && (
                <button
                  type="button"
                  onClick={() => onTryAltLocal('nano')}
                  className="shrink-0 text-mint-ink hover:underline"
                >
                  Try Gemini Nano · free
                </button>
              )}
              {notice.offerCloud && canTryCloud && (
                <button
                  type="button"
                  onClick={onTryCloud}
                  className="shrink-0 text-violet-ink hover:underline"
                >
                  Try in the cloud ☁ {cloudLabel}
                </button>
              )}
            </>
          )}
        </span>
      )}
    </BubbleShell>
  );
}
