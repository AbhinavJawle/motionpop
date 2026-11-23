'use client';

import {
  Check,
  Clapperboard,
  Cloud,
  Coins,
  HelpCircle,
  Layers,
  MessageSquareText,
  Mic,
  Palette,
  PenLine,
  Plus,
  Scissors,
  Sparkles,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { cn } from '@/lib/cn';
import {
  AUDIENCES,
  CLOSER,
  FAQ,
  FEATURES,
  FOOTER,
  FRAME_NOTES,
  HERO,
  HOW,
  HYBRID,
  LOOKS,
  NAV,
  PLANS,
  PRICING,
  REPO,
  STITCHED,
  TICKER,
} from './copy';
import { display, hand } from './fonts';
import s from './marketing.module.css';
import { HeroLight, Voice } from './hero-backdrop';
import h from './hero.module.css';
import { PipLoop } from './pip-loop';
import { Projector } from './projector';
import { SignupCTA } from './signup-cta';

/* ================================================================== shared pieces */

function useSignedIn() {
  const auth = useAuth();
  return auth.status === 'signed-in' || auth.status === 'local';
}

/** The main call to action: sign up and start, or open the projects of a signed-in creator. */
function StartLink({
  className,
  short = false,
  onInk = false,
}: {
  className?: string;
  short?: boolean;
  onInk?: boolean;
}) {
  const signedIn = useSignedIn();
  return (
    <Link
      href={signedIn ? '/dashboard' : '/sign-in?next=/start'}
      className={cn(s.btn, onInk ? cn(s.btnPaper, s.btnOnInk) : s.btnInk, className)}
    >
      {signedIn ? (short ? 'Open app' : 'Open your projects') : 'Start free'}
    </Link>
  );
}

/**
 * Pip's sign-up button. Its headroom is in container units, so it sits in a sized container
 * (without one the units fall back to the viewport and leave a huge gap above it).
 */
function SignupOrOpen({ className }: { className?: string }) {
  const signedIn = useSignedIn();
  return (
    <div className={cn('[container-type:inline-size]', className)}>
      {signedIn ? (
        <SignupCTA href="/dashboard">Open your projects</SignupCTA>
      ) : (
        <SignupCTA href="/sign-in?next=/start" />
      )}
    </div>
  );
}

/**
 * The marker above every section title: a clip from the timeline in the section's colour, with the
 * section's timecode. Read top to bottom, the page plays like a video.
 */
function Cue({
  icon: Icon,
  tone,
  time,
  onInk = false,
}: {
  icon: LucideIcon;
  tone: string;
  time: string;
  onInk?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        s.cue,
        'inline-flex h-11 items-center gap-2.5 rounded-[10px] border-2 border-black pr-4 pl-3 text-black',
        onInk ? 'shadow-[3px_3px_0_rgb(255_255_255/0.35)]' : 'shadow-[3px_3px_0_#000]',
      )}
      style={{ background: tone }}
    >
      <Icon className="size-5" strokeWidth={1.75} />
      <span className={s.cueWave} />
      <span className="text-[13px] leading-none tabular-nums">{time}</span>
    </span>
  );
}

function Head({
  icon,
  tone,
  time,
  title,
  body,
  action,
  id,
  invert = false,
}: {
  icon: LucideIcon;
  tone: string;
  time: string;
  title: string;
  body: string;
  action?: ReactNode;
  id?: string;
  invert?: boolean;
}) {
  return (
    <div>
      <Cue icon={icon} tone={tone} time={time} onInk={invert} />
      <h2 id={id} className={cn(s.display, 'mt-5 text-[clamp(44px,6.4vw,76px)]')}>
        {title}
      </h2>
      <div className="mt-4 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <p
          className={cn(
            'max-w-[560px] text-[15px] leading-[1.65]',
            invert ? 'text-white/80' : 'text-black/80',
          )}
        >
          {body}
        </p>
        {action}
      </div>
    </div>
  );
}

function Bubble({
  children,
  right = false,
  className,
  style,
}: {
  children: ReactNode;
  right?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span className={cn(s.bubble, right && s.bubbleRight, className)} style={style}>
      {children}
    </span>
  );
}

/** A drawn arrow for the ticker and the notes, so its stroke matches the ink. */
function InkArrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 16" className={className} fill="none" aria-hidden>
      <path
        d="M2 9c8-3 18-4 31-1M27 3l7 5-7 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const WRAP = 'mx-auto w-full max-w-[1180px] px-5 sm:px-8';

/* ================================================================== nav */

function Nav() {
  const signedIn = useSignedIn();
  return (
    <header className={s.nav}>
      <nav className={cn(WRAP, 'flex h-16 items-center justify-between gap-6')}>
        <Link href="/" className="flex items-center gap-2.5" aria-label="motionpop home">
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static mark */}
          <img src="/pip/plush.webp" alt="" className="h-8 w-auto" />
          <span className="font-sans text-[22px] leading-none font-semibold tracking-[-0.03em]">
            motionpop
          </span>
        </Link>
        <div className="flex items-center gap-6">
          <ul className="hidden items-center gap-6 lg:flex">
            {NAV.map((n) => (
              <li key={n.href}>
                <a href={n.href} className={s.navLink}>
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
          {!signedIn && (
            <Link href="/sign-in" className={cn(s.navLink, 'hidden sm:block')}>
              Sign in
            </Link>
          )}
          <StartLink short onInk className="!h-9 !text-[13px]" />
        </div>
      </nav>
      {/* the page is a timeline: this playhead follows the scroll */}
      <span aria-hidden className={s.playhead} />
    </header>
  );
}

/* ================================================================== hero */

function Hero() {
  return (
    <section className="relative isolate pb-20" aria-labelledby="hero-title">
      <HeroLight />
      <div className={cn(WRAP, 'relative pt-10 sm:pt-12')}>
        <h1 id="hero-title" className={cn(s.display, 'text-[clamp(64px,11.5vw,150px)]')}>
          {HERO.lines.map((line, i) => (
            <span
              key={line}
              className={cn(s.rise, 'block')}
              style={{ animationDelay: `${80 + i * 140}ms` }}
            >
              {line}
            </span>
          ))}
        </h1>
        <div
          className={cn(
            s.rise,
            'mt-6 grid items-end gap-8 md:mt-8 md:grid-cols-[minmax(0,1fr)_auto]',
          )}
          style={{ animationDelay: '420ms' }}
        >
          <div className="pb-1">
            <p className="max-w-[540px] text-[16px] leading-[1.65]">{HERO.body}</p>
            <p className="mt-4 text-[13px] text-black/60">{HERO.note}</p>
          </div>
          {/* Pip's headroom rises beside the headline instead of pushing the copy down */}
          <div className="flex flex-col items-start gap-3 md:-mt-28 md:items-end">
            <div className="relative isolate w-[320px] max-w-full">
              {/* an old projector puts Pip in the spotlight (desktop only) */}
              <Projector className="-z-10 hidden lg:block" />
              <SignupOrOpen />
            </div>
            <a href="#film" className={cn(s.btn, s.btnPaper, '!h-9 !text-[13px]')}>
              {HERO.secondary}
            </a>
          </div>
        </div>
      </div>
      <Editor />
    </section>
  );
}

function Ticker() {
  const items = [...TICKER, ...TICKER];
  return (
    <div
      className={cn(s.ticker, 'overflow-hidden border-y-2 border-black bg-[var(--pip)]')}
      aria-label="What you say, and the graphic Pip puts on it"
    >
      <ul className={cn(s.tickerTrack, 'py-3.5')}>
        {items.map((t, i) => (
          <li
            key={i}
            aria-hidden={i >= TICKER.length}
            className="flex shrink-0 items-center gap-3 border-r-2 border-black px-7 whitespace-nowrap"
          >
            <span className="text-[14px]">“{t.said}”</span>
            <InkArrow className="h-3.5 w-9" />
            <span className={cn(s.display, 'text-[24px] leading-none')}>{t.graphic}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StickyNote({
  children,
  className,
  tilt,
}: {
  children: ReactNode;
  className: string;
  tilt: number;
}) {
  return (
    <span
      className={cn(
        s.hand,
        'absolute hidden max-w-[220px] border-2 border-black bg-white px-3 py-2 text-[19px] leading-[1.15] shadow-[3px_3px_0_#000] lg:block',
        className,
      )}
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <span
        aria-hidden
        className="absolute -top-2.5 left-1/2 h-4 w-14 -translate-x-1/2 rotate-[-4deg] bg-[var(--ember)]/70"
      />
      {children}
    </span>
  );
}

/**
 * The real editor (spec 33), rising out of the voice it was made from. About a quarter of it shows
 * above the fold at 1440 x 900.
 */
function Editor() {
  return (
    <div id="film" className={cn(WRAP, 'relative mt-24 scroll-mt-24')}>
      <Voice className="top-0" />
      <figure className="relative mx-auto max-w-[1100px]">
        <div className={h.frame}>
          <div>
            {/* A real screenshot of the editor, not a mock-up. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- static screenshot */}
            <img
              src="/landing/editor-studio.jpg"
              alt="The Motionpop editor: graphics sit above the words of the transcript, a 40% stat plays in the preview, and the inspector shows what was said"
              width={2160}
              height={1350}
              className="block w-full"
            />
          </div>
        </div>
        <StickyNote className="top-[6%] -left-[4%]" tilt={-3}>
          {FRAME_NOTES.formats}
        </StickyNote>
        <StickyNote className="top-[44%] -right-[5%]" tilt={2.5}>
          {FRAME_NOTES.edit}
        </StickyNote>
        <StickyNote className="bottom-[14%] -left-[5%]" tilt={-2}>
          {FRAME_NOTES.slot}
        </StickyNote>
      </figure>
    </div>
  );
}

/* ================================================================== how it works */

function BeatVisual({ index }: { index: number }) {
  if (index === 0) {
    // Recording: a red dot, a timer, and the waveform of what was said.
    const bars = [6, 14, 22, 12, 28, 34, 18, 10, 24, 38, 30, 16, 8, 20, 32, 26, 12, 6, 18, 28];
    return (
      <div className="flex h-full flex-col justify-center gap-4 px-8">
        <span className="flex items-center gap-2 text-[13px]">
          <span className="size-2.5 rounded-full bg-[var(--ember)]" /> Recording 00:12
        </span>
        <div className="flex h-12 items-center gap-[5px]" aria-hidden>
          {bars.map((h, i) => (
            <span key={i} className="w-[6px] rounded-full bg-black" style={{ height: h + 6 }} />
          ))}
        </div>
      </div>
    );
  }
  if (index === 1) {
    // The slot lands above "forty percent", with its reason.
    return (
      <div className="flex h-full flex-col justify-center gap-3 px-6">
        <div className="ml-[22%] w-fit border-2 border-black bg-white px-3 py-2 shadow-[2px_2px_0_#000]">
          <div className={cn(s.display, 'text-[20px] leading-none')}>Stat punch</div>
          <div className="mt-1 text-[11px] leading-tight text-black/70">{HOW.reason}</div>
        </div>
        <p className="flex flex-wrap gap-x-2 text-[15px]">
          {HOW.words.map((w) => (
            <span
              key={w}
              className={cn(
                (w === 'forty' || w === 'percent') &&
                  'border-b-[3px] border-[var(--ember)] font-medium',
              )}
            >
              {w}
            </span>
          ))}
        </p>
      </div>
    );
  }
  return (
    <video
      className="block h-full w-full object-cover"
      src="/landing/sample.mp4"
      poster="/landing/sample-poster.jpg"
      autoPlay
      muted
      loop
      playsInline
      aria-label="A video exported from Motionpop: the globe flies to Japan, then a stat lands, with captions"
    />
  );
}

/** A full-width band of the page: its colour and texture come from `className`. */
function Band({
  id,
  labelledBy,
  className,
  children,
}: {
  id?: string;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn('relative isolate scroll-mt-16 py-16 sm:py-20', className)}
      aria-labelledby={labelledBy}
    >
      <div className={WRAP}>{children}</div>
    </section>
  );
}

function How() {
  const slants = [s.slantFirst, s.slantMid, s.slantLast];
  return (
    <Band id="how" labelledBy="how-title" className={s.ruled}>
      <Head
        id="how-title"
        icon={Mic}
        tone="var(--ember)"
        time="00:04"
        title={HOW.title}
        body={HOW.body}
      />
      <div className="relative mt-12">
        {/* Pip claps the take in */}
        <PipLoop
          name="clapper"
          className="pointer-events-none absolute -top-[150px] right-0 z-10 hidden w-[200px] md:block lg:-top-[170px] lg:right-6 lg:w-[220px]"
        />
        <ol className="grid gap-6 md:grid-cols-3 md:gap-0">
          {HOW.beats.map((b, i) => (
            <li key={b.title} className={cn(s.outline, i > 0 && 'md:-ml-3')}>
              <div className={cn(slants[i], 'flex h-full flex-col bg-white')}>
                <div
                  className={cn(
                    'h-[220px] overflow-hidden bg-[var(--mist)]',
                    i === 2 && 'bg-black',
                  )}
                >
                  <BeatVisual index={i} />
                </div>
                <div className={cn('flex-1 px-7 pt-5 pb-7', i > 0 && 'md:pl-10')}>
                  <span className="text-[12px] text-black/60 tabular-nums">{b.time}</span>
                  <h3 className={cn(s.display, 'mt-1 text-[38px]')}>{b.title}</h3>
                  <p className="mt-2 max-w-[340px] text-[14px] leading-[1.6] text-black/80">
                    {b.body}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="mt-10 flex justify-center">
        <StartLink />
      </div>
    </Band>
  );
}

/* ================================================================== looks */

function Looks() {
  return (
    <Band id="looks" labelledBy="looks-title" className={s.washEmber}>
      <Head
        id="looks-title"
        icon={Palette}
        tone="var(--pip)"
        time="00:12"
        title={LOOKS.title}
        body={LOOKS.body}
      />
      {/* the four looks as frames on one strip of film */}
      <div className={cn(s.filmstrip, 'mt-14 lg:rotate-[-1.2deg]')}>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LOOKS.items.map((l) => (
            <li key={l.id}>
              {/* eslint-disable-next-line @next/next/no-img-element -- small static stills */}
              <img
                src={`/looks/${l.id}.jpg`}
                alt={`The same 40% stat in the ${l.name} look`}
                width={640}
                height={360}
                loading="lazy"
                className="block aspect-video w-full rounded-[6px] object-cover"
              />
              <h3 className={cn(s.display, 'mt-4 text-[28px] text-white')}>{l.name}</h3>
              <p className="mt-1 text-[13px] leading-[1.5] text-white/70">{l.about}</p>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-12 flex items-center gap-3 text-[14px]">
        <Sparkles className="size-4 shrink-0 text-[var(--ember)]" strokeWidth={1.75} aria-hidden />
        {LOOKS.save}
      </p>
    </Band>
  );
}

/* ================================================================== hybrid AI */

function IconDot({ icon: Icon, tone }: { icon: LucideIcon; tone: string }) {
  return (
    <span
      aria-hidden
      className="flex size-12 items-center justify-center rounded-full border-2 border-black text-black"
      style={{ background: tone }}
    >
      <Icon className="size-5" strokeWidth={1.75} />
    </span>
  );
}

function Hybrid() {
  return (
    <Band id="hybrid" labelledBy="hybrid-title" className={s.washSplit}>
      <Head
        id="hybrid-title"
        icon={Zap}
        tone="var(--mint)"
        time="00:19"
        title={HYBRID.title}
        body={HYBRID.body}
      />
      <div className="relative mt-16">
        <div className="absolute -top-10 left-1/2 z-10 hidden -translate-x-1/2 rotate-[-3deg] md:block">
          <Bubble right>{HYBRID.bubble}</Bubble>
        </div>
        <div className="grid gap-6 md:grid-cols-2 md:gap-0">
          <div className={s.outline}>
            <div
              className={cn(s.slantSplitLeft, 'h-full bg-[var(--pip)] px-8 pt-10 pb-10 md:pr-20')}
            >
              <IconDot icon={Zap} tone="#fff" />
              <h3 className={cn(s.display, 'mt-5 text-[42px]')}>{HYBRID.device.title}</h3>
              <p className="mt-3 max-w-[440px] text-[14px] leading-[1.65]">{HYBRID.device.body}</p>
              <div className="mt-7 flex h-12 max-w-[420px] items-center gap-3 border-2 border-black bg-white pr-2 pl-4 shadow-[3px_3px_0_#000]">
                <PenLine className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="flex-1 text-[14px]">{HYBRID.device.input}</span>
                <span className="flex items-center gap-1 rounded-full border-2 border-black bg-[var(--mint)] px-2.5 py-0.5 text-[12px]">
                  <Zap className="size-3" strokeWidth={2} aria-hidden /> {HYBRID.device.chip}
                </span>
              </div>
            </div>
          </div>
          <div className={cn(s.outline, 'md:-ml-7')}>
            <div
              className={cn(
                s.slantSplitRight,
                'h-full bg-black px-8 pt-10 pb-10 text-white md:pl-20',
              )}
            >
              <IconDot icon={Cloud} tone="var(--violet)" />
              <h3 className={cn(s.display, 'mt-5 text-[42px]')}>{HYBRID.cloud.title}</h3>
              <p className="mt-3 max-w-[440px] text-[14px] leading-[1.65] text-white/85">
                {HYBRID.cloud.body}
              </p>
              <span className="mt-7 inline-flex h-12 items-center gap-3 border-2 border-white bg-[var(--violet)] px-5 text-[14px] font-medium text-black shadow-[3px_3px_0_rgb(255_255_255/0.4)]">
                <Sparkles className="size-4" strokeWidth={1.75} aria-hidden />
                {HYBRID.cloud.button}
                <span className="flex items-center gap-1 rounded-full bg-black/15 px-2 py-0.5 text-[12px]">
                  <Cloud className="size-3" strokeWidth={2} aria-hidden /> 3
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </Band>
  );
}

/* ================================================================== Pip plans */

function Plans() {
  return (
    <Band labelledBy="plans-title" className={s.washViolet}>
      <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div>
          <Cue icon={MessageSquareText} tone="var(--violet)" time="00:26" />
          <h2 id="plans-title" className={cn(s.display, 'mt-5 text-[clamp(44px,6.4vw,76px)]')}>
            {PLANS.title}
          </h2>
          <p className="mt-4 max-w-[480px] text-[15px] leading-[1.65] text-black/80">
            {PLANS.body}
          </p>
          <StartLink className="mt-8" />
        </div>
        <div className="relative">
          <Bubble className="absolute -top-9 -left-3 z-10 rotate-[-4deg] sm:-left-10">
            {PLANS.bubble}
          </Bubble>
          <div className={cn(s.box, 'shadow-[8px_8px_0_#000]')}>
            <div className="flex items-center gap-2.5 border-b-2 border-black px-5 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- tiny static mark */}
              <img src="/pip/plush.webp" alt="" className="h-7 w-auto" />
              <span className={cn(s.display, 'text-[24px] leading-none')}>Pip</span>
            </div>
            <div className="space-y-4 bg-[var(--mist)] p-5">
              <p className="ml-auto max-w-[360px] border-2 border-black bg-white px-4 py-3 text-[14px] leading-[1.5]">
                {PLANS.ask}
              </p>
              <div className="max-w-[440px] border-2 border-black bg-white">
                <div className="border-b-2 border-black bg-[var(--violet)] px-4 py-2 text-[13px] font-medium">
                  {PLANS.planTitle}
                </div>
                <ul className="space-y-2.5 px-4 py-4">
                  {PLANS.steps.map((step) => (
                    <li key={step} className="flex items-start gap-2.5 text-[13px] leading-[1.45]">
                      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center border-2 border-black bg-[var(--mint)]">
                        <Check className="size-2.5" strokeWidth={3} aria-hidden />
                      </span>
                      {step}
                    </li>
                  ))}
                </ul>
                <div className="flex gap-3 px-4 pb-4">
                  <span className={cn(s.btn, s.btnInk, '!h-9 flex-1 !text-[13px]')}>
                    {PLANS.apply}
                  </span>
                  <span className={cn(s.btn, s.btnPaper, '!h-9 !text-[13px]')}>{PLANS.undo}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Band>
  );
}

/* ================================================================== features */

function Feature({
  title,
  body,
  visual,
  className,
}: {
  title: string;
  body: string;
  visual: ReactNode;
  className?: string;
}) {
  return (
    <li className={cn(s.box, 'flex flex-col overflow-hidden', className)}>
      <div className="flex h-44 items-center justify-center overflow-hidden border-b-2 border-black bg-[var(--mist)] px-6">
        {visual}
      </div>
      <div className="px-6 pt-5 pb-6">
        <h3 className={cn(s.display, 'text-[30px]')}>{title}</h3>
        <p className="mt-2 text-[14px] leading-[1.6] text-black/80">{body}</p>
      </div>
    </li>
  );
}

function Features() {
  const f = FEATURES.items;
  return (
    <Band labelledBy="features-title" className={s.washSun}>
      <div className="relative">
        <Head
          id="features-title"
          icon={Layers}
          tone="var(--sun)"
          time="00:33"
          title={FEATURES.title}
          body={FEATURES.body}
        />
        {/* Pip juggles the fiddly bits so you don't have to */}
        <PipLoop
          name="juggle"
          className="pointer-events-none absolute right-0 -bottom-[58px] z-10 hidden w-[230px] md:block lg:right-10 lg:w-[260px]"
        />
      </div>
      <ul className="mt-12 grid gap-6 md:grid-cols-6">
        <Feature
          className="md:col-span-3"
          title={f.notes.title}
          body={f.notes.body}
          visual={
            <div className="relative flex h-28 w-64 items-center justify-center border-2 border-black bg-white">
              <span className={cn(s.display, 'text-[60px] leading-none')}>40%</span>
              <svg
                viewBox="0 0 140 80"
                className="absolute top-1/2 left-1/2 h-[88px] w-[150px] -translate-x-1/2 -translate-y-1/2"
                aria-hidden
              >
                <path
                  d="M118 22C104 6 40 4 18 22 0 38 14 66 56 72c40 6 76-6 78-28 1-12-10-20-26-24"
                  fill="none"
                  stroke="var(--ember)"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
              <span
                className={cn(
                  s.hand,
                  'absolute -right-3 -bottom-9 rotate-[-6deg] text-[22px] whitespace-nowrap text-[var(--ember)] sm:-right-20 sm:-bottom-4',
                )}
              >
                {f.notes.scribble}
              </span>
            </div>
          }
        />
        <Feature
          className="md:col-span-3"
          title={f.formats.title}
          body={f.formats.body}
          visual={
            <div className="flex items-end gap-5">
              {[
                ['16:9', 'h-[72px] w-32'],
                ['9:16', 'h-28 w-[63px]'],
                ['1:1', 'size-[84px]'],
              ].map(([label, size]) => (
                <div key={label} className="flex flex-col items-center gap-2">
                  <div
                    className={cn(
                      size,
                      'flex items-center justify-center border-2 border-black bg-white',
                    )}
                  >
                    <span className="h-2.5 w-1/2 rounded-full bg-[var(--ember)]" />
                  </div>
                  <span className="text-[12px]">{label}</span>
                </div>
              ))}
            </div>
          }
        />
        <Feature
          className="md:col-span-2"
          title={f.captions.title}
          body={f.captions.body}
          visual={
            <span className="inline-flex items-center gap-2 rounded-lg border-2 border-black bg-black px-3 py-2 text-[20px] font-bold text-white">
              grew <span className="rounded-md bg-[var(--ember)] px-1.5 text-black">forty</span>{' '}
              percent
            </span>
          }
        />
        <Feature
          className="md:col-span-2"
          title={f.custom.title}
          body={f.custom.body}
          visual={
            <div className="w-full max-w-[260px] space-y-2.5">
              <div className="flex items-center gap-2 border-2 border-black bg-white px-3 py-2 text-[13px]">
                <Sparkles
                  className="size-4 shrink-0 text-[var(--violet)]"
                  strokeWidth={1.75}
                  aria-hidden
                />
                a rocket made of bar charts
              </div>
              <div className="ml-auto flex w-fit items-center gap-1.5 rounded-full border-2 border-black bg-[var(--mint)] px-2.5 py-0.5 text-[12px]">
                <Check className="size-3" strokeWidth={3} aria-hidden /> checked in a sandbox
              </div>
            </div>
          }
        />
        <Feature
          className="md:col-span-2"
          title={f.film.title}
          body={f.film.body}
          visual={
            <div className="flex items-center gap-2">
              <Clapperboard className="size-9 shrink-0" strokeWidth={1.5} aria-hidden />
              {['bg-[var(--pip)]', 'bg-[var(--ember)]', 'bg-[var(--violet)]'].map((bg, i) => (
                <span
                  key={bg}
                  className={cn('h-14 w-16 border-2 border-black', bg, i === 1 && '-translate-y-2')}
                />
              ))}
            </div>
          }
        />
        <Feature
          className="md:col-span-3"
          title={f.sound.title}
          body={f.sound.body}
          visual={
            <div className="relative flex w-full max-w-[360px] items-center justify-between">
              <span aria-hidden className="absolute inset-x-0 top-1/2 h-0.5 bg-black" />
              {['tick', 'whoosh', 'pop', 'tick'].map((x, i) => (
                <span
                  key={i}
                  className="relative rounded-full border-2 border-black bg-white px-3 py-1 text-[13px]"
                >
                  {x}
                </span>
              ))}
            </div>
          }
        />
        <Feature
          className="md:col-span-3"
          title={f.versions.title}
          body={f.versions.body}
          visual={
            <div className="flex items-center gap-3">
              {[1, 2, 3, 4].map((v) => (
                <div key={v} className="flex flex-col items-center gap-1.5">
                  <span
                    className={cn(
                      'flex h-12 w-20 items-center justify-center border-2 border-black bg-white text-[15px] font-bold',
                      v === 4 && 'bg-[var(--ember)] shadow-[3px_3px_0_#000]',
                    )}
                  >
                    {['32%', '38%', '40%', '40%'][v - 1]}
                  </span>
                  <span className="text-[11px]">v{v}</span>
                </div>
              ))}
            </div>
          }
        />
      </ul>
    </Band>
  );
}

/* ================================================================== audiences */

function Audiences() {
  return (
    <Band labelledBy="who-title" className={s.washDots}>
      <div className="grid gap-12 lg:grid-cols-2">
        <div>
          <Cue icon={Users} tone="var(--ember)" time="00:41" />
          <h2 id="who-title" className={cn(s.display, 'mt-5 text-[clamp(44px,6.4vw,76px)]')}>
            {AUDIENCES.title}
          </h2>
          <p className="mt-4 max-w-[420px] text-[15px] leading-[1.65] text-black/80">
            {AUDIENCES.body}
          </p>
        </div>
        <ul className="border-t-2 border-black lg:mt-16">
          {AUDIENCES.items.map((a) => (
            <li key={a.title} className="border-b-2 border-black py-6">
              <h3 className={cn(s.display, 'text-[34px]')}>{a.title}</h3>
              <p className="mt-1.5 max-w-[460px] text-[14px] leading-[1.6] text-black/80">
                {a.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </Band>
  );
}

/* ================================================================== stitched together */

function Stitched() {
  return (
    <section
      className={cn(s.stitched, 'relative isolate bg-black py-16 text-white sm:py-20')}
      aria-labelledby="stitched-title"
    >
      <div className={WRAP}>
        <div className="grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_auto]">
          <Head
            id="stitched-title"
            icon={Scissors}
            tone="var(--mint)"
            time="00:48"
            title={STITCHED.title}
            body={STITCHED.body}
            invert
          />
          {/* the monster, sewn together, wakes up */}
          <div className="relative hidden h-[260px] w-[300px] lg:block">
            <Bubble className="absolute top-0 left-0 z-10 rotate-[-6deg] text-black">
              {STITCHED.bubble}
            </Bubble>
            {/* eslint-disable-next-line @next/next/no-img-element -- static mascot */}
            <img
              src="/pip/plush.webp"
              alt=""
              className="absolute right-0 bottom-0 h-[210px] w-auto"
            />
          </div>
        </div>
        <ul className="mt-14 grid gap-x-0 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {STITCHED.parts.map((p, i) => (
            <li key={p.name} className="relative flex items-stretch">
              <div className="flex-1 border-2 border-white p-6">
                <span className="text-[12px] text-white/60 tabular-nums">part {i + 1}</span>
                <h3 className={cn(s.display, 'mt-1 text-[32px]')}>{p.name}</h3>
                <p className="mt-1 text-[14px] leading-[1.55] text-white/80">{p.job}</p>
              </div>
              {/* the seam to the next part */}
              {i % 3 !== 2 && (
                <span aria-hidden className="hidden w-8 shrink-0 items-center lg:flex">
                  <span className={cn(s.seam, 'w-full')} />
                </span>
              )}
            </li>
          ))}
        </ul>
        <a
          href={REPO}
          target="_blank"
          rel="noreferrer"
          className={cn(s.btn, s.btnPaper, s.btnOnInk, 'mt-12')}
        >
          {STITCHED.cta}
        </a>
      </div>
    </section>
  );
}

/* ================================================================== pricing */

function Pricing() {
  return (
    <Band id="pricing" labelledBy="pricing-title" className={s.washSunCorner}>
      <div className="mx-auto flex max-w-[640px] flex-col items-center text-center">
        <Cue icon={Coins} tone="var(--sun)" time="00:55" />
        <h2 id="pricing-title" className={cn(s.display, 'mt-5 text-[clamp(44px,6.4vw,76px)]')}>
          {PRICING.title}
        </h2>
        <p className="mt-4 text-[15px] leading-[1.65] text-black/80">{PRICING.body}</p>
      </div>
      <div
        className={cn(
          s.box,
          'mt-12 grid gap-8 p-7 shadow-[8px_8px_0_#000] md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:p-9',
        )}
      >
        <div className="flex flex-col">
          <h3 className={cn(s.display, 'text-[44px]')}>{PRICING.plan}</h3>
          <span className="mt-1 text-[14px] text-black/70">{PRICING.planNote}</span>
          <ul className="mt-6 space-y-2.5">
            {PRICING.perks.map((perk) => (
              <li key={perk} className="flex items-start gap-2.5 text-[14px] leading-[1.45]">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-[var(--ember)]"
                  strokeWidth={2.5}
                  aria-hidden
                />
                {perk}
              </li>
            ))}
          </ul>
          <StartLink className="mt-8 w-full md:mt-auto md:w-fit" />
        </div>
        <ul className="border-t-2 border-black md:border-t-0 md:border-l-2 md:pl-8">
          {PRICING.rows.map((r) => (
            <li
              key={r.label}
              className="flex items-center justify-between gap-4 border-b border-black/15 py-3 last:border-b-0"
            >
              <span className="text-[14px]">{r.label}</span>
              <span
                className={cn(
                  'shrink-0 rounded-full border-2 border-black px-2.5 py-0.5 text-[13px] tabular-nums',
                  r.cost === 'Free' ? 'bg-[var(--mint)]' : 'bg-white',
                )}
              >
                {r.cost}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-6 text-center text-[13px] text-black/60">{PRICING.footnote}</p>
    </Band>
  );
}

/* ================================================================== FAQ */

function Faq() {
  return (
    <Band labelledBy="faq-title" className={s.washPip}>
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div>
          <Cue icon={HelpCircle} tone="var(--pip)" time="01:02" />
          <h2 id="faq-title" className={cn(s.display, 'mt-5 text-[clamp(44px,6.4vw,76px)]')}>
            {FAQ.title}
          </h2>
          <p className="mt-4 text-[15px] text-black/80">{FAQ.body}</p>
        </div>
        <div className="border-t-2 border-black lg:mt-16">
          {FAQ.items.map((item) => (
            <details key={item.q} className={cn(s.faq, 'border-b-2 border-black')}>
              <summary className="flex items-center justify-between gap-6 py-5">
                <span className={cn(s.display, 'text-[28px] leading-[1]')}>{item.q}</span>
                <Plus className={cn(s.faqIcon, 'size-5 shrink-0')} strokeWidth={2} aria-hidden />
              </summary>
              <p className="max-w-[560px] pb-6 text-[14px] leading-[1.65] text-black/80">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </Band>
  );
}

/* ================================================================== closer + footer */

/** The ending: Pip flies the finished video off into the sunset. */
function Closer() {
  return (
    <section
      className={cn(s.dusk, 'relative isolate overflow-hidden')}
      aria-labelledby="closer-title"
    >
      <Voice at="bottom" />
      <div
        className={cn(
          WRAP,
          'relative grid items-center gap-6 pt-20 pb-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]',
        )}
      >
        <div>
          <h2 id="closer-title" className={cn(s.display, 'text-[clamp(56px,8.4vw,120px)]')}>
            {CLOSER.title}
          </h2>
          <p className="mt-5 text-[16px] text-black/80">{CLOSER.body}</p>
          <SignupOrOpen className="mt-2 w-[340px] max-w-full" />
        </div>
        {/* an 840 x 564 loop, crossing in front of the sun */}
        <div className="relative mx-auto aspect-[840/564] w-[360px] max-w-full sm:w-[500px] lg:w-full">
          <span aria-hidden className={s.sun} />
          <PipLoop name="plane" className="relative size-full" />
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-black text-white">
      <div className={cn(WRAP, 'pt-16 pb-10')}>
        <div className="pb-[0.12em] font-sans text-[clamp(72px,16vw,220px)] leading-[0.9] font-semibold tracking-[-0.055em]">
          motionpop
        </div>
        <div className="mt-8 flex flex-col gap-8 border-t border-white/20 pt-8 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[15px]">{FOOTER.tagline}</p>
            <p className="mt-2 text-[13px] text-white/60">{FOOTER.small}</p>
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
            {NAV.map((n) => (
              <li key={n.href}>
                <a href={n.href} className="text-white/80 hover:text-white">
                  {n.label}
                </a>
              </li>
            ))}
            <li>
              <a
                href={REPO}
                target="_blank"
                rel="noreferrer"
                className="text-white/80 hover:text-white"
              >
                Source
              </a>
            </li>
            <li>
              <Link href="/terms" className="text-white/80 hover:text-white">
                Terms
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="text-white/80 hover:text-white">
                Privacy
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

/* ================================================================== page */

/** The public marketing site (spec 34): a storyboard in ink, with Pip breaking out of the frames. */
export function Landing() {
  return (
    <div className={cn(s.page, display.variable, hand.variable)}>
      <Nav />
      <main>
        <Hero />
        <Ticker />
        <How />
        <Looks />
        <Hybrid />
        <Plans />
        <Features />
        <Audiences />
        <Stitched />
        <Pricing />
        <Faq />
        <Closer />
      </main>
      <Footer />
    </div>
  );
}
