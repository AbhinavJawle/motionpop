'use client';

import { APP_CONFIG_DEFAULTS, costOf, exportCost } from '@motionpop/schemas';
import { AudioLines, Captions, Cloud, MessageSquareText, Sparkles, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Pip } from '@/components/pip/pip';
import type { PipState } from '@/components/pip/states';
import { useAuth } from '@/lib/auth/auth-provider';
import { popIn } from '@/lib/motion/presets';

const REPO = 'https://github.com/AbhinavJawle/motionpop';
const cfg = APP_CONFIG_DEFAULTS;

const STEPS: { pip: PipState; title: string; body: string }[] = [
  {
    pip: 'listening',
    title: 'Talk',
    body: 'Record in the browser, drop in a voice memo, or paste a script and pick a voice.',
  },
  {
    pip: 'thinking',
    title: 'Pip finds the moments',
    body: 'Every word gets timed, fillers and long pauses come out, and each number, place and name gets a slot with its reason: “You said revenue grew forty percent.”',
  },
  {
    pip: 'celebrating',
    title: 'Graphics land on the word',
    body: 'Charts, maps, stats and titles fill in while you watch. Tweak one with a sentence, then export 16:9, 9:16 or 1:1.',
  },
];

const FEATURES: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <Zap className="size-4 text-mint" strokeWidth={1.5} />,
    title: 'Instant edits on your device',
    body: '“Make it slower”, “use the brand colour”: quick edits run on the AI built into your browser. Free, private, and they work offline.',
  },
  {
    icon: <Cloud className="size-4 text-violet" strokeWidth={1.5} />,
    title: 'The cloud when it counts',
    body: 'Heavy generation runs in the cloud, and the price is on the button before you click. Nothing is charged by surprise.',
  },
  {
    icon: <MessageSquareText className="size-4 text-violet" strokeWidth={1.5} />,
    title: 'Pip handles the whole video',
    body: 'Ask for “brand colours everywhere” or “punchier titles”. Pip comes back with a plan: apply it all, or undo it in one step.',
  },
  {
    icon: <Sparkles className="size-4 text-ember" strokeWidth={1.5} />,
    title: 'Custom graphics from a sentence',
    body: 'When the library doesn’t have it, describe it. The AI writes a new graphic in your look, checked before it reaches your timeline.',
  },
  {
    icon: <Captions className="size-4 text-text-2" strokeWidth={1.5} />,
    title: 'Captions and every format',
    body: 'Word-by-word captions in three styles. Switch to vertical or square and every graphic lays itself out again.',
  },
  {
    icon: <AudioLines className="size-4 text-mint" strokeWidth={1.5} />,
    title: 'Sound, made in code',
    body: 'Pops and whooshes land on each graphic’s entrance, levelled under your voice. No stock libraries.',
  },
];

const PRICES: { label: string; cost: string }[] = [
  { label: 'Quick edits and auto-fill on your device', cost: 'Free' },
  { label: 'Generate a graphic in the cloud', cost: `${costOf('generate', 1, cfg)} credits` },
  { label: 'Custom graphic from a sentence', cost: `${costOf('custom', 1, cfg)} credits` },
  { label: 'Voice from a script, per minute', cost: `${costOf('tts', 1, cfg)} credits` },
  {
    label: 'Export 1080p MP4, per minute of video',
    cost: `${exportCost('1080p', 60_000, cfg.exportCredits)} credits`,
  },
];

function Cta({ className = '', short = false }: { className?: string; short?: boolean }) {
  const auth = useAuth();
  const signedIn = auth.status === 'signed-in' || auth.status === 'local';
  return (
    <Link
      href={signedIn ? '/dashboard' : '/sign-in?next=/start'}
      className={`inline-flex h-11 items-center justify-center rounded-chip bg-ember-grad px-5 text-[14px] font-semibold text-white shadow-ember transition-[filter] duration-200 hover:brightness-110 ${className}`}
    >
      {signedIn
        ? short
          ? 'Open app'
          : 'Open your projects'
        : short
          ? 'Start free'
          : `Start free · ${cfg.freeCredits} credits`}
    </Link>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mx-auto max-w-[640px] text-center">
      <p className="font-mono text-[11px] tracking-[1.5px] text-text-3 uppercase">{eyebrow}</p>
      <h2 className="mt-3 text-[28px] leading-[34px] font-semibold tracking-[-0.4px] text-text sm:text-[34px] sm:leading-[40px]">
        {title}
      </h2>
    </div>
  );
}

/** The public landing page (spec 16, not designed: the app's own visual language). */
export function Landing() {
  const auth = useAuth();
  const signedIn = auth.status === 'signed-in';
  return (
    <div className="min-h-dvh overflow-x-hidden bg-bg text-text">
      <header className="sticky top-0 z-20 border-b border-line-soft bg-bg/80 backdrop-blur">
        <nav className="mx-auto flex h-14 max-w-[1120px] items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Pip state="idle" size={26} decorative seed={3} />
            <span className="text-[17px] font-semibold tracking-[-0.2px]">motionpop</span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <a
              href="#how"
              className="hidden rounded-chip px-3 py-2 text-[13px] text-text-2 hover:text-text sm:block"
            >
              How it works
            </a>
            <a
              href="#pricing"
              className="hidden rounded-chip px-3 py-2 text-[13px] text-text-2 hover:text-text sm:block"
            >
              Pricing
            </a>
            {!signedIn && (
              <Link
                href="/sign-in"
                className="rounded-chip px-3 py-2 text-[13px] text-text-2 hover:text-text"
              >
                Sign in
              </Link>
            )}
            <Cta short className="!h-9 !px-4 !text-[13px]" />
          </div>
        </nav>
      </header>

      <main>
        <section className="relative mx-auto max-w-[1120px] px-4 pt-16 pb-20 sm:px-6 sm:pt-24">
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 left-1/2 size-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(139_124_255/0.12),transparent)]"
          />
          <motion.div {...popIn} className="relative mx-auto max-w-[760px] text-center">
            <h1 className="text-[40px] leading-[44px] font-semibold tracking-[-1px] sm:text-[60px] sm:leading-[64px]">
              Bring your voice.
              <br />
              <span className="text-ember-grad">We’ll bring the motion.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-[560px] text-[16px] leading-[25px] text-text-2 sm:text-[18px] sm:leading-[28px]">
              Talk, upload or paste a script. Motionpop finds the moments in what you say and lands
              premium motion graphics right on the words.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Cta />
              <a
                href="#how"
                className="inline-flex h-11 items-center rounded-chip bg-card px-5 text-[14px] text-text shadow-glass hover:bg-card-2"
              >
                See how it works
              </a>
            </div>
          </motion.div>

          <div className="relative mx-auto mt-14 max-w-[880px]">
            <div className="absolute -top-12 -right-2 z-10 hidden sm:block">
              <Pip state="waving" size={84} glow look="cursor" decorative seed={11} />
            </div>
            <div className="overflow-hidden rounded-modal border border-line bg-card shadow-modal">
              <video
                className="block aspect-video w-full"
                src="/landing/sample.mp4"
                poster="/landing/sample-poster.jpg"
                autoPlay
                muted
                loop
                playsInline
                aria-label="A video exported from Motionpop: the globe flies to Japan, then a 34-year stat lands, with captions on a generated voice"
              />
            </div>
            <p className="mt-3 text-center font-mono text-[11px] text-text-3">
              Exported from Motionpop at 1080p: a pasted script, its voice, a map, a stat and captions.
            </p>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-[1120px] scroll-mt-20 px-4 py-20 sm:px-6">
          <SectionTitle eyebrow="How it works" title="From voice to video in three steps" />
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                className="rounded-card border border-line bg-card p-6 shadow-quiet"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[12px] text-text-3">0{i + 1}</span>
                  <Pip state={s.pip} size={52} decorative seed={20 + i} />
                </div>
                <h3 className="mt-4 text-[18px] leading-[24px] font-semibold">{s.title}</h3>
                <p className="mt-2 text-[14px] leading-[22px] text-text-2">{s.body}</p>
              </li>
            ))}
          </ol>

          <figure className="mt-16">
            <div className="overflow-hidden rounded-modal border border-line shadow-modal">
              {/* A real screenshot of the editor, not a mock-up. */}
              {/* eslint-disable-next-line @next/next/no-img-element -- a static screenshot; no resizing needed */}
              <img
                src="/landing/editor.jpg"
                alt="The Motionpop editor: the transcript timeline with slots above the words, a stat graphic in the preview, and the inspector"
                className="block w-full"
                width={1600}
                height={1000}
                loading="lazy"
              />
            </div>
            <figcaption className="mt-4 text-center text-[14px] text-text-2">
              The transcript is the timeline. Each graphic sits above the words it belongs to.
            </figcaption>
          </figure>
        </section>

        <section className="mx-auto max-w-[1120px] px-4 py-20 sm:px-6">
          <SectionTitle eyebrow="What you get" title="Calm controls, lively graphics" />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-card border border-line bg-card p-6 shadow-quiet"
              >
                <div className="flex size-8 items-center justify-center rounded-chip bg-card-2">
                  {f.icon}
                </div>
                <h3 className="mt-4 text-[16px] leading-[22px] font-semibold">{f.title}</h3>
                <p className="mt-2 text-[14px] leading-[22px] text-text-2">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-[1120px] scroll-mt-20 px-4 py-20 sm:px-6">
          <SectionTitle eyebrow="Pricing" title="Start free. Pay only for the cloud." />
          <div className="mx-auto mt-12 max-w-[560px] rounded-modal border border-line bg-card p-6 shadow-modal sm:p-8">
            <div className="flex items-baseline justify-between">
              <h3 className="text-[20px] font-semibold">Free plan</h3>
              <span className="font-mono text-[14px] text-ember-ink">
                {cfg.freeCredits} credits on sign-up
              </span>
            </div>
            <ul className="mt-6 divide-y divide-line-soft">
              {PRICES.map((p) => (
                <li key={p.label} className="flex items-center justify-between gap-4 py-3">
                  <span className="text-[14px] text-text-2">{p.label}</span>
                  <span
                    className={`shrink-0 font-mono text-[13px] ${p.cost === 'Free' ? 'text-mint' : 'text-text'}`}
                  >
                    {p.cost}
                  </span>
                </li>
              ))}
            </ul>
            <Cta className="mt-6 w-full" />
            <p className="mt-3 text-center text-[12px] text-text-3">
              The cost shows on every button before you click. Failed generations are refunded.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-[1120px] px-4 pt-8 pb-24 text-center sm:px-6">
          <Pip state="celebrating" size={96} glow decorative seed={42} className="mx-auto" />
          <h2 className="mt-6 text-[28px] leading-[34px] font-semibold tracking-[-0.4px] sm:text-[34px]">
            Drop a voice memo. Pip will catch it.
          </h2>
          <Cta className="mt-8" />
        </section>
      </main>

      <footer className="border-t border-line-soft">
        <div className="mx-auto flex max-w-[1120px] flex-col items-center justify-between gap-3 px-4 py-8 text-[12px] text-text-3 sm:flex-row sm:px-6">
          <span>motionpop · open source under Apache-2.0 · works best in desktop Chrome</span>
          <div className="flex gap-4">
            <a href={REPO} className="hover:text-text-2" rel="noreferrer" target="_blank">
              Source
            </a>
            <Link href="/terms" className="hover:text-text-2">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-text-2">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
