'use client';

import { motion } from 'motion/react';
import { useRef, useState, type DragEvent } from 'react';
import { Pip } from '@/components/pip/pip';
import { cn } from '@/lib/cn';
import { INTAKE_LIMITS, validateIntake } from '@/lib/audio/intake';
import { springPop } from '@/lib/motion/presets';

const ACCEPT = 'audio/*,video/mp4,video/quicktime,video/webm,.mp3,.wav,.m4a,.aac,.webm,.ogg,.opus,.mp4,.mov';

/**
 * Minimal entry for spec 05 (the designed Start screen is spec 11): drop or pick a voiceover,
 * or try the sample. The intake check runs here first, so a wrong file never starts a step.
 */
export function DropZone({
  onFile,
  onSample,
  initialError,
}: {
  onFile: (file: File) => void;
  onSample: () => void;
  initialError?: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  const take = (file: File | undefined) => {
    if (!file) return;
    const r = validateIntake(file);
    if (!r.ok) return setError(r.message);
    setError(null);
    onFile(file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer.files[0]);
  };

  return (
    <div className="flex flex-col items-center">
      <motion.button
        type="button"
        aria-label="Drop a voiceover here, or choose a file"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        animate={{ scale: over ? 1.02 : 1 }}
        transition={springPop}
        className={cn(
          'flex h-[260px] w-full flex-col items-center justify-center rounded-2xl border border-dashed transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-violet',
          over
            ? 'border-violet/70 bg-violet/8'
            : 'border-white/14 bg-[rgb(21_21_29/0.7)] hover:border-white/24',
        )}
      >
        <Pip size={84} state={over ? 'catching' : 'idle'} glow={over} decorative seed={11} />
        <span className="mt-4 text-[17px] leading-[22px] font-semibold text-text">
          {over ? 'Drop it, I’ll catch it!' : 'Drop your voiceover or video'}
        </span>
        <span className="mt-1.5 text-[12px] leading-4 text-text-2">or click to choose a file</span>
        <span className="mt-4 font-mono text-[10px] leading-[13px] text-text-3">
          MP3, WAV, M4A · MP4 or MOV up to {INTAKE_LIMITS.maxVideoBytes / 1024 / 1024} MB ·{' '}
          {INTAKE_LIMITS.maxDurationMs / 60_000} min
        </span>
      </motion.button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {error && (
        <p role="alert" className="mt-3 text-[12px] leading-4 text-error">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onSample}
        className="mt-5 text-[12px] leading-4 font-medium text-violet-ink underline-offset-4 hover:underline"
      >
        ✦ Try a sample
      </button>
    </div>
  );
}
