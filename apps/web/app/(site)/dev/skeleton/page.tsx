'use client';

import {
  applyParamsPatch,
  detectSlots,
  editContext,
  editPatchTask,
  splitEditDoc,
  tagSpans,
  type DetectSlotsResult,
} from '@motionpop/ai';
import { compileProject, type CompileAssets } from '@motionpop/motion/compiler';
import { components } from '@motionpop/motion';
import { editorialExplainer } from '@motionpop/motion/styles';
import type { Word } from '@motionpop/schemas';
import { getRouter } from '@/lib/ai/router-client';
import { decodeTo16kMono } from '@/lib/audio/decode-16k';
import { transcribeOnDevice } from '@/lib/transcribe/whisper-client';
import { useEffect, useRef, useState } from 'react';
import type { z } from 'zod';

const BIG_NUMBER_PARAMS = (components as Record<string, { params: z.ZodType }>)['big-number']!
  .params;
const EDIT_PATCH = editPatchTask((id) => (id === 'big-number' ? BIG_NUMBER_PARAMS : undefined));
const TIMING_DEFAULTS = { speed: 1, ease: 'inOut', fade: true } as const;

/** Walking skeleton (spec 00): voiceover → compile → HyperFrames player. Ugly on purpose. */
export default function SkeletonPage() {
  const [assets, setAssets] = useState<CompileAssets | null>(null);
  const [voice, setVoice] = useState<{ url: string; durationMs: number; file: File } | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, unknown>>({
    value: 40,
    suffix: '%',
    label: 'Revenue growth since 2020',
    context: 'The bigger picture',
  });
  const [instruction, setInstruction] = useState('change 40 to 45');
  const value = typeof params['value'] === 'number' ? params['value'] : 0;
  const label = typeof params['label'] === 'string' ? params['label'] : '';
  const setValue = (v: number) => setParams((p) => ({ ...p, value: v }));
  const setLabel = (l: string) => setParams((p) => ({ ...p, label: l }));
  const [startMs, setStartMs] = useState(500);
  const [log, setLog] = useState<string[]>([]);
  const [detected, setDetected] = useState<DetectSlotsResult | null>(null);
  const playerRef = useRef<HTMLElement | null>(null);

  // R6.1: every timing also goes to the console, so a run can be copied into DEV_LOG.
  const note = (line: string) => {
    console.info(`[skeleton] ${line}`);
    setLog((l) => [...l, line]);
  };

  useEffect(() => {
    void import('@hyperframes/player');
    fetch('/dev/skeleton/runtime')
      .then((r) => r.json() as Promise<CompileAssets>)
      .then(setAssets)
      .catch((e: unknown) => note(`runtime load failed: ${String(e)}`));
  }, []);

  const onFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.addEventListener('loadedmetadata', () => {
      const durationMs = Math.round(audio.duration * 1000);
      setVoice({ url, durationMs, file });
      setWords([]);
      note(`voice: ${file.name}, ${(durationMs / 1000).toFixed(1)} s`);
    });
  };

  const transcribe = async () => {
    if (!voice) return;
    try {
      setBusy('Decoding…');
      const t0 = performance.now();
      const { pcm, durationMs } = await decodeTo16kMono(voice.file);
      note(`decoded to 16 kHz mono in ${(performance.now() - t0).toFixed(0)} ms`);
      const res = await transcribeOnDevice(pcm, durationMs, {
        onProgress: (p) =>
          setBusy(
            p.stage === 'transcribing'
              ? 'Transcribing…'
              : `Loading model${p.percent === undefined ? '' : ` ${p.percent.toFixed(0)}%`}…`,
          ),
      });
      setWords(res.transcript.words);
      note(
        `whisper on ${res.device} (${res.model}): load ${res.loadMs} ms, transcribe ${res.inferMs} ms, ${res.transcript.words.length} words`,
      );
    } catch (e: unknown) {
      note(`transcribe failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  /** Spec 00 R2: slots.detect through the router (or the local detector), with ranOn shown. */
  const detect = async () => {
    try {
      setBusy('Detecting…');
      const spans = tagSpans(words);
      const router = await getRouter().catch(() => null);
      const res = await detectSlots(router, words, spans);
      setDetected(res);
      note(
        res.source === 'ai'
          ? `slots.detect ran on ${res.run.ranOn} (${res.run.model}) in ${res.run.latencyMs} ms, ${res.run.costCredits} credits, attempt ${res.run.attempts}: ${res.slots.length} slots`
          : `slots.detect local fallback${res.error ? ` (${res.error})` : ''}: ${res.slots.length} slots`,
      );
      const first = res.slots[0];
      const start = first && words[first.wordStart];
      if (first?.componentId === 'big-number' && start) {
        const p = first.params;
        if (typeof p['value'] === 'number') setValue(p['value']);
        if (typeof p['label'] === 'string') setLabel(p['label']);
        setStartMs(start.startMs);
      }
    } catch (e: unknown) {
      note(`detect failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  /** Spec 00 R5: a quick edit becomes an RFC 6902 patch (on-device first), then recompiles. */
  const quickEdit = async () => {
    try {
      setBusy('Editing…');
      const router = await getRouter().catch(() => null);
      if (!router) throw new Error('AI router unavailable (Firebase not configured)');
      const schema = BIG_NUMBER_PARAMS;
      const res = await router.run(
        EDIT_PATCH,
        {
          ...editContext(schema, 'big-number', params, undefined, TIMING_DEFAULTS),
          instruction,
        },
        { allowCloud: false },
      );
      if (res.output.escalate) {
        note(
          `edit.patch escalated on ${res.ranOn}: ${res.output.message ?? 'needs a new graphic'}`,
        );
        return;
      }
      const applied = applyParamsPatch(
        editContext(schema, 'big-number', params, undefined, TIMING_DEFAULTS).current,
        res.output.patch,
      );
      if (!applied.ok) throw new Error(applied.error);
      // The skeleton has no slot timing yet: keep the params, drop the timing part.
      const next = splitEditDoc(applied.params, TIMING_DEFAULTS).params;
      setParams(next);
      compile(next);
      note(
        `edit.patch ${res.ranOn === 'device' ? '⚡ device' : '☁ cloud'} (${res.model}) in ${res.latencyMs} ms, ${res.costCredits} credits, attempt ${res.attempts}: ${JSON.stringify(res.output.patch)}`,
      );
    } catch (e: unknown) {
      note(`quick edit failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const compile = (slotParams: Record<string, unknown> = params) => {
    if (!assets || !voice || !playerRef.current) return;
    const t0 = performance.now();
    const endMs = Math.min(voice.durationMs, startMs + 3600);
    const html = compileProject(
      {
        format: '16:9',
        durationMs: voice.durationMs,
        style: editorialExplainer,
        voiceSrc: voice.url,
        slots: [
          {
            id: 'slot-1',
            startMs,
            endMs,
            componentId: 'big-number',
            params: slotParams,
          },
        ],
      },
      assets,
    );
    playerRef.current.setAttribute('srcdoc', html);
    note(`compiled in ${(performance.now() - t0).toFixed(1)} ms`);
  };

  return (
    <main className="mx-auto flex max-w-[1280px] flex-col gap-4">
      <h1 className="text-xl font-semibold">Walking skeleton</h1>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="label-caps">Voiceover</span>
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-caps">Value</span>
          <input
            className="w-24 rounded-chip bg-card px-2 py-1"
            type="number"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-caps">Label</span>
          <input
            className="w-72 rounded-chip bg-card px-2 py-1"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-caps">Slot start (ms)</span>
          <input
            className="w-28 rounded-chip bg-card px-2 py-1"
            type="number"
            step={100}
            value={startMs}
            onChange={(e) => setStartMs(Math.round(Number(e.target.value)))}
          />
        </label>
        <button
          className="rounded-chip bg-card-2 px-4 py-2 font-medium disabled:opacity-40"
          disabled={!voice || busy !== null}
          onClick={() => void transcribe()}
        >
          {busy ?? 'Transcribe (on-device)'}
        </button>
        <button
          className="rounded-chip bg-card-2 px-4 py-2 font-medium disabled:opacity-40"
          disabled={words.length === 0 || busy !== null}
          onClick={() => void detect()}
          data-testid="detect"
        >
          Detect slots
        </button>
        <button
          className="rounded-chip bg-ember px-4 py-2 font-medium text-bg disabled:opacity-40"
          disabled={!assets || !voice}
          onClick={() => compile()}
        >
          Compile + preview
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="label-caps">Quick edit</span>
          <input
            className="w-96 rounded-chip bg-card px-2 py-1"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            data-testid="quick-edit-input"
          />
        </label>
        <button
          className="rounded-chip bg-card-2 px-4 py-2 font-medium disabled:opacity-40"
          disabled={busy !== null || instruction.trim() === ''}
          onClick={() => void quickEdit()}
          data-testid="quick-edit"
        >
          Apply edit
        </button>
        <code className="font-mono text-xs text-text-3" data-testid="params">
          {JSON.stringify(params)}
        </code>
      </div>
      {words.length > 0 && (
        <p className="flex flex-wrap gap-x-1 gap-y-0.5 text-sm leading-6" data-testid="words">
          {words.map((w) => (
            <button
              key={w.i}
              title={`${w.startMs}–${w.endMs} ms`}
              className={`rounded px-0.5 hover:bg-card-2 ${w.filler ? 'text-text-4 line-through' : ''} ${
                w.startMs === startMs ? 'bg-ember-soft text-ember' : ''
              }`}
              onClick={() => setStartMs(w.startMs)}
            >
              {w.text}
            </button>
          ))}
        </p>
      )}
      {detected && (
        <pre
          className="max-h-64 overflow-auto rounded-card bg-card p-3 font-mono text-xs text-text-2"
          data-testid="detected"
          data-source={detected.source}
        >
          {JSON.stringify(detected, null, 2)}
        </pre>
      )}
      <hyperframes-player
        ref={playerRef}
        width={1920}
        height={1080}
        controls
        style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', background: '#000' }}
      />
      <pre className="rounded-card bg-card p-3 font-mono text-xs text-text-2">
        {log.join('\n') || 'Pick a voiceover.'}
      </pre>
    </main>
  );
}
