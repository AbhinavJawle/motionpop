'use client';

import { ArrowRight, Mic, Type, Upload } from 'lucide-react';
import { motion } from 'motion/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { DASHBOARD_COPY, START_COPY as C } from '@/lib/dashboard/copy';
import { handOffFile, handOffSample, PROCESSING_NEW } from '@/lib/intake/hand-off';
import { useStartDraft } from '@/lib/intake/use-start-draft';
import { hoverLift } from '@/lib/motion/presets';
import { ProjectTopBar } from './project-top-bar';
import { StartHero } from './start-hero';

const ACCEPT = 'audio/*,.mp3,.wav,.m4a,.aac,.webm,.ogg,.opus';

/** Static ember waveform of the Record card (start.png). Deterministic heights. */
const WAVE = Array.from({ length: 60 }, (_, i) => {
  const v = Math.abs(Math.sin(i * 1.7) * 0.6 + Math.sin(i * 0.43) * 0.4);
  return Math.max(0.12, Math.min(1, v));
});

/**
 * `/start` (start.png, R7): the project top bar, Pip with arcs, the headline and three ways
 * in. Every path stores the audio and hands it to `/processing/new` (design §2.5).
 */
export function StartScreen() {
  const router = useRouter();
  const search = useSearchParams();
  const [draft, update] = useStartDraft();
  const [busy, setBusy] = useState(false);

  // `?style=` from a Try-a-style card preselects the style (R6.2).
  const style = search.get('style');
  useEffect(() => {
    if (style && style !== draft.styleId) update({ styleId: style });
  }, [style, draft.styleId, update]);

  const go = async (work: () => Promise<{ ok: true } | { ok: false; message: string }>) => {
    if (busy) return;
    setBusy(true);
    const r = await work();
    if (r.ok) router.push(PROCESSING_NEW);
    else {
      toast.error(r.message);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh min-w-[1280px] bg-bg text-text">
      <ProjectTopBar />
      <main className="flex flex-col items-center pb-16">
        <StartHero eyebrow={C.eyebrow} headline={C.headline} subline={C.subline} />
        <div className="mt-[62px] flex gap-[25px]">
          <RecordCard onStart={() => router.push('/start/record')} />
          <UploadCard
            busy={busy}
            onFile={(f) => void go(() => handOffFile(f, draft))}
            onSample={() => void go(() => handOffSample(draft))}
          />
          <ScriptCard initial={search.get('text') ?? ''} />
        </div>
        <button
          type="button"
          onClick={() => toast(DASHBOARD_COPY.toasts.single)}
          className="mt-[34px] text-[13px] leading-4 text-text-body transition-colors hover:text-text"
        >
          {C.single} →
        </button>
        <p className="mt-8 text-[11px] leading-[14px] text-text-2">{C.singleFoot}</p>
      </main>
    </div>
  );
}

function Card({
  tone,
  icon,
  title,
  body,
  children,
  testId,
}: {
  tone: 'ember' | 'violet';
  icon: ReactNode;
  title: string;
  body: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <motion.section
      {...hoverLift}
      data-testid={testId}
      className={cn(
        'flex h-[257px] w-[323px] flex-col rounded-2xl border bg-[linear-gradient(180deg,#121219,#0C0C11)] px-[23px] pt-[23px] pb-[23px] shadow-glass',
        tone === 'ember' ? 'border-ember/40' : 'border-line-strong',
      )}
    >
      <span
        className={cn(
          'flex size-[42px] items-center justify-center rounded-chip [&_svg]:size-[18px]',
          tone === 'ember' ? 'bg-ember/14 text-ember' : 'bg-violet/14 text-violet-ink',
        )}
      >
        {icon}
      </span>
      <h2 className="mt-[22px] text-xl leading-6 font-semibold tracking-[-0.2px]">{title}</h2>
      <p className="mt-[5px] text-[13px] leading-4 text-text-2">{body}</p>
      <div className="mt-auto">{children}</div>
    </motion.section>
  );
}

function RecordCard({ onStart }: { onStart: () => void }) {
  return (
    <Card
      testId="start-record"
      tone="ember"
      icon={<Mic strokeWidth={1.5} aria-hidden />}
      title={C.record.title}
      body={C.record.body}
    >
      <div aria-hidden className="mb-[30px] flex h-8 items-center gap-[3px]">
        {WAVE.map((v, i) => (
          <span
            key={i}
            className="w-[1.5px] rounded-full"
            style={{
              height: `${Math.round(v * 30)}px`,
              background: i > 48 ? 'rgb(255 122 61 / 0.45)' : 'var(--color-ember)',
            }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onStart}
        className="flex w-full items-center justify-between text-xs leading-4 font-medium text-ember-ink outline-none hover:text-ember focus-visible:underline"
      >
        {C.record.cta}
        <ArrowRight className="size-4 text-ember" strokeWidth={1.75} aria-hidden />
      </button>
    </Card>
  );
}

function UploadCard({
  busy,
  onFile,
  onSample,
}: {
  busy: boolean;
  onFile: (f: File) => void;
  onSample: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };
  return (
    <Card
      testId="start-upload"
      tone="violet"
      icon={<Upload strokeWidth={1.5} aria-hidden />}
      title={C.upload.title}
      body={C.upload.body}
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          'flex h-[84px] flex-col items-center justify-center rounded-chip border border-dashed transition-colors',
          over ? 'border-violet/70 bg-violet/8' : 'border-white/16 bg-black/20',
        )}
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="text-xs leading-4 font-medium text-text outline-none hover:text-violet-ink focus-visible:underline disabled:opacity-50"
        >
          {C.upload.drop}
        </button>
        <p className="mt-[9px] text-[9px] leading-3 text-text-2">
          {C.upload.formats} ·{' '}
          <button
            type="button"
            disabled={busy}
            onClick={onSample}
            className="text-violet-ink-2 underline-offset-2 outline-none hover:underline focus-visible:underline disabled:opacity-50"
          >
            {C.upload.sample}
          </button>
        </p>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onFile(f);
          }}
        />
      </div>
    </Card>
  );
}

/** Paste script: the typed text goes to `/start/script` (task 18), where the voice is made. */
function ScriptCard({ initial }: { initial: string }) {
  const router = useRouter();
  const [text, setText] = useState(initial.slice(0, 3000));
  const open = () =>
    router.push(text.trim() ? `/start/script?text=${encodeURIComponent(text)}` : '/start/script');
  return (
    <Card
      testId="start-script"
      tone="violet"
      icon={<Type strokeWidth={1.5} aria-hidden />}
      title={C.script.title}
      body={C.script.body}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            open();
          }
        }}
        maxLength={3000}
        rows={2}
        aria-label="Script"
        placeholder={C.script.placeholder}
        className="mb-[22px] h-[46px] w-full resize-none rounded-chip bg-transparent px-[13px] pt-[15px] text-xs leading-4 text-text outline-none placeholder:text-text-body focus:bg-black/20"
      />
      <button
        type="button"
        onClick={open}
        className="group flex w-full items-center justify-between text-xs leading-4 font-medium text-violet-ink-2"
      >
        {C.script.cta}
        <ArrowRight
          className="size-4 text-violet transition-transform group-hover:translate-x-0.5"
          strokeWidth={1.75}
          aria-hidden
        />
      </button>
    </Card>
  );
}
