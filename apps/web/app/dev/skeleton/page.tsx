'use client';

import { compileProject, type CompileAssets } from '@motionpop/motion/compiler';
import { useEffect, useRef, useState } from 'react';

const STYLE = {
  colors: { bg: '#0b0b0f', ink: '#f4f3f8', muted: '#a09eae', accent: '#ff7a3d' },
  fonts: {
    // Real families only: CSS variables from the app don't exist inside the composition iframe.
    display: 'Geist, Inter, system-ui, sans-serif',
    body: 'Geist, Inter, system-ui, sans-serif',
    mono: 'ui-monospace, monospace',
  },
};

/** Walking skeleton (spec 00): voiceover → compile → HyperFrames player. Ugly on purpose. */
export default function SkeletonPage() {
  const [assets, setAssets] = useState<CompileAssets | null>(null);
  const [voice, setVoice] = useState<{ url: string; durationMs: number } | null>(null);
  const [value, setValue] = useState(40);
  const [label, setLabel] = useState('Revenue growth since 2020');
  const [startMs, setStartMs] = useState(500);
  const [log, setLog] = useState<string[]>([]);
  const playerRef = useRef<HTMLElement | null>(null);

  const note = (line: string) => setLog((l) => [...l, line]);

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
      setVoice({ url, durationMs });
      note(`voice: ${file.name}, ${(durationMs / 1000).toFixed(1)} s`);
    });
  };

  const compile = () => {
    if (!assets || !voice || !playerRef.current) return;
    const t0 = performance.now();
    const endMs = Math.min(voice.durationMs, startMs + 3600);
    const html = compileProject(
      {
        width: 1280,
        height: 720,
        format: '16:9',
        durationMs: voice.durationMs,
        style: STYLE,
        voiceSrc: voice.url,
        slots: [
          {
            id: 'slot-1',
            startMs,
            endMs,
            componentId: 'big-number',
            params: { value, suffix: '%', label, context: 'The bigger picture' },
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
          className="rounded-chip bg-ember px-4 py-2 font-medium text-bg disabled:opacity-40"
          disabled={!assets || !voice}
          onClick={compile}
        >
          Compile + preview
        </button>
      </div>
      <hyperframes-player
        ref={playerRef}
        width={1280}
        height={720}
        controls
        style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', background: '#000' }}
      />
      <pre className="rounded-card bg-card p-3 font-mono text-xs text-text-2">
        {log.join('\n') || 'Pick a voiceover.'}
      </pre>
    </main>
  );
}
