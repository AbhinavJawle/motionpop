'use client';

import { StartDraftSchema } from '@motionpop/schemas';
import {
  Clapperboard,
  FileText,
  Layers,
  Mic,
  Palette,
  Sparkles,
  Square,
  Upload,
  Wand2,
} from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { btn } from '@/components/paper/kit';
import { toast } from '@/components/ui/toast';
import { audioStore } from '@/lib/audio/audio-store';
import { recordClock } from '@/lib/audio/level';
import { MAX_TAKE_MS, Recorder, RecorderStartError } from '@/lib/audio/recorder';
import { cn } from '@/lib/cn';
import { DASHBOARD_COPY as C } from '@/lib/dashboard/copy';
import { CONFIGURE, handOffFile, recordMeta } from '@/lib/intake/hand-off';
import { setPendingRef } from '@/lib/intake/pending';
import { buttonMotion } from '@/lib/motion/presets';
import { putScriptDraft } from '@/lib/script/hand-off';

export interface CaptureBarHandle {
  focus(): void;
}

/** Hold this long before the press counts as hold-to-record (design §5). */
const HOLD_MS = 300;
/** A shorter take than this is treated as a slip, not a recording. */
const MIN_TAKE_MS = 700;
const METER_BARS = 24;

const MEDIA_ACCEPT = 'video/*,audio/*,.mp4,.mov,.webm,.mp3,.wav,.m4a';

type Mode =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'arming' }
  | { kind: 'starting' }
  | { kind: 'recording' }
  | { kind: 'saving' }
  | { kind: 'error'; message: string };

const AI_QUICK_MODES = [
  { href: '/start', icon: Clapperboard, label: 'AI Talking-Head Reel', tone: '#8dbceb' },
  { href: '/start', icon: Sparkles, label: 'AI Motion Graphics', tone: '#fde68a' },
  { href: '/recipes', icon: Wand2, label: 'AI Director Recipes', tone: '#ddd6fe' },
  { href: '/styles', icon: Palette, label: 'AI Looks & Styles', tone: '#a7f3d0' },
  { href: '/skills', icon: Layers, label: 'AI Slot Skills', tone: '#ffffff' },
] as const;

/**
 * Media-first AI studio command bar (Spec 35 + Spec 42):
 * - Primary CTA uploads video or audio straight into the AI configure pipeline (`handOffFile`).
 * - Paste or type a script and press Enter to generate an AI-voiced motion graphic video.
 * - Quick AI Script link + compact hold-to-record Mic button keep all intake paths one click away.
 * - ⌘K focuses the input from anywhere on `/dashboard`.
 */
export const CaptureBar = forwardRef<CaptureBarHandle, object>(function CaptureBar(_, ref) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
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

  const onPickMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMode({ kind: 'uploading' });
    const res = await handOffFile(file);
    if (!res.ok) {
      toast.error(res.message);
      setMode({ kind: 'idle' });
      return;
    }
    router.push(CONFIGURE);
  };

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
      router.push(CONFIGURE);
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
      router.push('/start/script');
    }
  };

  const live = mode.kind === 'recording' || mode.kind === 'starting' || mode.kind === 'saving';

  return (
    <div>
      <input
        ref={fileInput}
        type="file"
        accept={MEDIA_ACCEPT}
        onChange={(e) => void onPickMedia(e)}
        className="sr-only"
        aria-label="Upload video or audio file"
      />

      <div
        data-testid="capture-bar"
        className={cn(
          'flex min-h-[68px] items-center gap-3 rounded-[14px] border-2 border-ink bg-paper px-3.5 py-2.5 shadow-[5px_5px_0_#000] transition-colors duration-200',
          live && 'bg-[#fff4ef]',
        )}
      >
        {live ? (
          <>
            <motion.button
              type="button"
              {...buttonMotion}
              aria-label="Stop recording"
              aria-pressed
              onPointerUp={onUp}
              onKeyDown={onKeyMic}
              onClick={() => void finish()}
              className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-flame text-ink shadow-[2px_2px_0_#000]"
            >
              <Square className="size-4 fill-ink" strokeWidth={0} aria-hidden />
            </motion.button>
            <span className="ml-2 w-[96px] font-poster text-[34px] leading-none tabular">
              {recordClock(elapsed)}
            </span>
            <span aria-hidden className="flex h-8 items-center gap-[3px]">
              {meter.map((v, i) => (
                <span
                  key={i}
                  className="w-[3.5px] rounded-full bg-ink"
                  style={{ height: `${Math.max(4, v * 30)}px` }}
                />
              ))}
            </span>
            <span className="ml-3 text-[13px]" role="status">
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
            <span className="flex-1 px-2 text-[13px] text-error" role="alert">
              {mode.message}
            </span>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className={btn('flame', 'sm')}
            >
              {C.capture.uploadInstead}
            </button>
            <button
              type="button"
              onClick={() => setMode({ kind: 'idle' })}
              className="px-2 text-[12px] underline underline-offset-4"
            >
              Dismiss
            </button>
          </>
        ) : (
          <>
            {/* Primary media-first AI upload button */}
            <motion.button
              type="button"
              {...buttonMotion}
              disabled={mode.kind === 'uploading'}
              onClick={() => fileInput.current?.click()}
              className={btn(
                'flame',
                'md',
                false,
                'h-11 shrink-0 rounded-[10px] px-4 text-[13px] font-semibold shadow-[3px_3px_0_#000]',
              )}
            >
              <Upload className="size-4 shrink-0" strokeWidth={2.2} aria-hidden />
              <span>{mode.kind === 'uploading' ? 'Opening…' : C.capture.upload}</span>
            </motion.button>

            <span aria-hidden className="hidden h-7 w-[2px] shrink-0 bg-ink/20 sm:block" />

            {/* Drop / AI script prompt field */}
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
              aria-label="Paste a script for AI video"
              placeholder={C.capture.hint}
              className="h-10 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-black/45"
            />

            {/* Right controls: Create with AI / AI Script / compact Mic / ⌘K */}
            {text.trim() ? (
              <button type="button" onClick={submit} className={btn('ink', 'sm')}>
                <Sparkles className="size-3.5" strokeWidth={2} aria-hidden />
                Create with AI
              </button>
            ) : (
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href="/start/script"
                  className={btn('paper', 'sm', false, 'hidden h-9 px-3 sm:inline-flex')}
                >
                  <FileText className="size-3.5" strokeWidth={2} aria-hidden />
                  AI Script
                </Link>
                <button
                  type="button"
                  title="Record voiceover (click or hold)"
                  aria-label="Record a voiceover. Hold to record here"
                  onPointerDown={onDown}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                  onKeyDown={onKeyMic}
                  onClick={(e) => e.preventDefault()}
                  className={cn(
                    'flex size-9 shrink-0 touch-none items-center justify-center rounded-lg border-2 border-ink bg-paper text-ink transition-colors hover:bg-mist',
                    mode.kind === 'arming' && 'scale-95 bg-flame',
                  )}
                >
                  <Mic className="size-4" strokeWidth={2} aria-hidden />
                </button>
                <kbd className="hidden h-7 items-center rounded-md border-2 border-ink px-2 font-mono text-[11px] leading-none md:inline-flex">
                  ⌘K
                </kbd>
              </div>
            )}
          </>
        )}
      </div>

      {/* Compact AI quick-launch modes strip */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {AI_QUICK_MODES.map((m) => {
            const Icon = m.icon;
            return (
              <Link
                key={m.label}
                href={m.href}
                className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-ink bg-paper px-2.5 py-1 text-[11px] font-medium shadow-[2px_2px_0_#000] transition-transform hover:-translate-y-px"
              >
                <span
                  className="grid size-4 place-items-center rounded border border-ink"
                  style={{ background: m.tone }}
                >
                  <Icon className="size-2.5" strokeWidth={2.2} aria-hidden />
                </span>
                {m.label}
              </Link>
            );
          })}
        </div>
        <span className="hidden font-mono text-[11px] text-black/55 xl:inline">
          MP4 · MOV · WebM · MP3 · WAV · M4A — drop anywhere
        </span>
      </div>
    </div>
  );
});
