'use client';

import { RecipeIdSchema, type Format } from '@motionpop/schemas';
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
} from '@/lib/intake/hand-off';
import { handOffSingle, SINGLE_MAX_CHARS } from '@/lib/intake/single';
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

  // `?style=`, `?recipe=`, and `?skill=` from `/styles`, `/recipes`, or `/skills` preselect the draft (spec 11, 40, 43).
  const style = search.get('style');
  const recipeParam = search.get('recipe');
  const skillParam = search.get('skill');
  useEffect(() => {
    const parsedRecipe = recipeParam ? RecipeIdSchema.safeParse(recipeParam) : null;
    const recipe = parsedRecipe?.success ? parsedRecipe.data : undefined;
    const patch: Partial<typeof draft> = {};
    if (style && style !== draft.styleId) patch.styleId = style;
    if (recipe && recipe !== draft.recipeId) {
      patch.recipeId = recipe;
      if (draft.userSkillId) patch.userSkillId = undefined;
    }
    if (skillParam && skillParam !== draft.userSkillId) {
      patch.userSkillId = skillParam;
    }
    if (Object.keys(patch).length > 0) update(patch);
  }, [style, recipeParam, skillParam, draft.styleId, draft.recipeId, draft.userSkillId, update]);

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
            initialFormat={draft.format}
            onMake={(prompt, format) =>
              void go(
                () => handOffSingle(prompt, { ...draft, format, formatChosen: true }),
                CONFIGURE,
              )
            }
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
          'flex min-h-[144px] flex-col items-center justify-center gap-2.5 rounded-[10px] border-2 border-dashed border-ink px-4 py-3.5 transition-colors',
          over ? 'bg-[#eef5fc]' : 'bg-mist',
        )}
      >
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <span className="rounded-full border border-ink bg-ink px-2 py-0.5 font-mono text-[9.5px] font-semibold tracking-[0.06em] text-paper uppercase">
            Multi-file
          </span>
          {(['Video', 'Audio', 'B-roll', 'Images'] as const).map((kind) => (
            <span
              key={kind}
              className="rounded-full border border-ink/25 bg-paper px-2 py-0.5 font-mono text-[9.5px] text-black/70"
            >
              +{kind}
            </span>
          ))}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className={btn('paper', 'md')}
        >
          <Upload className="size-4 shrink-0" strokeWidth={2} aria-hidden />
          {over ? 'Drop files here' : C.upload.drop}
        </button>
        <p className="text-center text-[10.5px] leading-snug text-black/60">{C.upload.formats}</p>
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

const GRAPHIC_FORMATS: readonly Format[] = ['16:9', '9:16', '1:1'];

/**
 * "Or just make a single graphic": the user describes the motion graphic they want in a prompt,
 * then configures Recipe, Visual Style (Paper Collage / Vox, Dark Tech, Newsprint, etc.), custom
 * SKILL.md, and AI cutout visuals on `/start/configure`.
 */
function SingleGraphic({
  busy,
  initialFormat,
  onMake,
}: {
  busy: boolean;
  initialFormat: Format;
  onMake: (prompt: string, format: Format) => void;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [format, setFormat] = useState<Format>(initialFormat);
  const trimmed = prompt.trim();
  const tooLong = trimmed.length > SINGLE_MAX_CHARS;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={paper.link}>
        {C.single}
      </button>
    );
  }
  const submit = () => {
    if (busy || trimmed.length === 0 || tooLong) return;
    onMake(trimmed, format);
  };
  return (
    <motion.form
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex w-full max-w-[680px] flex-col items-start gap-2.5"
    >
      <div className={cn(paper.field, 'flex w-full items-center gap-2 p-1.5 pl-4')}>
        <input
          autoFocus
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
          aria-label="Describe the motion graphic"
          placeholder="Editorial paper-collage explainer on how global shipping lanes work"
          maxLength={SINGLE_MAX_CHARS}
          className="h-9 flex-1 bg-transparent text-[14px] outline-none placeholder:text-black/45"
        />
        <button
          type="submit"
          disabled={busy || trimmed.length === 0 || tooLong}
          className={btn('ink', 'sm')}
        >
          Make it
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px]">
        <div className="flex items-center gap-1" role="group" aria-label="Graphic aspect ratio">
          <span className="mr-1 font-mono uppercase text-black/50">Format</span>
          {GRAPHIC_FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={format === f}
              onClick={() => setFormat(f)}
              className={cn(
                'rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors',
                format === f
                  ? 'border-ink bg-ink text-paper'
                  : 'border-ink/30 bg-paper text-ink hover:border-ink',
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <p className={cn('text-[11px] leading-[14px]', tooLong ? 'text-error' : 'text-black/55')}>
        {tooLong
          ? `Keep the prompt under ${SINGLE_MAX_CHARS} characters.`
          : 'Next: choose your style (Paper Collage, Editorial, Newsprint, Dark Tech, or custom SKILL.md) and AI cutouts. Export MP4 or transparent WebM.'}
      </p>
    </motion.form>
  );
}
