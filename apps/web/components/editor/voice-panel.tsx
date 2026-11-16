'use client';

import { TTS_VOICES } from '@motionpop/ai';
import type { EditorProject } from '@motionpop/schemas';
import { Mic, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Modal } from '@/components/ui/modal';
import { peaksForRange } from '@/lib/audio/peaks';
import { cn } from '@/lib/cn';
import { clock } from '@/lib/dashboard/format';
import { useVoiceState } from '@/lib/editor/voice-state';
import { nextTakeTitle, panelWords } from '@/lib/editor/voice-words';
import { handOffFile, PROCESSING_NEW } from '@/lib/intake/hand-off';
import { writeDraft } from '@/lib/intake/pending';
import { cleanupSummary } from '@/lib/pipeline/events';
import { flushSave } from '@/lib/stores/autosave';
import { useEditor } from '@/lib/stores/editor';

const SOURCE_LABEL = {
  record: 'Recorded',
  upload: 'Uploaded',
  tts: 'Generated voice',
  sample: 'Sample',
} as const;

const NEW_TAKE = {
  title: 'Record a new take?',
  body: 'A new take becomes a new project with the same title, style and settings. This one stays in Projects.',
} as const;

/**
 * The editor's Voice panel (spec 11 R11.1–R11.2, design §12; not designed, Pip-panel language):
 * where the voice came from, its waveform, the cleanup result and the transcript (click a word
 * to seek; removed fillers struck through). A new take always starts a new project.
 */
export function VoicePanelBody() {
  const project = useEditor((s) => s.project);
  const load = useVoiceState((s) => s.status);
  const [take, setTake] = useState<'record' | 'replace' | null>(null);

  if (!project) return null;
  const v = project.voiceover;
  const source = v.source ? SOURCE_LABEL[v.source] : 'Voiceover';
  const voiceLabel = v.tts ? TTS_VOICES.find((x) => x.id === v.tts?.voiceId)?.label : undefined;

  return (
    <div className="flex h-full flex-col px-5 pt-4 pb-4">
      <header className="flex h-10 shrink-0 items-center border-b border-white/6 pb-3">
        <h2 className="text-[17px] leading-[22px] font-semibold text-text">Voice</h2>
      </header>

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pt-3 pb-6">
        <section className="rounded-card border border-line bg-card p-3 shadow-quiet">
          <div className="flex items-center justify-between">
            <Chip tone={v.source === 'tts' ? 'violet' : 'ember'}>{source}</Chip>
            <span className="font-mono text-[11px] leading-[14px] text-text-2 tabular">
              {clock(v.durationMs)}
            </span>
          </div>
          <Waveform durationMs={v.durationMs} />
          {load === 'elsewhere' && (
            <p role="status" className="mt-2 text-[11px] leading-[14px] text-warn">
              This voiceover lives on another device
            </p>
          )}
          {load === 'error' && (
            <p role="status" className="mt-2 text-[11px] leading-[14px] text-error">
              Couldn’t load the voiceover in this browser.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button size="md" className="flex-1" onClick={() => setTake('record')}>
              <Mic strokeWidth={1.5} aria-hidden />
              Re-record
            </Button>
            <Button size="md" className="flex-1" onClick={() => setTake('replace')}>
              <Upload strokeWidth={1.5} aria-hidden />
              Replace audio
            </Button>
          </div>
        </section>

        <CleanupLine project={project} />

        {v.tts && (
          <section className="mt-4">
            <h3 className="text-[10px] leading-[13px] font-medium tracking-[0.9px] text-text-3 uppercase">
              Script{voiceLabel ? ` · ${voiceLabel} voice` : ''}
            </h3>
            <p className="mt-2 rounded-card border border-line-soft bg-card/60 p-3 text-[12px] leading-[18px] whitespace-pre-wrap text-text-2">
              {v.tts.script}
            </p>
          </section>
        )}

        <Transcript project={project} />
      </div>

      <NewTakeModal project={project} kind={take} onClose={() => setTake(null)} />
    </div>
  );
}

function CleanupLine({ project }: { project: EditorProject }) {
  const v = project.voiceover;
  const c = v.cleanup;
  if (!c) return null;
  const text =
    v.source === 'tts'
      ? 'Skipped for generated voices'
      : c.skipped
        ? 'Kept your audio as it is'
        : c.enabled
          ? cleanupSummary(c.fillersRemoved, c.pausesShortened)
          : 'Cleanup is off';
  const good = c.enabled && (c.fillersRemoved > 0 || c.pausesShortened > 0);
  return (
    <section className="mt-4">
      <h3 className="text-[10px] leading-[13px] font-medium tracking-[0.9px] text-text-3 uppercase">
        Clean up fillers and pauses
      </h3>
      <p className={cn('mt-1.5 text-[12px] leading-4', good ? 'text-mint' : 'text-text-2')}>
        {text}
      </p>
    </section>
  );
}

function Transcript({ project }: { project: EditorProject }) {
  const seek = useVoiceState((s) => s.seek);
  const words = useMemo(
    () =>
      panelWords(
        project.transcript.words,
        project.originalTranscript?.words,
        project.voiceover.cleanup?.enabled === true,
      ),
    [project.transcript.words, project.originalTranscript?.words, project.voiceover.cleanup],
  );
  return (
    <section className="mt-4">
      <h3 className="text-[10px] leading-[13px] font-medium tracking-[0.9px] text-text-3 uppercase">
        Transcript
      </h3>
      <p className="mt-2 flex flex-wrap gap-x-1 gap-y-0.5 text-[13px] leading-[20px]">
        {words.map(({ word, atMs }, i) =>
          atMs === null ? (
            <s key={i} className="px-0.5 text-text-4" title="Removed by cleanup">
              {word.text}
            </s>
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => seek?.(atMs)}
              className="rounded px-0.5 text-text-2 transition-colors hover:bg-card-2 hover:text-text focus-visible:ring-2 focus-visible:ring-violet focus-visible:outline-none"
            >
              {word.text}
            </button>
          ),
        )}
      </p>
    </section>
  );
}

const WAVE_H = 60;
const PITCH = 3;
const BAR = 2;

function Waveform({ durationMs }: { durationMs: number }) {
  const peaks = useVoiceState((s) => s.peaks);
  const bucketMs = useVoiceState((s) => s.bucketMs);
  const ref = useRef<HTMLCanvasElement>(null);
  // The panel slides open from 0 px wide, so draw at the settled width.
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => setWidth(Math.round(canvas.clientWidth)));
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(WAVE_H * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, WAVE_H);
    if (!peaks) return;
    const cols = Math.floor(width / PITCH);
    const agg = peaksForRange(peaks, bucketMs, 0, durationMs, cols);
    let peak = 0;
    for (let i = 0; i < agg.length; i++) peak = Math.max(peak, Math.abs(agg[i] ?? 0));
    if (peak === 0) return;
    ctx.fillStyle =
      getComputedStyle(document.documentElement).getPropertyValue('--color-ember').trim() ||
      'orange';
    for (let c = 0; c < cols; c++) {
      const amp = Math.max(Math.abs(agg[c * 2] ?? 0), Math.abs(agg[c * 2 + 1] ?? 0)) / peak;
      const h = Math.max(2, amp * (WAVE_H - 8));
      ctx.beginPath();
      ctx.roundRect(c * PITCH, WAVE_H / 2 - h / 2, BAR, h, 1);
      ctx.fill();
    }
  }, [peaks, bucketMs, durationMs, width]);

  return (
    <div className="mt-3 rounded-lg bg-ember/6 px-2">
      <canvas
        ref={ref}
        aria-label="Voiceover waveform"
        role="img"
        className={cn(
          'block h-[60px] w-full',
          !peaks && 'animate-pulse motion-reduce:animate-none',
        )}
      />
    </div>
  );
}

function NewTakeModal({
  project,
  kind,
  onClose,
}: {
  project: EditorProject;
  kind: 'record' | 'replace' | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const draft = () =>
    writeDraft({
      title: nextTakeTitle(project.title),
      format: project.format,
      styleId: project.styleId,
    });

  const confirm = async () => {
    if (kind === 'replace') {
      file.current?.click();
      return;
    }
    setBusy(true);
    draft();
    await flushSave();
    router.push(`/start/record?from=${encodeURIComponent(project.id)}`);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    const r = await handOffFile(f, draft());
    if (!r.ok) {
      setBusy(false);
      toast(r.message);
      return;
    }
    await flushSave();
    router.push(PROCESSING_NEW);
  };

  return (
    <Modal
      open={kind !== null}
      onClose={onClose}
      title={NEW_TAKE.title}
      description={NEW_TAKE.body}
      className="w-[440px]"
    >
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="lg" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" size="lg" disabled={busy} onClick={() => void confirm()}>
          {kind === 'replace' ? 'Choose a file' : 'Record a new take'}
        </Button>
      </div>
      <input
        ref={file}
        type="file"
        accept="audio/*"
        hidden
        data-testid="voice-replace-input"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
    </Modal>
  );
}
