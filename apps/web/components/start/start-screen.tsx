'use client';

import { Mic, Upload } from 'lucide-react';
import { btn, paper, PaperPage, poster } from '@/components/paper/kit';
import { motion } from 'motion/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { START_COPY as C } from '@/lib/dashboard/copy';
import {
  CONFIGURE,
  handOffFile,
  handOffFiles,
  handOffSample,
  PROCESSING_NEW,
} from '@/lib/intake/hand-off';
import { handOffSingle, SINGLE_MAX_WORDS } from '@/lib/intake/single';
import { useStartDraft } from '@/lib/intake/use-start-draft';
import { ProjectTopBar } from './project-top-bar';
import { putScriptDraft, readScriptDraft } from '@/lib/script/hand-off';
import { StartHero } from './start-hero';

const ACCEPT =
  'audio/*,video/mp4,video/quicktime,video/webm,image/png,image/jpeg,image/webp,.mp3,.wav,.m4a,.aac,.webm,.ogg,.opus,.mp4,.mov,.png,.jpg,.jpeg,.webp';

/** Static waveform of the Record panel. Deterministic heights. */
const WAVE = Array.from({ length: 60 }, (_, i) => {
  const v = Math.abs(Math.sin(i * 1.7) * 0.6 + Math.sin(i * 0.43) * 0.4);
  return Math.max(0.12, Math.min(1, v));
});

/**
 * `/start` (spec 11 R7, redrawn in spec 35): the project bar, a poster headline with Pip, and
 * three ways in as storyboard panels. Every path stores the audio and hands it to `/processing/new` (design §2.5).
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

  const go = async (
    work: () => Promise<{ ok: true } | { ok: false; message: string }>,
    to: string = CONFIGURE,
  ) => {
    if (busy) return;
    setBusy(true);
    const r = await work();
    if (r.ok) router.push(to);
    else {
      toast.error(r.message);
      setBusy(false);
    }
  };

  return (
    <PaperPage>
      <ProjectTopBar />
      <main className="mx-auto w-full max-w-[1240px] px-6 pb-20 lg:px-10">
        <StartHero bubble={C.eyebrow} headline={C.headline} subline={C.subline} />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-3 md:gap-0">
          <RecordCard onStart={() => router.push('/start/record')} />
          <UploadCard
            busy={busy}
            onFiles={(files) =>
              void go(() =>
                files.length === 1 ? handOffFile(files[0]!, draft) : handOffFiles(files, draft),
              )
            }
            onSample={() => void go(() => handOffSample(draft))}
          />
          <ScriptCard initial={search.get('text') ?? readScriptDraft()} />
        </div>
        <div className="mt-12 flex flex-col items-start gap-3 border-t-2 border-ink pt-8">
          <SingleGraphic
            busy={busy}
            onMake={(line) => void go(() => handOffSingle(line, draft), PROCESSING_NEW)}
          />
          <p className="text-[12px] text-black/55">{C.singleFoot}</p>
        </div>
      </main>
    </PaperPage>
  );
}

const SLANT = { first: paper.slantFirst, mid: paper.slantMid, last: paper.slantLast } as const;

/** One way in, as a storyboard panel leaning into its neighbours (md and up). */
function Card({
  slant,
  className,
  title,
  body,
  children,
  testId,
}: {
  slant: keyof typeof SLANT;
  className: string;
  title: string;
  body: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <div className={cn(paper.outline, 'md:-mx-[2px]')}>
      <section
        data-testid={testId}
        className={cn(
          SLANT[slant],
          'flex h-full min-h-[380px] flex-col rounded-xl px-8 pt-8 pb-8 md:rounded-none',
          slant !== 'first' && 'md:pl-12',
          slant !== 'last' && 'md:pr-12',
          className,
        )}
      >
        <h2 className={cn(poster, 'text-[56px]')}>{title}</h2>
        <p className="mt-2 text-[14px]">{body}</p>
        <div className="mt-auto pt-8">{children}</div>
      </section>
    </div>
  );
}

function RecordCard({ onStart }: { onStart: () => void }) {
  return (
    <Card
      testId="start-record"
      slant="first"
      className="bg-flame"
      title={C.record.title}
      body={C.record.body}
    >
      <div aria-hidden className="mb-7 flex h-12 items-center gap-[3px] overflow-hidden">
        {WAVE.map((v, i) => (
          <span
            key={i}
            className="w-[3px] rounded-full bg-ink"
            style={{ height: `${Math.round(v * 46)}px`, opacity: i > 44 ? 0.3 : 1 }}
          />
        ))}
      </div>
      <button type="button" onClick={onStart} className={btn('ink', 'lg')}>
        <Mic className="size-4" strokeWidth={2} aria-hidden />
        {C.record.cta}
      </button>
    </Card>
  );
}

function UploadCard({
  busy,
  onFiles,
  onSample,
}: {
  busy: boolean;
  onFiles: (files: File[]) => void;
  onSample: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const list = Array.from(e.dataTransfer.files);
    if (list.length > 0) onFiles(list);
  };
  return (
    <Card
      testId="start-upload"
      slant="mid"
      className="bg-paper"
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
          'flex h-[120px] flex-col items-center justify-center gap-2 rounded-[10px] border-2 border-dashed border-ink transition-colors',
          over ? 'bg-[#eef5fc]' : 'bg-mist',
        )}
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className={btn('paper', 'md')}
        >
          <Upload className="size-4" strokeWidth={2} aria-hidden />
          {C.upload.drop}
        </button>
        <p className="px-4 text-center text-[11px] text-black/60">
          {C.upload.formats}, plus B-roll and screenshots
        </p>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const list = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = '';
            if (list.length > 0) onFiles(list);
          }}
        />
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={onSample}
        className={cn(paper.link, 'mt-4 disabled:opacity-50')}
      >
        {C.upload.sample}
      </button>
    </Card>
  );
}

/** Paste script: the typed text goes to `/start/script` (task 18), where the voice is made. */
function ScriptCard({ initial }: { initial: string }) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const open = () => {
    putScriptDraft(text);
    router.push('/start/script');
  };
  return (
    <Card
      testId="start-script"
      slant="last"
      className="bg-ink text-paper"
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
        rows={3}
        aria-label="Script"
        placeholder={C.script.placeholder}
        className="mb-5 h-[92px] w-full resize-none rounded-[10px] border-2 border-paper/40 bg-transparent px-3.5 py-3 text-[14px] text-paper outline-none placeholder:text-paper/50 focus:border-paper"
      />
      <button type="button" onClick={open} className={btn('paper', 'lg', true)}>
        {C.script.cta}
      </button>
    </Card>
  );
}

/**
 * "Or just make a single graphic": opens one line to type. The line becomes a short project
 * with one graphic on a silent track, chosen from its words (a number, a place, a comparison).
 */
function SingleGraphic({ busy, onMake }: { busy: boolean; onMake: (line: string) => void }) {
  const [open, setOpen] = useState(false);
  const [line, setLine] = useState('');
  const words = line.trim().split(/\s+/).filter(Boolean).length;
  const tooLong = words > SINGLE_MAX_WORDS;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={paper.link}>
        {C.single}
      </button>
    );
  }
  const submit = () => {
    if (busy || words === 0 || tooLong) return;
    onMake(line.trim());
  };
  return (
    <motion.form
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex w-full max-w-[620px] flex-col items-start gap-2"
    >
      <div className={cn(paper.field, 'flex w-full items-center gap-2 p-1.5 pl-4')}>
        <input
          autoFocus
          value={line}
          onChange={(e) => setLine(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
          aria-label="Line for a single graphic"
          placeholder="Revenue grew 40% since 2020"
          maxLength={200}
          className="h-9 flex-1 bg-transparent text-[14px] outline-none placeholder:text-black/45"
        />
        <button
          type="submit"
          disabled={busy || words === 0 || tooLong}
          className={btn('ink', 'sm')}
        >
          Make it
        </button>
      </div>
      <p className={cn('text-[11px] leading-[14px]', tooLong ? 'text-error' : 'text-black/55')}>
        {tooLong
          ? `Keep it to ${SINGLE_MAX_WORDS} words for one graphic.`
          : 'One line, one graphic. Numbers, places and comparisons each get their own kind.'}
      </p>
    </motion.form>
  );
}
