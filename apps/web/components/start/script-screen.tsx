'use client';

import { TTS_VOICES, type TtsVoiceId } from '@motionpop/ai';
import { costOf } from '@motionpop/schemas';
import { ChevronLeft, Cloud } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { PipLoop } from '@/components/landing/pip-loop';
import { btn, Bubble, paper, PaperPage, poster } from '@/components/paper/kit';
import { SegmentedPills } from '@/components/ui/segmented-pills';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { useCreditsClient } from '@/lib/credits/use-credits-client';
import { CONFIGURE } from '@/lib/intake/hand-off';
import { setPendingScript } from '@/lib/intake/pending';
import { useStartDraft } from '@/lib/intake/use-start-draft';
import { useAppConfig, useOnline } from '@/lib/renders/hooks';
import {
  SCRIPT_MAX_CHARS,
  SPEEDS,
  estimateMs,
  formatLength,
  minutesFor,
  scriptMoments,
  type SpeedId,
} from '@/lib/script/estimate';
import { clearScriptDraft, putScriptDraft, readScriptDraft } from '@/lib/script/hand-off';
import { ProjectTopBar } from './project-top-bar';

const EXAMPLE =
  'Our revenue grew forty percent since 2020. Most of it came from Europe, where we tripled the team. Here is what comes next.';

/** Why Generate is off, in words; null when it can run. */
export function generateBlock(i: {
  words: number;
  /** Characters over the limit (negative or zero when it fits). */
  over?: number;
  online: boolean;
  killSwitch: boolean;
  signedIn: boolean;
}): string | null {
  if (i.words === 0) return 'Write a script first';
  if (i.words < 3) return 'A few more words';
  if ((i.over ?? 0) > 0) return `Trim ${(i.over ?? 0).toLocaleString('en-US')} characters to fit`;
  if (!i.online) return 'Needs connection';
  if (i.killSwitch) return 'Cloud AI is paused for today';
  if (!i.signedIn) return 'Sign in to generate a voice';
  return null;
}

/**
 * `/start/script` (spec 11 task 18, R9; a ruled writing sheet in spec 35):
 * the script with its counts and the moments Pip will animate, five original voices, a speed,
 * the price before the click, then Generate → the voice is stored like an upload → Processing.
 */
export function ScriptScreen() {
  const router = useRouter();
  const search = useSearchParams();
  const [draft] = useStartDraft();
  const config = useAppConfig();
  const online = useOnline();
  const { client } = useCreditsClient();
  const [text, setText] = useState(() => search.get('text') ?? readScriptDraft());
  const over = text.length - SCRIPT_MAX_CHARS;
  const [voice, setVoice] = useState<TtsVoiceId>('Kore');
  const [speedId, setSpeedId] = useState<SpeedId>('natural');
  const [busy, setBusy] = useState(false);

  const speed = SPEEDS.find((s) => s.id === speedId)?.speed ?? 1;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const moments = useMemo(() => scriptMoments(text), [text]);
  const cost = costOf('tts', minutesFor(text || 'x', speed), config);
  const block = generateBlock({
    words,
    over,
    online,
    killSwitch: config.killSwitch,
    signedIn: client !== null,
  });

  // Spec 39 R2.1/R2.4: the script goes to Configure; its voice is made (and charged) after Create.
  const generate = async () => {
    if (busy || block) return;
    setBusy(true);
    try {
      await setPendingScript(
        {
          source: 'tts',
          name: text.trim().split(/\s+/).slice(0, 6).join(' ').slice(0, 60) || 'Script',
          cleanup: false,
          tts: { voiceId: voice, speed, script: text.trim() },
        },
        draft,
      );
      clearScriptDraft();
      router.push(CONFIGURE);
    } catch {
      toast.error("Couldn't keep the script in this browser. Try again.");
      setBusy(false);
    }
  };

  return (
    <PaperPage>
      <ProjectTopBar />
      <main className="mx-auto w-full max-w-[1240px] px-6 pb-20 lg:px-10">
        <Link
          href="/start"
          className="mt-8 flex w-fit items-center gap-1 text-[13px] underline-offset-4 hover:underline"
        >
          <ChevronLeft className="size-4" strokeWidth={2} aria-hidden />
          Start
        </Link>
        <div className="flex items-end justify-between gap-8 pt-6 pb-10">
          <div>
            <h1 className={cn(poster, 'text-[clamp(56px,7vw,96px)]')}>Write it. Pip voices it.</h1>
            <p className="mt-4 max-w-[560px] text-[15px] leading-[1.65]">
              Paste your script, pick a voice, and the graphics follow every word.
            </p>
          </div>
          <div className="relative hidden h-[190px] w-[260px] shrink-0 md:block" aria-hidden>
            <Bubble right className="absolute top-0 right-[40px] whitespace-nowrap">
              {busy
                ? 'Recording…'
                : moments.length
                  ? `${moments.length} moment${moments.length === 1 ? '' : 's'} spotted!`
                  : 'Numbers make great graphics.'}
            </Bubble>
            <PipLoop name="clapper" className="absolute -right-4 -bottom-8 size-[180px]" />
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="flex min-w-0 flex-col overflow-hidden rounded-[16px] border-2 border-ink bg-paper shadow-[6px_6px_0_#000]">
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                putScriptDraft(e.target.value);
              }}
              aria-label="Script"
              placeholder="Paste or write your script. Numbers, places and dates become graphics."
              className={cn(
                paper.ruled,
                'h-[416px] w-full resize-none bg-transparent px-7 pt-[5px] text-[16px] leading-[32px] outline-none placeholder:text-black/40',
              )}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-ink px-7 py-3">
              <p
                className={cn(
                  'flex flex-wrap gap-x-6 text-[12px] tabular',
                  over > 0 && 'text-error',
                )}
                data-testid="script-counts"
              >
                <span>{words} words</span>
                <span>{formatLength(estimateMs(text, speed))}</span>
                <span>
                  {text.length.toLocaleString('en-US')}/{SCRIPT_MAX_CHARS.toLocaleString('en-US')}
                </span>
                {over > 0 && <span>{over.toLocaleString('en-US')} over</span>}
              </p>
              {words === 0 && (
                <button type="button" onClick={() => setText(EXAMPLE)} className={paper.link}>
                  Try an example
                </button>
              )}
            </div>
            <div
              className="min-h-[76px] flex-1 border-t-2 border-ink bg-mist px-7 py-4"
              data-testid="script-moments"
            >
              <p className="text-[12px] text-black/65">
                {moments.length
                  ? `Pip spotted ${moments.length} moment${moments.length === 1 ? '' : 's'} to animate`
                  : 'Numbers, places, years and names become graphics.'}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {moments.map((m) => (
                  <motion.span
                    key={`${m.kind}-${m.text}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                    className="rounded-md border-2 border-ink bg-flame px-2 py-0.5 text-[12px]"
                  >
                    {m.text}
                  </motion.span>
                ))}
              </div>
            </div>
          </section>

          <aside className="flex flex-col gap-7">
            <div role="radiogroup" aria-label="Voice" className="flex flex-col gap-2">
              <p className={cn(poster, 'mb-1 text-[30px]')}>Voice</p>
              {TTS_VOICES.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={voice === v.id}
                  onClick={() => setVoice(v.id)}
                  className={cn(
                    'flex items-center justify-between rounded-[10px] border-2 border-ink px-4 py-2.5 text-left transition-[background-color,box-shadow]',
                    voice === v.id ? 'bg-ink text-paper' : 'bg-paper hover:bg-mist',
                  )}
                >
                  <span>
                    <span className="block text-[14px] font-semibold">{v.label}</span>
                    <span
                      className={cn(
                        'mt-0.5 block text-[12px]',
                        voice === v.id ? 'text-paper/70' : 'text-black/60',
                      )}
                    >
                      {v.about}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      'size-3.5 rounded-full border-2',
                      voice === v.id ? 'border-paper bg-flame' : 'border-ink',
                    )}
                  />
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <p className={cn(poster, 'mb-1 text-[30px]')}>Pace</p>
              <SegmentedPills
                label="Pace"
                options={SPEEDS.map((s) => ({ value: s.id, label: s.label }))}
                value={speedId}
                onChange={setSpeedId}
                className="w-full"
              />
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                className={btn('flame', 'lg', false, 'w-full')}
                disabled={block !== null || busy}
                onClick={() => void generate()}
              >
                {busy ? 'One moment…' : 'Continue'}
                {!busy && (
                  <span className="ml-1 flex items-center gap-1 rounded-md border-2 border-ink bg-paper px-1.5 py-0.5 text-[11px] leading-3">
                    <Cloud className="size-3" strokeWidth={2} aria-hidden />
                    {cost}
                  </span>
                )}
              </button>
              <p className="text-[12px] text-black/60" role="status">
                {block ??
                  'The voice is made after you press Create. Credits come back if it fails.'}
              </p>
            </div>
          </aside>
        </div>
      </main>
    </PaperPage>
  );
}
