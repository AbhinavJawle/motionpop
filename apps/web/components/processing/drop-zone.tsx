'use client';

import { motion } from 'motion/react';
import { useRef, useState, type DragEvent } from 'react';
import { Upload } from 'lucide-react';
import { btn } from '@/components/paper/kit';
import { cn } from '@/lib/cn';
import { INTAKE_LIMITS, validateIntake } from '@/lib/audio/intake';
import { springPop } from '@/lib/motion/presets';

const ACCEPT =
  'audio/*,video/mp4,video/quicktime,video/webm,.mp3,.wav,.m4a,.aac,.webm,.ogg,.opus,.mp4,.mov';

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
          'flex h-[300px] w-full flex-col items-center justify-center rounded-[16px] border-[2.5px] border-dashed border-ink px-6 text-center transition-colors duration-200 outline-none focus-visible:ring-4 focus-visible:ring-flame',
          over ? 'bg-[#eef5fc]' : 'bg-mist hover:bg-[#ececE8]',
        )}
      >
        <Upload className="size-9" strokeWidth={1.75} aria-hidden />
        <span className="mt-5 font-poster text-[44px] leading-[0.9] uppercase">
          {over ? 'Drop it, I’ll catch it!' : 'Drop your voiceover or video'}
        </span>
        <span className="mt-3 text-[14px]">or click to choose a file</span>
        <span className="mt-5 text-[12px] text-black/55">
          MP3, WAV or M4A, or MP4 and MOV up to {INTAKE_LIMITS.maxVideoBytes / 1024 / 1024} MB, at
          most {INTAKE_LIMITS.maxDurationMs / 60_000} minutes
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
        <p role="alert" className="mt-4 self-start text-[13px] text-error">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onSample}
        className={btn('ink', 'lg', false, 'mt-6 self-start')}
      >
        Try a sample
      </button>
    </div>
  );
}
