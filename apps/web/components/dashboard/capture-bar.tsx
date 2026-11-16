'use client';

import { Mic } from 'lucide-react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { DASHBOARD_COPY as C } from '@/lib/dashboard/copy';
import { buttonMotion } from '@/lib/motion/presets';

export interface CaptureBarHandle {
  focus(): void;
}

/**
 * The capture bar (projects.png, design §5 and §11): 1296×64, card colour, r32, violet inner
 * glow. Mic in an ember ring + "Hold to record", divider, the hint (an input: paste or type a
 * script, Enter opens it on Start), "MP3 · WAV · M4A", "⌘K".
 */
export const CaptureBar = forwardRef<CaptureBarHandle, object>(function CaptureBar(_, ref) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');

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

  const submit = () => {
    const t = text.trim();
    if (t) router.push(`/start?text=${encodeURIComponent(t.slice(0, 3000))}`);
  };

  return (
    <div
      data-testid="capture-bar"
      className="flex h-16 items-center rounded-[32px] bg-card pr-8 pl-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.05),inset_0_0_24px_1px_rgb(139_124_255/0.12)] outline outline-1 -outline-offset-1 outline-violet/15"
    >
      <motion.button
        type="button"
        {...buttonMotion}
        aria-label="Record a voiceover"
        onClick={() => router.push('/start/record')}
        className="flex size-11 items-center justify-center rounded-full border border-ember/70 bg-[radial-gradient(closest-side,rgb(255_122_61/0.18),rgb(255_122_61/0.06))] text-ember shadow-[0_0_16px_rgb(255_122_61/0.18)]"
      >
        <Mic className="size-[18px]" strokeWidth={1.5} aria-hidden />
      </motion.button>
      <span className="ml-4 text-sm leading-[18px] font-medium text-text">{C.capture.hold}</span>
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
    </div>
  );
});
