'use client';

import { Pause, Play, Square } from 'lucide-react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pip } from '@/components/pip/pip';
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
import { PROCESSING_NEW, recordMeta } from '@/lib/intake/hand-off';
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
      if (waiting) {
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

  const useTake = () => router.push(PROCESSING_NEW);
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
    <div className="min-h-dvh min-w-[1280px] bg-bg text-text">
      <ProjectTopBar />
      <main className="flex flex-col items-center pb-16">
        <StartHero
          eyebrow={phase.kind === 'review' ? C.reviewEyebrow : C.eyebrow}
          headline={phase.kind === 'review' ? C.reviewHeadline : C.headline}
          subline={phase.kind === 'review' ? C.reviewSubline : C.subline}
          pipSlot={
            phase.kind === 'review' ? (
              <Pip state="waving" size={150} decorative seed={6} />
            ) : (
              <Pip state="listening" size={150} props={['arcs']} decorative seed={6} />
            )
          }
        />

        <section
          aria-label="Recorder"
          className="mt-[62px] h-[257px] w-[840px] rounded-2xl border border-line-strong bg-[linear-gradient(180deg,#121219,#0C0C11)] px-[28px] pt-[24px] shadow-glass"
        >
          {phase.kind === 'error' ? (
            <ErrorBody
              reason={phase.reason}
              onRetry={() => void begin()}
              onUpload={() => router.push('/start')}
            />
          ) : (
            <>
              <div className="flex h-5 items-center justify-between">
                <p
                  className={cn(
                    'flex items-center gap-[11px] text-[10px] leading-[13px] font-medium tracking-[1.6px]',
                    phase.kind === 'review' ? 'text-mint' : 'text-ember',
                  )}
                >
                  <span
                    className={cn(
                      'size-[5px] rounded-full',
                      phase.kind === 'review' ? 'bg-mint' : 'bg-ember',
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
                    className="mr-[62px] w-[180px] [&>button]:justify-end [&>button]:text-text-2"
                    menuClassName="left-auto w-[260px]"
                  />
                )}
                {phase.kind === 'asking' && (
                  <span className="text-[11px] leading-[14px] text-text-2">{C.waiting}</span>
                )}
              </div>

              <div className="mt-[32px] flex">
                <div className="flex w-[164px] flex-col items-center">
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
                        <Pause className="size-6 fill-white text-white" strokeWidth={1.5} />
                      ) : (
                        <Play className="ml-1 size-6 fill-white text-white" strokeWidth={1.5} />
                      )}
                    </BigButton>
                  ) : (
                    <BigButton
                      label="Stop recording"
                      disabled={phase.kind !== 'recording'}
                      onClick={() => void stop()}
                    >
                      <Square className="size-[22px] fill-white text-white" strokeWidth={0} />
                    </BigButton>
                  )}
                  <p className="mt-[14px] text-[11px] leading-[14px] text-text-2">
                    {phase.kind === 'review' ? (playing ? 'Playing' : 'Play your take') : C.stop}
                  </p>
                </div>
                <div className="ml-[28px] flex flex-1 flex-col pt-[3px]">
                  <LiveWaveform
                    key={phase.kind === 'review' ? 'take' : 'live'}
                    peaks={peaks}
                    live={phase.kind !== 'review'}
                  />
                  <div className="mt-[22px] flex items-start">
                    <div>
                      <p className="font-mono text-[28px] leading-[34px] tabular" aria-live="off">
                        {recordClock(phase.kind === 'review' ? phase.durationMs : elapsed)}
                      </p>
                      <p
                        className={cn(
                          'mt-[3px] text-[11px] leading-[14px]',
                          phase.kind === 'review'
                            ? 'text-text-2'
                            : level === 'quiet' || unplugged
                              ? 'text-warn'
                              : 'text-text-2',
                        )}
                        role="status"
                      >
                        {phase.kind === 'review'
                          ? 'Happy with it? Pip will take it from here.'
                          : phase.kind === 'saving'
                            ? 'Keeping your take…'
                            : line}
                      </p>
                    </div>
                    <div className="ml-auto flex items-center gap-6 pt-[1px] pr-[22px]">
                      {phase.kind === 'review' ? (
                        <>
                          <Button variant="secondary" size="lg" onClick={() => void again()}>
                            {C.again}
                          </Button>
                          <Button variant="primary" size="lg" onClick={useTake}>
                            {C.useTake}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="secondary"
                            disabled={phase.kind !== 'recording' || unplugged}
                            onClick={togglePause}
                            className="h-[34px] w-[86px] border border-line-strong text-xs"
                          >
                            {paused ? C.resume : C.pause}
                          </Button>
                          <button
                            type="button"
                            onClick={askDiscard}
                            className="text-xs leading-4 text-text-2 transition-colors hover:text-text"
                          >
                            {C.discard}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        <p className="mt-[36px] text-[13px] leading-4 text-text-2">{C.footLine}</p>
        <p className="mt-8 text-[11px] leading-[14px] text-text-2">{C.footNote}</p>
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
    </div>
  );
}

/** Stop / play button (recording.png: ring 116, fill 84 ember-fill, white square 22). */
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
      className="flex size-[116px] items-center justify-center rounded-full border-2 border-ember/45 bg-ember/8 shadow-[0_0_28px_rgb(255_122_61/0.18)] disabled:opacity-60"
    >
      <span className="flex size-[84px] items-center justify-center rounded-full bg-[linear-gradient(180deg,#FF7A55,#FF4D6D)] shadow-[0_4px_20px_rgb(255_90_80/0.35)]">
        {children}
      </span>
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
    <div className="flex h-full flex-col items-center justify-center gap-4 pb-6 text-center">
      <Pip state="empty-pockets" size={64} decorative seed={2} />
      <p className="max-w-[440px] text-[13px] leading-[18px] text-text-2" role="alert">
        {reason === 'no-device'
          ? C.noDevice
          : reason === 'unsupported'
            ? 'This browser can’t record here. Upload a file instead.'
            : C.denied}
      </p>
      <div className="flex gap-2">
        {reason !== 'unsupported' && (
          <Button variant="secondary" size="lg" onClick={onRetry}>
            {C.tryAgain}
          </Button>
        )}
        <Button variant="primary" size="lg" onClick={onUpload}>
          {C.uploadInstead}
        </Button>
      </div>
    </div>
  );
}
