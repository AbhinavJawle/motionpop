'use client';

import { Mic, Square } from 'lucide-react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { toast } from '@/components/ui/toast';
import { audioStore } from '@/lib/audio/audio-store';
import { recordClock } from '@/lib/audio/level';
import { MAX_TAKE_MS, Recorder, RecorderStartError } from '@/lib/audio/recorder';
import { cn } from '@/lib/cn';
import { DASHBOARD_COPY as C } from '@/lib/dashboard/copy';
import { PROCESSING_NEW, recordMeta } from '@/lib/intake/hand-off';
import { setPendingRef } from '@/lib/intake/pending';
import { StartDraftSchema } from '@motionpop/schemas';
import { buttonMotion } from '@/lib/motion/presets';

export interface CaptureBarHandle {
  focus(): void;
}

/** Hold this long before the press counts as hold-to-record (design §5). */
const HOLD_MS = 300;
/** A shorter take than this is treated as a slip, not a recording. */
const MIN_TAKE_MS = 700;
const METER_BARS = 24;

type Mode =
  | { kind: 'idle' }
  | { kind: 'arming' }
  | { kind: 'starting' }
  | { kind: 'recording' }
  | { kind: 'saving' }
  | { kind: 'error'; message: string };

/**
 * The capture bar (projects.png, design §5 and §11): 1296×64, card colour, r32, violet inner
 * glow. Press and hold the mic (300 ms) to record inline, release to hand the take to
 * Processing; a short press opens `/start/record`. Keyboard: Space on the mic toggles. Paste
 * or type a script and press Enter to take it to Start. ⌘K focuses the bar.
 */
export const CaptureBar = forwardRef<CaptureBarHandle, object>(function CaptureBar(_, ref) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [elapsed, setElapsed] = useState(0);
  const [meter, setMeter] = useState<number[]>(() => Array<number>(METER_BARS).fill(0));
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rec = useRef<Recorder | null>(null);
  const released = useRef(false);

  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(
    () => () => {
      if (hold.current) clearTimeout(hold.current);
      rec.current?.dispose();
    },
    [],
  );

  const finish = useCallback(async () => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    if (r.durationMs < MIN_TAKE_MS) {
      r.dispose();
      setMode({ kind: 'idle' });
      router.push('/start/record');
      return;
    }
    setMode({ kind: 'saving' });
    try {
      const { wav } = await r.stop();
      // Stored at once: a reload between here and Processing keeps the take (R8.4).
      const ref = await audioStore().put(wav);
      await setPendingRef(recordMeta(ref, Date.now()), StartDraftSchema.parse({}));
      router.push(PROCESSING_NEW);
    } catch (e) {
      console.error('[capture]', e);
      toast.error("Couldn't keep that take in this browser. Try again.");
      setMode({ kind: 'idle' });
    }
  }, [router]);

  const begin = useCallback(async () => {
    const r = new Recorder();
    rec.current = r;
    setElapsed(0);
    setMode({ kind: 'starting' });
    r.onFrame((f) => setMeter((m) => [...m.slice(1), Math.min(1, Math.sqrt(f.peak) * 1.2)]));
    try {
      await r.start();
      if (rec.current !== r) return r.dispose();
      setMode({ kind: 'recording' });
      // Released while the permission prompt was up: it was a click after all.
      if (released.current) void finish();
    } catch (e) {
      rec.current = null;
      r.dispose();
      setMode({
        kind: 'error',
        message:
          e instanceof RecorderStartError && e.reason === 'no-device'
            ? 'No microphone found. Plug one in, or upload instead.'
            : C.capture.micDenied,
      });
    }
  }, [finish]);

  useEffect(() => {
    if (mode.kind !== 'recording') return;
    const t = setInterval(() => {
      const ms = rec.current?.durationMs ?? 0;
      setElapsed(ms);
      if (ms >= MAX_TAKE_MS) void finish();
    }, 100);
    return () => clearInterval(t);
  }, [mode.kind, finish]);

  const onDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || mode.kind === 'saving' || mode.kind === 'recording') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    released.current = false;
    setMode({ kind: 'arming' });
    hold.current = setTimeout(() => {
      hold.current = null;
      void begin();
    }, HOLD_MS);
  };

  const onUp = () => {
    released.current = true;
    if (hold.current) {
      clearTimeout(hold.current);
      hold.current = null;
      setMode({ kind: 'idle' });
      router.push('/start/record');
      return;
    }
    if (mode.kind === 'recording') void finish();
  };

  const onKeyMic = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (e.repeat) return;
    if (mode.kind === 'recording') void finish();
    else if (mode.kind === 'idle' || mode.kind === 'error') {
      released.current = false;
      void begin();
    }
  };

  const submit = () => {
    const t = text.trim();
    if (t) router.push(`/start?text=${encodeURIComponent(t.slice(0, 3000))}`);
  };

  const live = mode.kind === 'recording' || mode.kind === 'starting' || mode.kind === 'saving';

  return (
    <div
      data-testid="capture-bar"
      className={cn(
        'flex h-16 items-center rounded-[32px] bg-card pr-8 pl-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.05),inset_0_0_24px_1px_rgb(139_124_255/0.12)] outline outline-1 -outline-offset-1 transition-[outline-color] duration-200',
        live ? 'outline-ember/40' : 'outline-violet/15',
      )}
    >
      <motion.button
        type="button"
        {...buttonMotion}
        aria-label={live ? 'Stop recording' : 'Record a voiceover. Hold to record here'}
        aria-pressed={live}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKeyMic}
        onClick={(e) => e.preventDefault()}
        className={cn(
          'flex size-11 touch-none items-center justify-center rounded-full border text-ember',
          live
            ? 'border-ember bg-ember/25 shadow-[0_0_22px_rgb(255_122_61/0.4)]'
            : 'border-ember/70 bg-[radial-gradient(closest-side,rgb(255_122_61/0.18),rgb(255_122_61/0.06))] shadow-[0_0_16px_rgb(255_122_61/0.18)]',
          mode.kind === 'arming' && 'scale-95',
        )}
      >
        {live ? (
          <Square className="size-3.5 fill-ember" strokeWidth={0} aria-hidden />
        ) : (
          <Mic className="size-[18px]" strokeWidth={1.5} aria-hidden />
        )}
      </motion.button>

      {live ? (
        <>
          <span className="ml-4 w-[90px] font-mono text-sm leading-[18px] tabular text-text">
            {recordClock(elapsed)}
          </span>
          <span aria-hidden className="flex h-6 items-center gap-[3px]">
            {meter.map((v, i) => (
              <span
                key={i}
                className="w-[3px] rounded-full bg-ember"
                style={{ height: `${Math.max(3, v * 24)}px`, opacity: 0.35 + v * 0.65 }}
              />
            ))}
          </span>
          <span className="ml-6 text-sm leading-[18px] text-text-2" role="status">
            {mode.kind === 'starting'
              ? 'Waiting for your microphone…'
              : mode.kind === 'saving'
                ? 'Keeping your take…'
                : C.capture.release}
          </span>
          <span className="flex-1" />
        </>
      ) : mode.kind === 'error' ? (
        <>
          <span className="ml-4 flex-1 text-[13px] leading-4 text-warn" role="alert">
            {mode.message}
          </span>
          <button
            type="button"
            onClick={() => router.push('/start')}
            className="mr-4 rounded-lg bg-white/8 px-3 py-1.5 text-xs leading-4 font-medium text-text hover:bg-white/12"
          >
            {C.capture.uploadInstead}
          </button>
          <button
            type="button"
            onClick={() => setMode({ kind: 'idle' })}
            className="text-xs leading-4 text-text-2 hover:text-text"
          >
            Dismiss
          </button>
        </>
      ) : (
        <>
          <span className="ml-4 text-sm leading-[18px] font-medium text-text">
            {C.capture.hold}
          </span>
          <span aria-hidden className="mx-[23px] h-6 w-px bg-line-strong" />
          <input
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') {
                setText('');
                input.current?.blur();
              }
            }}
            maxLength={3000}
            aria-label="Paste a script"
            placeholder={C.capture.hint}
            className="h-full min-w-0 flex-1 bg-transparent text-sm leading-[18px] text-text outline-none placeholder:text-text-2"
          />
          <span className="ml-6 font-mono text-[10px] leading-[13px] tracking-[0.4px] text-text-3">
            {C.capture.formats}
          </span>
          <kbd className="ml-[86px] inline-flex h-[22px] w-12 items-center justify-center rounded-md border border-line bg-card-2 font-mono text-[10px] leading-none text-text-2">
            ⌘K
          </kbd>
        </>
      )}
    </div>
  );
});
