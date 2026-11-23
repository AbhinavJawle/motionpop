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
import { putScriptDraft } from '@/lib/script/hand-off';
import { buttonMotion } from '@/lib/motion/presets';
import { btn } from '@/components/paper/kit';

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
 * The capture bar (design §5 and §11, drawn as an ink frame in spec 35). Press and hold the mic (300 ms) to record inline, release to hand the take to
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
    if (t) {
      putScriptDraft(t);
      router.push('/start');
    }
  };

  const live = mode.kind === 'recording' || mode.kind === 'starting' || mode.kind === 'saving';

  return (
    <div
      data-testid="capture-bar"
      className={cn(
        'flex h-[84px] items-center rounded-[16px] border-2 border-ink bg-paper pr-5 pl-4 shadow-[6px_6px_0_#000] transition-colors duration-200',
        live && 'bg-[#fff4ef]',
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
          'flex size-[54px] shrink-0 touch-none items-center justify-center rounded-full border-2 border-ink bg-flame text-ink shadow-[3px_3px_0_#000] transition-[transform,box-shadow] duration-150',
          live && 'translate-x-[2px] translate-y-[2px] shadow-[1px_1px_0_#000]',
          mode.kind === 'arming' && 'scale-95',
        )}
      >
        {live ? (
          <Square className="size-4 fill-ink" strokeWidth={0} aria-hidden />
        ) : (
          <Mic className="size-[22px]" strokeWidth={2} aria-hidden />
        )}
      </motion.button>

      {live ? (
        <>
          <span className="ml-5 w-[110px] font-poster text-[40px] leading-none tabular">
            {recordClock(elapsed)}
          </span>
          <span aria-hidden className="flex h-9 items-center gap-[3px]">
            {meter.map((v, i) => (
              <span
                key={i}
                className="w-[4px] rounded-full bg-ink"
                style={{ height: `${Math.max(4, v * 36)}px` }}
              />
            ))}
          </span>
          <span className="ml-6 text-[14px]" role="status">
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
          <span className="ml-5 flex-1 text-[13px] text-error" role="alert">
            {mode.message}
          </span>
          <button
            type="button"
            onClick={() => router.push('/start')}
            className={btn('paper', 'sm', false, 'mr-3')}
          >
            {C.capture.uploadInstead}
          </button>
          <button
            type="button"
            onClick={() => setMode({ kind: 'idle' })}
            className="text-[12px] underline underline-offset-4"
          >
            Dismiss
          </button>
        </>
      ) : (
        <>
          <span className="ml-5 shrink-0 text-[15px] font-semibold">{C.capture.hold}</span>
          <span aria-hidden className="mx-6 h-9 w-[2px] shrink-0 bg-ink" />
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
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-black/45"
          />
          {text.trim() ? (
            <button type="button" onClick={submit} className={btn('ink', 'sm', false, 'ml-4')}>
              Use this script
            </button>
          ) : (
            <kbd className="ml-4 hidden h-7 items-center rounded-md border-2 border-ink px-2 font-mono text-[11px] leading-none sm:inline-flex">
              ⌘K
            </kbd>
          )}
        </>
      )}
    </div>
  );
});
