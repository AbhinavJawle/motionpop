'use client';

import { TTS_VOICES, type TtsVoiceId } from '@motionpop/ai';
import { costOf } from '@motionpop/schemas';
import { ChevronLeft, Cloud, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Pip } from '@/components/pip/pip';
import { Button } from '@/components/ui/button';
import { SegmentedPills } from '@/components/ui/segmented-pills';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { useCreditsClient } from '@/lib/credits/use-credits-client';
import { PROCESSING_NEW } from '@/lib/intake/hand-off';
import { setPending } from '@/lib/intake/pending';
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
import { generateVoice } from '@/lib/tts/generate-voice';
import { ProjectTopBar } from './project-top-bar';

const EXAMPLE =
  'Our revenue grew forty percent since 2020. Most of it came from Europe, where we tripled the team. Here is what comes next.';

/** Why Generate is off, in words; null when it can run. */
export function generateBlock(i: {
  words: number;
  online: boolean;
  killSwitch: boolean;
  signedIn: boolean;
}): string | null {
  if (i.words === 0) return 'Write a script first';
  if (i.words < 3) return 'A few more words';
  if (!i.online) return 'Needs connection';
  if (i.killSwitch) return 'Cloud AI is paused for today';
  if (!i.signedIn) return 'Sign in to generate a voice';
  return null;
}

/**
 * `/start/script` (spec 11 task 18, R9; not designed, so it borrows the Start cards' surface):
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
  const [text, setText] = useState(() => (search.get('text') ?? '').slice(0, SCRIPT_MAX_CHARS));
  const [voice, setVoice] = useState<TtsVoiceId>('Kore');
  const [speedId, setSpeedId] = useState<SpeedId>('natural');
  const [busy, setBusy] = useState(false);

  const speed = SPEEDS.find((s) => s.id === speedId)?.speed ?? 1;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const moments = useMemo(() => scriptMoments(text), [text]);
  const cost = costOf('tts', minutesFor(text || 'x', speed), config);
  const block = generateBlock({
    words,
    online,
    killSwitch: config.killSwitch,
    signedIn: client !== null,
  });

  const generate = async () => {
    if (busy || block) return;
    setBusy(true);
    const out = await generateVoice({ credits: client, config }, { text, voice, speed });
    if (!out.ok) {
      if (!out.noCredits) toast.error(out.reason);
      setBusy(false);
      return;
    }
    try {
      await setPending(
        out.file,
        {
          source: 'tts',
          name: text.trim().split(/\s+/).slice(0, 6).join(' ').slice(0, 60) || 'Script',
          cleanup: false,
          tts: { voiceId: voice, speed, script: text.trim() },
        },
        draft,
      );
      toast.success(`Voice ready in ${(out.latencyMs / 1000).toFixed(1)}s`);
      router.push(PROCESSING_NEW);
    } catch {
      toast.error("Couldn't keep the voice in this browser. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh min-w-[1280px] bg-bg text-text">
      <ProjectTopBar />
      <main className="mx-auto flex w-[1040px] flex-col pt-10 pb-16">
        <Link
          href="/start"
          className="flex w-fit items-center gap-1 text-xs leading-4 text-text-2 transition-colors hover:text-text"
        >
          <ChevronLeft className="size-3.5" strokeWidth={1.75} aria-hidden />
          Start
        </Link>
        <div className="mt-5 flex items-end justify-between">
          <div>
            <h1 className="text-[30px] leading-9 font-semibold tracking-[-0.6px]">
              Write it. Pip voices it.
            </h1>
            <p className="mt-1.5 text-[13px] leading-[18px] text-text-2">
              Paste your script, pick a voice, and the graphics follow every word.
            </p>
          </div>
          <Pip state={busy ? 'thinking' : 'idle'} size={56} decorative />
        </div>

        <div className="mt-8 flex gap-6">
          <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-line-strong bg-[linear-gradient(180deg,#121219,#0C0C11)] p-5 shadow-glass">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, SCRIPT_MAX_CHARS))}
              maxLength={SCRIPT_MAX_CHARS}
              aria-label="Script"
              placeholder="Paste or write your script. Numbers, places and dates become graphics."
              className="h-[340px] w-full resize-none bg-transparent text-[15px] leading-6 text-text outline-none placeholder:text-text-3"
            />
            <div className="mt-3 flex items-center justify-between border-t border-white/6 pt-3">
              <p
                className="tabular font-mono text-[11px] leading-[14px] text-text-2"
                data-testid="script-counts"
              >
                {words} words · {formatLength(estimateMs(text, speed))} · {text.length}/
                {SCRIPT_MAX_CHARS}
              </p>
              {words === 0 && (
                <button
                  type="button"
                  onClick={() => setText(EXAMPLE)}
                  className="text-[11px] leading-[14px] text-violet-ink hover:underline"
                >
                  Try an example
                </button>
              )}
            </div>
            <div className="mt-4 min-h-[52px]" data-testid="script-moments">
              <p className="text-[11px] leading-[14px] text-text-3">
                {moments.length
                  ? `Pip spotted ${moments.length} moment${moments.length === 1 ? '' : 's'} to animate`
                  : 'Numbers, places, years and names become graphics.'}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {moments.map((m) => (
                  <motion.span
                    key={`${m.kind}-${m.text}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                    className="rounded-md bg-ember/12 px-2 py-0.5 text-[11px] leading-4 text-ember"
                  >
                    {m.text}
                  </motion.span>
                ))}
              </div>
            </div>
          </section>

          <aside className="flex w-[320px] shrink-0 flex-col gap-5">
            <div role="radiogroup" aria-label="Voice" className="flex flex-col gap-2">
              <p className="text-[11px] leading-[14px] font-medium tracking-[0.4px] text-text-3 uppercase">
                Voice
              </p>
              {TTS_VOICES.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={voice === v.id}
                  onClick={() => setVoice(v.id)}
                  className={cn(
                    'flex items-center justify-between rounded-chip border px-3.5 py-2.5 text-left transition-colors',
                    voice === v.id
                      ? 'border-violet/60 bg-violet/10'
                      : 'border-line-strong bg-card hover:bg-card-2',
                  )}
                >
                  <span>
                    <span className="block text-[13px] leading-4 font-medium">{v.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-[14px] text-text-2">
                      {v.about}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      'size-3 rounded-full border',
                      voice === v.id ? 'border-violet bg-violet' : 'border-text-3',
                    )}
                  />
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-[11px] leading-[14px] font-medium tracking-[0.4px] text-text-3 uppercase">
                Pace
              </p>
              <SegmentedPills
                label="Pace"
                options={SPEEDS.map((s) => ({ value: s.id, label: s.label }))}
                value={speedId}
                onChange={setSpeedId}
                className="w-full"
              />
            </div>

            <div className="mt-1 flex flex-col gap-2">
              <Button
                variant="primary"
                size="lg"
                className="h-11 w-full"
                disabled={block !== null || busy}
                onClick={() => void generate()}
              >
                <Sparkles strokeWidth={1.75} aria-hidden />
                {busy ? 'Pip is recording…' : 'Generate voice'}
                {!busy && (
                  <span className="ml-1 flex items-center gap-1 rounded-md bg-black/20 px-1.5 py-0.5 text-[10px] leading-3">
                    <Cloud className="!size-3" strokeWidth={1.75} aria-hidden />
                    {cost}
                  </span>
                )}
              </Button>
              <p className="text-center text-[11px] leading-[14px] text-text-3" role="status">
                {block ?? 'Credits come back if the voice fails.'}
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
