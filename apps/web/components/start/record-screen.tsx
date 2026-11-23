'use client';

import { Pause, Play, Square } from 'lucide-react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { btn, paper, PaperPage } from '@/components/paper/kit';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { Modal } from '@/components/ui/modal';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { RECORD_COPY as C } from '@/lib/dashboard/copy';
import { feedback, recordClock, type LevelFrame } from '@/lib/audio/level';
import {
  MAX_TAKE_MS,
  Recorder,
  RecorderStartError,
  type RecorderError,
} from '@/lib/audio/recorder';
import { CONFIGURE, recordMeta } from '@/lib/intake/hand-off';
import { clearPending, peekPending, setPendingRef, takePending } from '@/lib/intake/pending';
import { audioStore } from '@/lib/audio/audio-store';
import { useStartDraft } from '@/lib/intake/use-start-draft';
import { buttonMotion } from '@/lib/motion/presets';
import { useStill } from '@/lib/motion/use-still';
import { LiveWaveform } from './live-waveform';
import { ProjectTopBar } from './project-top-bar';
import { StartHero } from './start-hero';

type Phase =
  | { kind: 'asking' }
  | { kind: 'recording' }
  | { kind: 'saving' }
  | { kind: 'review'; url: string; durationMs: number }
  | { kind: 'error'; reason: RecorderError };

const WARN_MS = 9 * 60_000;

/** Peaks of a stored take for the review waveform (one per 50 ms). */
async function peaksOf(blob: Blob): Promise<number[]> {
  try {
    const buf = await new OfflineAudioContext(1, 1, 24_000).decodeAudioData(
      await blob.arrayBuffer(),
    );
    const d = buf.getChannelData(0);
    const per = Math.round(buf.sampleRate * 0.05);
    const out: number[] = [];
    for (let i = 0; i < d.length; i += per) {
      let m = 0;
      for (let j = i; j < Math.min(d.length, i + per); j++) m = Math.max(m, Math.abs(d[j] ?? 0));
      out.push(m);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * `/start/record` (recording.png, R8): asks for the mic and records at once; the live card
 * (stop, waveform, timer, level feedback, Pause, Discard, mic selector); on stop the 24 kHz
 * WAV is stored locally and handed over as the pending intake at once, so a reload keeps it
 * (R8.4); review with play, "Use this take" and "Record again".
 */
export function RecordScreen() {
  const router = useRouter();
  const still = useStill();
  const [draft] = useStartDraft();
  const [phase, setPhase] = useState<Phase>({ kind: 'asking' });
  const [paused, setPaused] = useState(false);
  const [unplugged, setUnplugged] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState<'good' | 'quiet'>('good');
  const [devices, setDevices] = useState<{ value: string; label: string }[]>([]);
  const [deviceId, setDeviceId] = useState<string>('');
  const [confirm, setConfirm] = useState(false);
  const [playing, setPlaying] = useState(false);
  const rec = useRef<Recorder | null>(null);
  const frames = useRef<LevelFrame[]>([]);
  const peaks = useRef<number[]>([]);
  const audio = useRef<HTMLAudioElement | null>(null);
  // The waveform fills the recorder's width.
  const waveBox = useRef<HTMLDivElement>(null);
  const [waveWidth, setWaveWidth] = useState(0);
  useEffect(() => {
    const el = waveBox.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWaveWidth(Math.floor(e?.contentRect.width ?? 0)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase.kind]);
  const warned = useRef(false);
  const stopping = useRef(false);

  const begin = useCallback(async () => {
    rec.current?.dispose();
    const r = new Recorder();
    rec.current = r;
    frames.current = [];
    peaks.current = [];
    warned.current = false;
    stopping.current = false;
    setElapsed(0);
    setPaused(false);
    setUnplugged(false);
    setLevel('good');
    setPhase({ kind: 'asking' });
    r.onFrame((f) => {
      frames.current.push(f);
      if (frames.current.length > 60) frames.current.splice(0, frames.current.length - 60);
      peaks.current.push(f.peak);
    });
    r.onEnded(() => {
      r.pause();
      setPaused(true);
      setUnplugged(true);
    });
    try {
      await r.start();
      if (rec.current !== r) return r.dispose();
      setPhase({ kind: 'recording' });
      const list = await navigator.mediaDevices.enumerateDevices();
      const inputs = list
        .filter((d) => d.kind === 'audioinput' && d.deviceId)
        .map((d, i) => ({ value: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
      setDevices(inputs);
      setDeviceId(r.deviceId ?? inputs[0]?.value ?? '');
    } catch (e) {
      if (rec.current !== r) return;
      r.dispose();
      setPhase({ kind: 'error', reason: e instanceof RecorderStartError ? e.reason : 'denied' });
    }
  }, []);

  const showTake = useCallback(async (blob: Blob, durationMs: number) => {
    peaks.current = await peaksOf(blob);
    setPhase({ kind: 'review', url: URL.createObjectURL(blob), durationMs });
  }, []);

  // A take waiting from before a reload is shown for review; otherwise recording starts.
  useEffect(() => {
    let live = true;
    void (async () => {
      const p = peekPending();
      const waiting = p?.meta.source === 'record' ? await takePending().catch(() => null) : null;
      if (!live) return;
      if (waiting?.blob) {
        const ms = Math.round((Math.max(0, waiting.blob.size - 44) / 2 / 24_000) * 1000);
        await showTake(waiting.blob, ms);
      } else {
        await begin();
      }
    })();
    return () => {
      live = false;
      rec.current?.dispose();
      rec.current = null;
    };
  }, [begin, showTake]);

  const stop = useCallback(async () => {
    const r = rec.current;
    if (!r || stopping.current) return;
    stopping.current = true;
    setPhase({ kind: 'saving' });
    try {
      const { wav, durationMs } = await r.stop();
      rec.current = null;
      // Stored at once and handed over, so a reload or a crash keeps the take (R8.4).
      const ref = await audioStore().put(wav);
      await setPendingRef(recordMeta(ref, Date.now()), draft);
      await showTake(wav, durationMs);
    } catch (e) {
      console.error('[record]', e);
      toast.error("Couldn't keep that take in this browser. Try again.");
      void begin();
    }
  }, [begin, draft, showTake]);

  // Timer, level line and the 9:00 / 10:00 limits, ten times a second.
  useEffect(() => {
    if (phase.kind !== 'recording') return;
    const t = setInterval(() => {
      const r = rec.current;
      if (!r) return;
      const ms = r.durationMs;
      setElapsed(ms);
      setLevel(feedback(frames.current));
      if (ms >= WARN_MS && !warned.current) {
        warned.current = true;
        toast(C.nearLimit);
      }
      if (ms >= MAX_TAKE_MS) {
        toast(C.limit);
        void stop();
      }
    }, 100);
    return () => clearInterval(t);
  }, [phase.kind, stop]);

  // Warn before leaving while a take is recording or waiting for review (R8.8).
  useEffect(() => {
    if (phase.kind !== 'recording' && phase.kind !== 'review' && phase.kind !== 'saving') return;
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, [phase.kind]);

  useEffect(() => {
    if (phase.kind !== 'review') return;
    const url = phase.url;
    return () => URL.revokeObjectURL(url);
  }, [phase]);

  const togglePause = useCallback(() => {
    const r = rec.current;
    if (!r || unplugged) return;
    if (r.isPaused) r.resume();
    else r.pause();
    setPaused(r.isPaused);
  }, [unplugged]);

  const discardNow = useCallback(async () => {
    setConfirm(false);
    rec.current?.dispose();
    rec.current = null;
    await clearPending({ keepAudio: false });
    router.push('/start');
  }, [router]);

  const askDiscard = useCallback(() => {
    const ms = phase.kind === 'review' ? phase.durationMs : elapsed;
    if (ms > 3000) setConfirm(true);
    else void discardNow();
  }, [phase, elapsed, discardNow]);

  // Space pauses or resumes, Enter stops, Escape asks to discard (R8.7).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirm || e.repeat) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (phase.kind === 'recording') {
        if (e.key === ' ') {
          e.preventDefault();
          togglePause();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          void stop();
        }
      }
      if (e.key === 'Escape' && (phase.kind === 'recording' || phase.kind === 'review'))
        askDiscard();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase.kind, confirm, togglePause, stop, askDiscard]);

  const useTake = () => router.push(CONFIGURE);
  const again = async () => {
    audio.current?.pause();
    setPlaying(false);
    await clearPending({ keepAudio: false });
    await begin();
  };

  const recording = phase.kind === 'recording' || phase.kind === 'saving';
  const line = unplugged
    ? C.unplugged
    : paused
      ? C.pausedLine
      : elapsed >= WARN_MS
        ? C.nearLimit
        : level === 'good'
          ? C.good
          : C.quiet;

  return (
    <PaperPage>
      <ProjectTopBar />
      <main className="mx-auto w-full max-w-[1240px] px-6 pb-20 lg:px-10">
        <StartHero
          bubble={phase.kind === 'review' ? C.reviewEyebrow : C.eyebrow}
          headline={phase.kind === 'review' ? C.reviewHeadline : C.headline}
          subline={phase.kind === 'review' ? C.reviewSubline : C.subline}
          pip={phase.kind === 'review' ? 'juggle' : 'clapper'}
        />

        <section
          aria-label="Recorder"
          className="min-h-[400px] rounded-[16px] border-2 border-ink bg-paper px-6 pt-6 pb-7 shadow-[6px_6px_0_#000] sm:px-9"
        >
          {phase.kind === 'error' ? (
            <ErrorBody
              reason={phase.reason}
              onRetry={() => void begin()}
              onUpload={() => router.push('/start')}
            />
          ) : (
            <>
              <div className="flex h-8 items-center justify-between gap-4">
                <p className="flex items-center gap-2.5 text-[13px] font-semibold">
                  <span
                    className={cn(
                      'size-3 rounded-full border-2 border-ink',
                      phase.kind === 'review' ? 'bg-mint' : paused ? 'bg-paper' : 'bg-flame',
                      recording && !paused && !still && 'animate-pulse',
                    )}
                  />
                  {phase.kind === 'review' ? C.review : paused ? C.paused : C.recording}
                </p>
                {recording && devices.length > 0 && (
                  <Dropdown
                    label="Microphone"
                    options={devices}
                    value={deviceId}
                    onChange={(id) => {
                      setDeviceId(id);
                      void rec.current
                        ?.switchDevice(id)
                        .then(() => {
                          setUnplugged(false);
                          rec.current?.resume();
                          setPaused(false);
                        })
                        .catch(() => toast.error(C.noDevice));
                    }}
                    className="w-[220px] [&>button]:justify-end [&>button]:text-[12px]"
                    menuClassName="left-auto w-[260px]"
                  />
                )}
                {phase.kind === 'asking' && <span className="text-[13px]">{C.waiting}</span>}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-10 gap-y-4">
                <p
                  className="font-poster text-[clamp(96px,13vw,168px)] leading-[0.85] tabular"
                  aria-live="off"
                >
                  {recordClock(phase.kind === 'review' ? phase.durationMs : elapsed)}
                </p>
                {phase.kind === 'review' ? (
                  <BigButton
                    label={playing ? 'Pause take' : 'Play take'}
                    onClick={() => {
                      const a = (audio.current ??= new Audio(phase.url));
                      a.onended = () => setPlaying(false);
                      if (a.paused) void a.play().then(() => setPlaying(true));
                      else {
                        a.pause();
                        setPlaying(false);
                      }
                    }}
                  >
                    {playing ? (
                      <Pause className="size-7 fill-ink" strokeWidth={0} />
                    ) : (
                      <Play className="ml-1 size-7 fill-ink" strokeWidth={0} />
                    )}
                  </BigButton>
                ) : (
                  <BigButton
                    label="Stop recording"
                    disabled={phase.kind !== 'recording'}
                    onClick={() => void stop()}
                  >
                    <Square className="size-6 fill-ink" strokeWidth={0} />
                  </BigButton>
                )}
              </div>

              <div ref={waveBox} className="mt-6 h-[84px] w-full overflow-hidden">
                {waveWidth > 0 && (
                  <LiveWaveform
                    key={phase.kind === 'review' ? 'take' : 'live'}
                    peaks={peaks}
                    live={phase.kind !== 'review'}
                    width={waveWidth}
                    height={84}
                    color="#000000"
                    tail="#ff6a3d"
                  />
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t-2 border-ink pt-5">
                <p
                  className={cn(
                    'text-[14px]',
                    phase.kind !== 'review' && (level === 'quiet' || unplugged) && 'text-warn',
                  )}
                  role="status"
                >
                  {phase.kind === 'review'
                    ? 'Happy with it? Pip will take it from here.'
                    : phase.kind === 'saving'
                      ? 'Keeping your take…'
                      : line}
                </p>
                <div className="flex items-center gap-4">
                  {phase.kind === 'review' ? (
                    <>
                      <button type="button" className={btn('paper')} onClick={() => void again()}>
                        {C.again}
                      </button>
                      <button type="button" className={btn('ink')} onClick={useTake}>
                        {C.useTake}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={phase.kind !== 'recording' || unplugged}
                        onClick={togglePause}
                        className={btn('paper', 'sm', false, 'w-[96px]')}
                      >
                        {paused ? C.resume : C.pause}
                      </button>
                      <button type="button" onClick={askDiscard} className={paper.link}>
                        {C.discard}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </section>

        <p className="mt-8 text-[13px]">{C.footLine}</p>
        <p className="mt-1 text-[12px] text-black/55">{C.footNote}</p>
      </main>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={C.discardTitle}
        description={C.discardBody}
        className="w-[440px]"
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="lg" onClick={() => setConfirm(false)}>
            {C.keep}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="bg-error/90 text-white hover:bg-error"
            onClick={() => void discardNow()}
          >
            {C.discardConfirm}
          </Button>
        </div>
      </Modal>
    </PaperPage>
  );
}

/** Stop / play: a big ember button that presses into its shadow. */
function BigButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      disabled={disabled}
      {...(disabled ? {} : buttonMotion)}
      onClick={onClick}
      className="flex size-[104px] items-center justify-center rounded-full border-2 border-ink bg-flame shadow-[4px_4px_0_#000] disabled:opacity-50"
    >
      {children}
    </motion.button>
  );
}

function ErrorBody({
  reason,
  onRetry,
  onUpload,
}: {
  reason: RecorderError;
  onRetry: () => void;
  onUpload: () => void;
}) {
  return (
    <div className="flex min-h-[340px] flex-col items-start justify-center gap-5">
      <p className="font-poster text-[56px] leading-[0.9] uppercase">No microphone, no problem.</p>
      <p className="max-w-[520px] text-[14px] leading-[1.6]" role="alert">
        {reason === 'no-device'
          ? C.noDevice
          : reason === 'unsupported'
            ? 'This browser can’t record here. Upload a file instead.'
            : C.denied}
      </p>
      <div className="flex gap-3">
        {reason !== 'unsupported' && (
          <button type="button" className={btn('paper')} onClick={onRetry}>
            {C.tryAgain}
          </button>
        )}
        <button type="button" className={btn('ink')} onClick={onUpload}>
          {C.uploadInstead}
        </button>
      </div>
    </div>
  );
}
