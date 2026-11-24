'use client';

import { builtInSkills, SCENES, SKILLS } from '@motionpop/ai';
import { APP_CONFIG_DEFAULTS, costOf, exportCost, ReelTemplateSchema } from '@motionpop/schemas';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Download,
  Film,
  Flame,
  KeyRound,
  Layers,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wifi,
  WifiOff,
  Wrench,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PipLoop } from '@/components/landing/pip-loop';
import { AppBar } from '@/components/paper/app-bar';
import { btn, paper, PaperPage, poster, Sprockets } from '@/components/paper/kit';
import {
  cancelSetUp,
  detectAvailability,
  setUpOnDevice,
  useAIStatusStore,
  watchConnection,
} from '@/lib/ai/ai-status';
import { progressLabel } from '@/lib/ai/availability';
import { useByok } from '@/lib/ai/byok';
import { cn } from '@/lib/cn';
import {
  FrankensteinStackDiagram,
  HybridRouterDiagram,
  ParityDiagram,
  PipelineFlowDiagram,
} from './diagrams';

const cfg = APP_CONFIG_DEFAULTS;
const REPO = 'https://github.com/AbhinavJawle/motionpop';

interface RoutingRow {
  task: string;
  job: string;
  mode: 'ONLY_ON_DEVICE' | 'PREFER_ON_DEVICE' | 'ONLY_IN_CLOUD' | 'LOCAL_DSP';
  model: string;
  cost: string;
  guardrail: string;
}

const ROUTING_ROWS: readonly RoutingRow[] = [
  {
    task: 'Whisper + Auto-Cut DSP',
    job: 'Word timings, 10 ms speech map, dead-air, hiccup & LCS retake cuts, vocal prosody',
    mode: 'LOCAL_DSP',
    model: 'whisper-base_timestamped (WebGPU/WASM) + Web Audio',
    cost: 'Free · local',
    guardrail: 'Cloud fallback (transcribe.cloud) + non-destructive EDL',
  },
  {
    task: 'reel.note.local',
    job: 'Multimodal talking-head reel frame notes (JPEG crop + text/number/bg/layout/caption)',
    mode: 'ONLY_ON_DEVICE',
    model: 'Gemini Nano (Firebase AI Logic Prompt API)',
    cost: 'Free · on-device',
    guardrail: 'Depth-1 (≤ 5 opt) · D-035 explicit cloud click',
  },
  {
    task: 'pip.quick',
    job: 'Instant Pip chat commands (look, captions, theme, SFX, music, format, cuts, slot)',
    mode: 'ONLY_ON_DEVICE',
    model: 'Gemini Nano (Firebase AI Logic Prompt API)',
    cost: 'Free · on-device',
    guardrail: 'Theme normalizer + enforcePlan + cloud handoff',
  },
  {
    task: 'reel.draft',
    job: 'Free, offline, or cloud-fallback 4-template talking-head reel director',
    mode: 'ONLY_ON_DEVICE',
    model: 'Gemini Nano (Firebase AI Logic Prompt API)',
    cost: 'Free · on-device',
    guardrail: 'Tiled ReelPlanSchema + deterministic auto fallback',
  },
  {
    task: 'recipe.resolve',
    job: 'Custom recipe/style prose → strict ResolvedRecipe JSON',
    mode: 'ONLY_ON_DEVICE',
    model: 'Gemini Nano (Chrome Prompt API)',
    cost: 'Free · on-device',
    guardrail: 'Strict Zod + keyword fallback',
  },
  {
    task: 'edit.patch / note.fix',
    job: 'Quick edits & multimodal JPEG frame notes on explainer slots',
    mode: 'PREFER_ON_DEVICE',
    model: `Gemini Nano → ${cfg.modelFast}`,
    cost: `Free / ${costOf('edit', 1, cfg)} cr`,
    guardrail: 'RFC 6902 JSON Patch + Zod + 1 repair',
  },
  {
    task: 'component.fill (auto) / slots.detect',
    job: 'Auto-fill detected slots + chunked ≤ 400-word spoken-moment detection',
    mode: 'PREFER_ON_DEVICE',
    model: `Gemini Nano → ${cfg.modelFast}`,
    cost: 'Free · on-device',
    guardrail: 'gateSlot DOM check + snap/de-overlap post-pass',
  },
  {
    task: 'direct.plan / prompt.prefill',
    job: 'Whole-video energy arc & slot prompt drafts',
    mode: 'PREFER_ON_DEVICE',
    model: `Gemini Nano → ${cfg.modelFast}`,
    cost: 'Free · on-device',
    guardrail: 'Deterministic rules fallback (never throws)',
  },
  {
    task: 'reel.direct / reel.edit',
    job: 'Flagship 21-template talking-head director (6 keyframes) + semantic retake check',
    mode: 'ONLY_IN_CLOUD',
    model: `${cfg.modelStrong} · ${cfg.modelFast}`,
    cost: `${costOf('reel', 1, cfg)} cr / reel`,
    guardrail: 'Per-template strict schema + Nano/auto fallback + refund',
  },
  {
    task: 'reel.note / reel.compose',
    job: 'Full template rewrites & bespoke sandboxed custom motion scenes on reels',
    mode: 'ONLY_IN_CLOUD',
    model: cfg.modelStrong,
    cost: `1 cr / +${costOf('custom', 1, cfg)} cr`,
    guardrail: 'lintCustom + opaque sandbox DOM critic + repair',
  },
  {
    task: 'pip.plan / media.index',
    job: 'Multi-step whole-timeline Pip plans + multimodal Media Bin B-roll indexing',
    mode: 'ONLY_IN_CLOUD',
    model: cfg.modelStrong,
    cost: '2 cr + gens',
    guardrail: 'Inspectable plan card + single composite undo',
  },
  {
    task: 'component.fill (Generate)',
    job: 'Upgraded cloud fill driven by Markdown slot SKILL.md shot sequences',
    mode: 'ONLY_IN_CLOUD',
    model: cfg.modelStrong,
    cost: `${costOf('generate', 1, cfg)} cr`,
    guardrail: 'Zod + gateSlot + 2 repair rounds',
  },
  {
    task: 'film.direct / build / vision',
    job: 'Multi-beat storyboard + parallel sandboxed motion beats + Vision QA critic',
    mode: 'ONLY_IN_CLOUD',
    model: `${cfg.modelStrong} / ${cfg.modelFilmBuild}`,
    cost: `${costOf('film', 1, cfg)} cr / 30s`,
    guardrail: 'Static lint + DOM critic + multimodal visual QA',
  },
  {
    task: 'tts.generate / images / music',
    job: '5-voice narration, 1K chroma-key illustrations & crossfade-looped soundtracks',
    mode: 'ONLY_IN_CLOUD',
    model: `${cfg.modelTts} · ${cfg.modelImage} · lyria-002`,
    cost: `${costOf('tts', 1, cfg)} cr/m · ${cfg.imageCredits} cr`,
    guardrail: 'PartCache + 429 backoff + atomic spend & auto refund',
  },
  {
    task: 'Export (1080p MP4 · Alpha WebM)',
    job: 'Cloud Run HyperFrames producer + FFmpeg A-roll/B-roll/alpha/audio compositor',
    mode: 'ONLY_IN_CLOUD',
    model: 'Cloud Run · @hyperframes/producer + FFmpeg',
    cost:
      exportCost('1080p', 60_000, cfg.exportCredits) === 0
        ? 'Free'
        : `${exportCost('1080p', 60_000, cfg.exportCredits)} cr/min`,
    guardrail: 'Same HTML as preview · ≤ 1.02% pixel diff',
  },
];

const MODE_STYLE: Readonly<Record<RoutingRow['mode'], { label: string; bg: string }>> = {
  LOCAL_DSP: { label: 'LOCAL WORKER', bg: '#a7f3d0' },
  ONLY_ON_DEVICE: { label: 'ONLY_ON_DEVICE', bg: '#3ddc97' },
  PREFER_ON_DEVICE: { label: 'PREFER_ON_DEVICE', bg: '#a7f3d0' },
  ONLY_IN_CLOUD: { label: 'ONLY_IN_CLOUD', bg: '#c4b5fd' },
};

const SECTIONS = [
  { id: 'frankenstein-monster', label: '1. Frankenstein Monster' },
  { id: 'on-device-nano', label: '2. Hybrid AI & Sequence' },
  { id: 'pipeline-engines', label: '3. Pipeline & Sandbox' },
  { id: 'judges', label: '4. Firebase & Kiroween Brief' },
  { id: 'security-credits', label: '5. Security & Credits' },
] as const;

const FRANKENSTEIN_ORGANS = [
  {
    num: '01',
    tag: 'ON-DEVICE AI',
    bg: '#3ddc97',
    title: '10 Chrome Gemini Nano Tasks',
    body: 'reel.note.local, pip.quick, reel.draft, edit.patch, note.fix, recipe.resolve, auto-fill, slots.detect, direct.plan & prompt.prefill — 0 credits, offline.',
  },
  {
    num: '02',
    tag: 'LOCAL SPEECH',
    bg: '#a7f3d0',
    title: 'Whisper WebGPU + Vocal Prosody',
    body: 'transformers.js whisper-base_timestamped in a Web Worker (WebGPU → WASM) plus 70–400 Hz autocorrelation pitch & RMS stress scoring.',
  },
  {
    num: '03',
    tag: 'AUTO CUTTER',
    bg: '#fde68a',
    title: 'Retakes, Hiccups & Dead-Air EDL',
    body: '10 ms dBFS speech map + LCS retake detector (tense folding, parallel-list & negation guards) trims false starts, repeats, fillers & >380 ms pauses non-destructively.',
  },
  {
    num: '04',
    tag: 'CLOUD MODELS',
    bg: '#c4b5fd',
    title: 'Gemini 4 Neon, TTS, Art & Lyria 2',
    body: `${cfg.modelStrong} directing/code/Vision QA/media.index, ${cfg.modelFast}, ${cfg.modelTts} (5 voices + PartCache), ${cfg.modelImage} (#00FF00 cutouts), Vertex AI lyria-002 music & Claude Tier-2 hook.`,
  },
  {
    num: '05',
    tag: 'DUAL ENGINES',
    bg: '#8dbceb',
    title: 'Reel Engine v3 + Film Engine',
    body: '21 strict vertical reel templates (4 layouts, 5 captions) + 9 responsive explainer scenes & 8 OFL Style Packs — pure seek(tMs) JSON→HTML, zero GSAP.',
  },
  {
    num: '06',
    tag: '4-STAGE QA',
    bg: '#fed7aa',
    title: 'Static Lint → Sandbox → Vision QA',
    body: 'lintCustom (bans fetch/Date.now/random/timers) → @hyperframes/lint → opaque sandbox DOM critic (overflow, face-safe, contrast) → multimodal film.vision-critic repair.',
  },
  {
    num: '07',
    tag: 'AUDIO SYNTH',
    bg: '#a7f3d0',
    title: 'Procedural SFX & Voice Ducking',
    body: 'Zero stock SFX MP3s: 14 seeded takes across 5 families (whoosh, pop, tick, rise, impact) synthesized in Web Audio, peak-aligned to entrances + auto voice ducking.',
  },
  {
    num: '08',
    tag: '6 MEDIA APIS',
    bg: '#dbeafe',
    title: 'Pixabay, Openverse, Logos & Geo',
    body: 'Pixabay (24 h cache) → Pexels → Wikimedia stock proxy, Openverse (CC0/BY, UUID anti-SSRF), Simple Icons + Favicons, Headless Chrome screenshots & Natural Earth d3-geo maps.',
  },
  {
    num: '09',
    tag: 'SKILLS DB',
    bg: '#fef08a',
    title: 'Firestore-Synced SKILL.md',
    body: '5 Reel Recipes + 8 Slot Skills in Git, plus custom user & GitHub SKILL.md imports synced live with Firestore users/{uid}/skills/{id} straight into the directors.',
  },
  {
    num: '10',
    tag: '7 FIREBASE',
    bg: '#ddd6fe',
    title: 'End-to-End Firebase Backbone',
    body: 'AI Logic (default), App Check (reCAPTCHA Enterprise + limited-use), Auth, Firestore (skills DB + atomic credit ledger), Storage, Remote Config & App Hosting.',
  },
  {
    num: '11',
    tag: 'OPTIONAL BYOK',
    bg: '#ede9fe',
    title: 'Zero-Server Browser Gemini Key',
    body: 'Power-user option in Settings: key stays in localStorage, hits Google AI Studio via x-goog-api-key, keeps multimodal Chrome Nano first at 0 Motionpop credits.',
  },
  {
    num: '12',
    tag: 'CLOUD RUN',
    bg: '#ff8a5c',
    title: 'HyperFrames Producer + FFmpeg',
    body: 'services/render steps headless Chromium over the exact preview HTML at 30 fps (≤ 1.02% diff) and composites A-roll, B-roll, alpha overlays & audio → MP4 / WebM.',
  },
] as const;

const FIREBASE_SEVEN = [
  ['Firebase AI Logic', 'Default hybrid SDK (AgentPlatformBackend("global") + limited-use App Check) driving 10 Chrome Nano tasks + cloud Gemini'],
  ['App Check', 'reCAPTCHA Enterprise + limited-use tokens enforced across AI Logic, Firestore, Storage & signed API routes'],
  ['Authentication', 'Google Sign-In & Email Link with server-side ID token checks on every spend, Lyria music & render route'],
  ['Cloud Firestore', 'Projects, 200-step versions, bidirectional user SKILL.md DB (users/{uid}/skills/{id}), usage logs & server-only atomic credit ledger'],
  ['Cloud Storage', 'Raw A-roll, cleaned 24 kHz WAVs, Media Bin B-roll, Vertex AI Lyria tracks, MP4/WebM renders & /share/[id] streams'],
  ['Remote Config', 'Live routing_overrides, word thresholds, model IDs, credit prices, custom_provider & emergency kill_switch with zero redeploy'],
  ['App Hosting', 'Next.js 16 production web runtime paired seamlessly with Cloud Run services/render & Secret Manager'],
] as const;

const KIRO_SURFACES = [
  ['142 Kiro CLI runs', 'Logged automatically in KIRO_LOG.md via our Stop hook — genuine end-to-end engineering across the entire build'],
  ['44 EARS Specs & 21 Steering Docs', 'Requirements → Design → Tasks in .kiro/specs/ plus always/fileMatch guardrails in .kiro/steering/ (motion-principles, hybrid-ai, security)'],
  ['3 Custom Scoped Agents', 'motionpop-builder, motion-qa & spec-reviewer (.kiro/agents/) with explicit allowedPaths, deniedPaths & deniedCommands'],
  ['3 Automated Hooks', 'session-start.mjs (context), check-touched.mjs (PostToolUse lint/type check) & log-run.mjs (auto-logs commits to KIRO_LOG.md)'],
  ['3 Live MCP Servers', 'context7 (fresh Firebase AI Logic docs), chrome-devtools (visual frame checks) & firebase-tools MCP (.kiro/settings/mcp.json)'],
  ['PBT & Schema Guards', '236+ test files incl. 350 fast-check Nano fuzz runs, schema-rules/caps CI guards (catching >6 opt props & uncapped strings) & ledger invariants'],
  ['Antigravity + 8 Firebase Skills', 'Built with Antigravity & 8 official Firebase Agent Skills + HyperFrames skills checked into .kiro/skills/ & .claude/skills/'],
] as const;

const MONOREPO_STITCHES = [
  ['apps/web', 'Next.js 16 · React 19 · Tailwind 4 · Zustand', 'Paper Editor, Pip Chat, Whisper worker, auto-cut DSP, IndexedDB, Firestore skills sync & signed APIs'],
  ['packages/ai', 'Firebase AI Logic · Zod 4 · Vertex AI', 'Hybrid router, 20+ typed tasks (10 Nano), capped schemas, repair loops, Lyria 2 music & BYOK'],
  ['packages/motion', 'Pure TS · HyperFrames · d3-geo · Web Audio', 'Zero-GSAP seek(tMs) core, 21 reel templates, 9 scenes, 8 looks, 14-take SFX synth & DOM critic'],
  ['packages/schemas', 'Zod 4 · TypeScript 6 Strict', 'Shared Project, ReelPlan, EditConfig, UserSkill, Remote Config, int-ms time & credit cost schemas'],
  ['services/render', 'Cloud Run · @hyperframes/producer · FFmpeg', '30 fps headless Chromium capture + multi-layer FFmpeg compositing → MP4, alpha WebM & thumbs'],
  ['skills/ & .kiro/', 'Kiro · Antigravity · Firebase Agent Skills', '13 Markdown director/slot skills, 8 Firebase Agent Skills, 44 specs, 21 steering docs, 3 agents & hooks'],
] as const;

function LiveNanoProbe() {
  const availability = useAIStatusStore((s) => s.availability);
  const progress = useAIStatusStore((s) => s.setupProgress);
  const setupError = useAIStatusStore((s) => s.setupError);
  const online = useAIStatusStore((s) => s.online);
  const { active: byokActive } = useByok();

  useEffect(() => {
    void detectAvailability();
    return watchConnection();
  }, []);

  const badge =
    availability === 'available'
      ? { bg: '#3ddc97', label: 'Gemini Nano READY in this browser' }
      : availability === 'downloadable'
        ? { bg: '#fde68a', label: 'Gemini Nano downloadable in this browser' }
        : availability === 'downloading'
          ? { bg: '#8dbceb', label: progressLabel(progress) }
          : availability === 'checking'
            ? { bg: '#e5e7eb', label: 'Probing Chrome Prompt API…' }
            : { bg: '#ddd6fe', label: 'Cloud fallback active in this browser' };

  return (
    <div
      className={cn(
        paper.frame,
        paper.raised,
        'mt-7 flex flex-wrap items-center justify-between gap-4 px-5 py-3.5',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-lg border-2 border-ink"
          style={{ background: badge.bg }}
        >
          {availability === 'available' ? (
            <CheckCircle2 className="size-4" strokeWidth={2} aria-hidden />
          ) : (
            <Cpu className="size-4" strokeWidth={2} aria-hidden />
          )}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-md border-2 border-ink px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: badge.bg }}
            >
              {badge.label}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-ink bg-paper px-2 py-0.5 text-[11px]">
              {online ? (
                <>
                  <Wifi className="size-3" strokeWidth={2} aria-hidden />
                  Online
                </>
              ) : (
                <>
                  <WifiOff className="size-3" strokeWidth={2} aria-hidden />
                  Offline (10 Nano tasks active)
                </>
              )}
            </span>
            {byokActive && (
              <Link
                href="/settings#byok"
                className="inline-flex items-center gap-1 rounded-md border border-ink bg-[#d1fae5] px-2 py-0.5 text-[11px] font-semibold"
              >
                <KeyRound className="size-3" strokeWidth={2} aria-hidden />
                BYOK active · 0 cr
              </Link>
            )}
          </div>
          <p className="mt-1 text-[12px] text-black/70">
            {availability === 'available'
              ? '10 multimodal & quick AI tasks run locally at 0 credits right now — even offline.'
              : 'Desktop Chrome 139+ with Prompt API flag enables on-device Nano; Firebase AI Logic cloud fallback handles every other browser.'}
          </p>
          {setupError && <p className="mt-0.5 text-[11px] font-medium text-flame">{setupError}</p>}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {availability === 'downloadable' && (
          <button type="button" onClick={() => void setUpOnDevice()} className={btn('flame', 'sm')}>
            <Download className="size-3.5" strokeWidth={2} aria-hidden />
            Set up Gemini Nano
          </button>
        )}
        {availability === 'downloading' && (
          <button type="button" onClick={() => cancelSetUp()} className={btn('paper', 'sm')}>
            Cancel
          </button>
        )}
        <Link href="/settings#byok" className={btn('paper', 'sm')}>
          <KeyRound className="size-3.5" strokeWidth={2} aria-hidden />
          {byokActive ? 'Manage BYOK' : 'Optional BYOK'}
        </Link>
        <Link href="/start" className={btn('ink', 'sm')}>
          Try it now
          <ArrowRight className="size-3.5" strokeWidth={2} aria-hidden />
        </Link>
      </div>
    </div>
  );
}

/**
 * Public `/how-it-works` route (spec 40 R5): concise, diagram-driven architecture portal for
 * `#BuildHybridAI` (Firebase) and `Kiroween` (Frankenstein) judges.
 */
export function HowItWorksPage() {
  const [routeFilter, setRouteFilter] = useState<'all' | 'local' | 'cloud'>('all');
  const recipeCount = builtInSkills.recipes().length;
  const reelStyleCount = builtInSkills.recipes().reduce((sum, r) => sum + r.styles.length, 0);
  const templateCount = ReelTemplateSchema.options.length;
  const slotSkillCount = SKILLS.length;
  const builtSceneCount = SCENES.length;

  const visibleRows = ROUTING_ROWS.filter((r) =>
    routeFilter === 'all'
      ? true
      : routeFilter === 'local'
        ? r.mode !== 'ONLY_IN_CLOUD'
        : r.mode === 'ONLY_IN_CLOUD',
  );

  return (
    <PaperPage>
      <AppBar active="how" />
      <main className="mx-auto w-full max-w-[1240px] px-6 pt-12 pb-20 lg:px-10">
        {/* HERO — Crisp, visual, immediately scannable */}
        <section className="border-b-2 border-ink pb-9">
          <div className="flex items-end justify-between gap-8">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border-2 border-ink bg-[#3ddc97] px-2.5 py-0.5 text-[11px] font-semibold uppercase">
                  #BuildHybridAI · Firebase AI Logic + Chrome Nano
                </span>
                <span className="rounded-md border-2 border-ink bg-[#8dbceb] px-2.5 py-0.5 text-[11px] font-semibold uppercase">
                  #KiroweenHackathon26 · Frankenstein
                </span>
                <span className="rounded-md border-2 border-ink bg-[#fde68a] px-2.5 py-0.5 text-[11px] font-semibold uppercase">
                  Apache-2.0
                </span>
              </div>

              <h1 className={cn(poster, 'mt-4 text-[clamp(48px,6.4vw,96px)]')}>
                Under the hood. Every stitch, mapped.
              </h1>
              <p className="mt-3 max-w-[740px] text-[15px] leading-[1.6] text-black/80">
                Motionpop stitches <strong>12 specialized engines</strong> into one open-source AI
                video editor: local WebGPU Whisper + auto-retake cutting,{' '}
                <strong>10 on-device Chrome Gemini Nano tasks</strong> via{' '}
                <strong>Firebase AI Logic</strong>, frontier cloud Gemini + Vertex AI Lyria 2, 6
                open media resolvers, Firestore-synced{' '}
                <code className="text-[13px]">SKILL.md</code> recipes, and a deterministic zero-GSAP
                HyperFrames engine with ≤ 1.02% preview-to-MP4 parity.
              </p>
            </div>
            <PipLoop
              name="juggle"
              className="hidden h-[176px] w-[176px] shrink-0 select-none md:block"
            />
          </div>

          <dl className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { n: '10', label: 'On-device Nano tasks' },
              { n: '7', label: 'Firebase products' },
              { n: `${templateCount} + ${builtSceneCount}`, label: 'Reel & scene templates' },
              { n: '142', label: 'Logged Kiro CLI runs' },
              { n: '44', label: 'Kiro EARS specs' },
              { n: '≤ 1.02%', label: 'Preview vs MP4 diff' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border-2 border-ink bg-paper px-3.5 py-2.5 shadow-[3px_3px_0_#000]"
              >
                <dt className="text-[11px] text-black/60">{stat.label}</dt>
                <dd className={cn(poster, 'mt-0.5 text-[32px] tabular-nums')}>{stat.n}</dd>
              </div>
            ))}
          </dl>

          <LiveNanoProbe />

          <nav aria-label="Architecture sections" className="mt-6 flex flex-wrap gap-2">
            {SECTIONS.map((sec) => (
              <a
                key={sec.id}
                href={`#${sec.id}`}
                className="rounded-lg border-2 border-ink bg-paper px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-[#8dbceb]"
              >
                {sec.label}
              </a>
            ))}
          </nav>
        </section>

        {/* SECTION 1: THE FRANKENSTEIN MONSTER (High-Level Architecture + 12 Compact Organs) */}
        <section id="frankenstein-monster" className="scroll-mt-24 border-b-2 border-ink py-12">
          <div id="frankenstein-stack" className="flex items-end justify-between gap-6">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-ink bg-[#8dbceb] px-2.5 py-0.5 text-[11px] font-semibold uppercase">
                <Wrench className="size-3.5" strokeWidth={2} aria-hidden />
                01 · Frankenstein Monster
              </span>
              <h2 className={cn(poster, 'mt-2.5 text-[clamp(38px,5vw,66px)]')}>
                The Frankenstein Monster — 12 stitched organs.
              </h2>
            </div>
            <PipLoop
              name="craft"
              className="hidden h-[112px] w-[96px] shrink-0 select-none lg:block"
            />
          </div>

          <div className="mt-6">
            <FrankensteinStackDiagram />
          </div>

          <div className="mt-7 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {FRANKENSTEIN_ORGANS.map((o) => (
              <article key={o.num} className={cn(paper.frame, 'p-4')}>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="rounded border border-ink px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                    style={{ background: o.bg }}
                  >
                    {o.tag}
                  </span>
                  <span className="text-[10px] font-semibold text-black/45 tabular-nums">
                    {o.num}
                  </span>
                </div>
                <h3 className={cn(poster, 'mt-2 text-[22px] leading-tight')}>{o.title}</h3>
                <p className="mt-1.5 text-[12px] leading-[1.5] text-black/75">{o.body}</p>
              </article>
            ))}
          </div>

          {/* Expandable package map + explicit non-choices so page stays lean */}
          <details className={cn(paper.frame, 'group mt-5 overflow-hidden')}>
            <summary className="flex cursor-pointer items-center justify-between gap-3 bg-mist/60 px-4 py-3 text-[12px] font-semibold select-none hover:bg-mist">
              <span>Inspect monorepo package boundaries (6 stitches) &amp; deliberate non-choices</span>
              <ChevronDown
                className="size-4 shrink-0 transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <div className="border-t-2 border-ink p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {MONOREPO_STITCHES.map(([pkg, stack, owns]) => (
                  <div key={pkg} className="rounded-lg border border-ink/25 bg-paper p-3">
                    <code className="rounded bg-black px-1.5 py-0.5 text-[11px] font-semibold text-paper">
                      {pkg}
                    </code>
                    <p className="mt-1.5 text-[10px] font-semibold text-black/60 uppercase">
                      {stack}
                    </p>
                    <p className="mt-1 text-[12px] leading-[1.45] text-black/80">{owns}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 rounded-lg border-2 border-ink bg-black px-4 py-2.5 text-[12px] text-paper">
                <strong className="text-flame uppercase">Deliberate non-choices:</strong> No GSAP
                (licence incompatible with no-code motion tools), no Remotion, no ElevenLabs
                (Gemini TTS), no AWS runtime services, and zero stock SFX MP3s (100% Web Audio DSP).
              </p>
            </div>
          </details>
        </section>

        {/* SECTION 2: HYBRID AI SEQUENCE & LIVE FILTERABLE MATRIX */}
        <section id="on-device-nano" className="scroll-mt-24 border-b-2 border-ink py-12">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-ink bg-[#3ddc97] px-2.5 py-0.5 text-[11px] font-semibold uppercase">
              <Zap className="size-3.5" strokeWidth={2} aria-hidden />
              02 · Firebase AI Logic Hybrid Inference
            </span>
            <span className="text-[12px] text-black/60">
              packages/ai/src/router.ts · Default path (zero setup)
            </span>
          </div>
          <h2 className={cn(poster, 'mt-2.5 text-[clamp(38px,5vw,66px)]')}>
            On-device Gemini Nano first. Cloud only when it counts.
          </h2>

          <div className="mt-6">
            <HybridRouterDiagram />
          </div>

          {/* 3 Ultra-tight scannable pillars */}
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className={cn(paper.frame, 'p-4')}>
              <span className="inline-block rounded border border-ink bg-[#3ddc97] px-2 py-0.5 text-[10px] font-semibold uppercase">
                10 On-Device Nano Tasks (0 cr · offline)
              </span>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[
                  'reel.note.local',
                  'pip.quick',
                  'reel.draft',
                  'edit.patch',
                  'note.fix',
                  'recipe.resolve',
                  'component.fill (auto)',
                  'slots.detect (≤400w)',
                  'direct.plan',
                  'prompt.prefill',
                ].map((t) => (
                  <code
                    key={t}
                    className="rounded border border-ink/30 bg-[#ecfdf5] px-1.5 py-0.5 text-[11px] font-semibold"
                  >
                    {t}
                  </code>
                ))}
              </div>
              <p className="mt-2.5 text-[12px] leading-[1.5] text-black/75">
                Multimodal JPEG frame notes, instant Pip commands, free/offline reel drafts, quick
                patches &amp; recipe parsing all run inside Desktop Chrome via Firebase AI Logic.
              </p>
            </div>

            <div className={cn(paper.frame, 'p-4')}>
              <span className="inline-block rounded border border-ink bg-[#fde68a] px-2 py-0.5 text-[10px] font-semibold uppercase">
                Engineered for Nano Limits + D-035
              </span>
              <ul className="mt-2.5 space-y-1.5 text-[12px] leading-[1.5] text-black/80">
                <li>
                  • <strong>CI-guarded schemas:</strong> depth ≤ 3, ≤ 6 optional props, numeric{' '}
                  <code>maxLength</code> on every string, prompts 968–1,622 chars (inside Nano&apos;s
                  9,216-token cap).
                </li>
                <li>
                  • <strong>No silent charges (D-035):</strong> Mint chips never bill cloud credits;
                  escalations surface Nano&apos;s reason + one-click <strong>Try in the cloud</strong>.
                </li>
                <li>
                  • <strong>No audio in Nano:</strong> Local Whisper WebGPU handles speech; cloud{' '}
                  <code>{cfg.modelTts}</code> handles TTS.
                </li>
              </ul>
            </div>

            <div className={cn(paper.frame, 'p-4')}>
              <span className="inline-block rounded border border-ink bg-[#c4b5fd] px-2 py-0.5 text-[10px] font-semibold uppercase">
                Verify Offline in 30 Seconds
              </span>
              <ol className="mt-2.5 list-decimal space-y-1.5 pl-4 text-[12px] leading-[1.5] text-black/80">
                <li>
                  Desktop Chrome 139+: enable{' '}
                  <code className="break-all text-[10.5px]">
                    chrome://flags/#prompt-api-for-gemini-nano-multimodal-input
                  </code>
                  .
                </li>
                <li>
                  Click <strong>Set up Gemini Nano</strong> above (or in{' '}
                  <Link href="/settings" className={paper.link}>
                    Settings
                  </Link>
                  ).
                </li>
                <li>
                  Toggle <strong>DevTools → Offline</strong>, then run a Pip edit or circle a frame
                  note → lands locally at 0 cr (<code className="text-[11px]">ranOn: &quot;device&quot;</code>).
                </li>
              </ol>
            </div>
          </div>

          {/* Compact Optional BYOK strip */}
          <div
            className={cn(
              paper.frame,
              'mt-4 flex flex-wrap items-center justify-between gap-3 bg-[#ede9fe]/45 px-4 py-3',
            )}
          >
            <p className="min-w-0 flex-1 text-[12px] leading-[1.5] text-black/80">
              <strong className="text-ink">Optional Bring Your Own Key (Power-User Setting):</strong>{' '}
              Firebase AI Logic is the zero-setup default. Power users can optionally paste a Google
              AI Studio key in <code className="text-[11px]">localStorage</code> (direct{' '}
              <code className="text-[11px]">x-goog-api-key</code>, multimodal Nano still first, 0
              Motionpop credits).
            </p>
            <Link href="/settings#byok" className={btn('paper', 'sm')}>
              <KeyRound className="size-3.5" strokeWidth={2} aria-hidden />
              Settings → BYOK
            </Link>
          </div>

          {/* Filterable Live Task Routing Table */}
          <div id="routing-matrix" className="mt-7 scroll-mt-24">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className={cn(poster, 'text-[30px]')}>
                Live AI Routing &amp; Credit Matrix
              </h3>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter AI tasks">
                {(
                  [
                    ['all', `All (${ROUTING_ROWS.length})`],
                    ['local', `On-Device & Local (${ROUTING_ROWS.filter((r) => r.mode !== 'ONLY_IN_CLOUD').length})`],
                    ['cloud', `Cloud (${ROUTING_ROWS.filter((r) => r.mode === 'ONLY_IN_CLOUD').length})`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRouteFilter(key)}
                    className={cn(
                      'rounded-lg border-2 border-ink px-2.5 py-1 text-[11px] font-semibold transition-colors',
                      routeFilter === key ? 'bg-black text-paper' : 'bg-paper hover:bg-mist',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className={cn(paper.frame, paper.raised, 'mt-3 overflow-hidden')}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] border-collapse text-left text-[11.5px]">
                  <thead>
                    <tr className="border-b-2 border-ink bg-black text-paper">
                      <th className="px-3.5 py-2.5 font-semibold uppercase">Task</th>
                      <th className="px-3.5 py-2.5 font-semibold uppercase">Mode</th>
                      <th className="px-3.5 py-2.5 font-semibold uppercase">Model / Runtime</th>
                      <th className="px-3.5 py-2.5 font-semibold uppercase">Price</th>
                      <th className="px-3.5 py-2.5 font-semibold uppercase">Guardrail &amp; Fallback</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/15">
                    {visibleRows.map((row) => {
                      const m = MODE_STYLE[row.mode];
                      return (
                        <tr key={row.task} className="align-top hover:bg-mist/55">
                          <td className="px-3.5 py-2.5">
                            <code className="font-semibold">{row.task}</code>
                            <div className="mt-0.5 text-[11px] text-black/65">{row.job}</div>
                          </td>
                          <td className="px-3.5 py-2.5">
                            <span
                              className="inline-block rounded border border-ink px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap"
                              style={{ background: m.bg }}
                            >
                              {m.label}
                            </span>
                          </td>
                          <td className="px-3.5 py-2.5 text-[11px] text-black/85">{row.model}</td>
                          <td className="px-3.5 py-2.5 font-semibold whitespace-nowrap tabular-nums">
                            {row.cost}
                          </td>
                          <td className="px-3.5 py-2.5 text-[11px] text-black/75">
                            {row.guardrail}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: END-TO-END PIPELINE & SANDBOXED DETERMINISTIC PARITY */}
        <section id="pipeline-engines" className="scroll-mt-24 border-b-2 border-ink py-12">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-ink bg-[#ff8a5c] px-2.5 py-0.5 text-[11px] font-semibold uppercase">
              <Film className="size-3.5" strokeWidth={2} aria-hidden />
              03 · Pipeline, Dual Engines &amp; Parity Sandbox
            </span>
          </div>
          <h2 className={cn(poster, 'mt-2.5 text-[clamp(38px,5vw,66px)]')}>
            Raw footage to frame-exact MP4 — zero drift.
          </h2>

          <div className="mt-6">
            <PipelineFlowDiagram />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <article className={cn(paper.frame, 'p-4')}>
              <div className="flex items-center justify-between gap-2">
                <h3 className={cn(poster, 'text-[28px]')}>Reel Engine v3</h3>
                <span className="rounded border border-ink bg-[#8dbceb]/60 px-2 py-0.5 text-[10px] font-semibold uppercase">
                  Talking-Head 9:16
                </span>
              </div>
              <p className="mt-1.5 text-[12px] leading-[1.55] text-black/80">
                <strong>{templateCount} strict templates</strong> (<code className="text-[11px]">headline, list, stack, checklist, compare, statement, counter, progress, terminal, chart, browser, flow, quote, logo, logos, image, website, punch, cta, none, custom</code>),{' '}
                <strong>4 stage layouts</strong> (<code>split, card, full, speaker</code>),{' '}
                <strong>{recipeCount} Recipes / {reelStyleCount} styles</strong> + custom Firestore{' '}
                <code>SKILL.md</code>, 5 kinetic captions, hybrid <code>reel.note.local</code> +{' '}
                <code>reel.compose</code>.
              </p>
            </article>

            <article className={cn(paper.frame, 'p-4')}>
              <div className="flex items-center justify-between gap-2">
                <h3 className={cn(poster, 'text-[28px]')}>Motion Graphic &amp; Film Engine</h3>
                <span className="rounded border border-ink bg-[#fde68a]/80 px-2 py-0.5 text-[10px] font-semibold uppercase">
                  16:9 · 9:16 · 1:1 Reflow
                </span>
              </div>
              <p className="mt-1.5 text-[12px] leading-[1.55] text-black/80">
                <strong>{builtSceneCount} responsive scenes</strong> (<code className="text-[11px]">stat-punch, hook-statement, versus, chart-story, list-stack, timeline, quote, map-zoom, photo-evidence</code>),{' '}
                <strong>8 bundled OFL Style Packs</strong>, <strong>{slotSkillCount} slot skills</strong>,
                and <strong>Film Mode</strong> (<code>film.direct</code> → parallel{' '}
                <code>film.build</code> → sandbox DOM + multimodal <code>film.vision-critic</code>).
              </p>
            </article>
          </div>

          <div className="mt-7">
            <ParityDiagram />
          </div>
        </section>

        {/* SECTION 4: DUAL HACKATHON JUDGE BRIEF (FIREBASE + KIROWEEN SIDE-BY-SIDE) */}
        <section id="judges" className="scroll-mt-24 border-b-2 border-ink py-12">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-ink bg-[#fde68a] px-2.5 py-0.5 text-[11px] font-semibold uppercase">
              <Sparkles className="size-3.5" strokeWidth={2} aria-hidden />
              04 · Built for Judges
            </span>
          </div>
          <h2 className={cn(poster, 'mt-2.5 text-[clamp(38px,5vw,66px)]')}>
            Seven Firebase products. Built for Desktop Chrome. Engineered with Kiro.
          </h2>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {/* LEFT: #BuildHybridAI Firebase Judge Brief */}
            <article className={cn(paper.frame, paper.raised, 'flex flex-col overflow-hidden')}>
              <div className="flex items-center justify-between gap-2 border-b-2 border-ink bg-[#fef3c7] px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <Flame className="size-5 text-flame" strokeWidth={2} aria-hidden />
                  <h3 className={cn(poster, 'text-[28px]')}>#BuildHybridAI · Firebase</h3>
                </div>
                <span className="rounded border border-ink bg-paper px-2 py-0.5 text-[10px] font-semibold uppercase">
                  Web (Desktop Chrome)
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-4 p-5 text-[12.5px] leading-[1.55]">
                <ul className="space-y-2">
                  {FIREBASE_SEVEN.map(([name, desc]) => (
                    <li key={name} className="text-black/80">
                      <strong className="text-ink">{name}:</strong> {desc}.
                    </li>
                  ))}
                </ul>
                <div className="mt-auto rounded-lg border-2 border-ink bg-[#eff6ff] p-3.5 text-[12px] text-black/85">
                  <strong>Why Desktop Chrome:</strong> Pro multi-track video editing belongs on a
                  desktop canvas — Desktop Chrome 139+ uniquely unites{' '}
                  <strong>WebGPU Whisper</strong>, <strong>multimodal Gemini Nano</strong> via
                  Firebase AI Logic, <strong>Web Audio DSP</strong>, <strong>IndexedDB</strong> and{' '}
                  <strong>sandboxed 30 fps HyperFrames</strong> in one zero-install URL. Built with{' '}
                  <strong>Antigravity</strong> and <strong>8 official Firebase Agent Skills</strong>.
                </div>
              </div>
            </article>

            {/* RIGHT: Kiroween 2026 Judge Brief */}
            <article className={cn(paper.frame, paper.raised, 'flex flex-col overflow-hidden')}>
              <div className="flex items-center justify-between gap-2 border-b-2 border-ink bg-[#ede9fe] px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <Layers className="size-5 text-ink" strokeWidth={2} aria-hidden />
                  <h3 className={cn(poster, 'text-[28px]')}>Kiroween 2026 · Frankenstein</h3>
                </div>
                <span className="rounded border border-ink bg-paper px-2 py-0.5 text-[10px] font-semibold uppercase">
                  /.kiro Checked In
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-4 p-5 text-[12.5px] leading-[1.55]">
                <ul className="space-y-2">
                  {KIRO_SURFACES.map(([name, desc]) => (
                    <li key={name} className="text-black/80">
                      <strong className="text-ink">{name}:</strong> {desc}.
                    </li>
                  ))}
                </ul>
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Link href="/recipes" className={btn('ink', 'sm')}>
                    Browse Recipes
                  </Link>
                  <Link href="/skills" className={btn('paper', 'sm')}>
                    Inspect {recipeCount + slotSkillCount} Skills
                  </Link>
                  <Link href="/styles" className={btn('paper', 'sm')}>
                    Explore Styles
                  </Link>
                </div>
              </div>
            </article>
          </div>
        </section>

        {/* SECTION 5: SECURITY & CREDIT SAFETY */}
        <section id="security-credits" className="scroll-mt-24 pt-12">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-ink bg-black px-2.5 py-0.5 text-[11px] font-semibold text-paper uppercase">
              <ShieldCheck className="size-3.5 text-flame" strokeWidth={2} aria-hidden />
              05 · Production Safety
            </span>
          </div>
          <h2 className={cn(poster, 'mt-2.5 text-[clamp(36px,4.6vw,60px)]')}>
            Security, privacy &amp; honest credit accounting.
          </h2>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              {
                icon: Lock,
                title: 'App Check enforced',
                body: 'reCAPTCHA Enterprise + limited-use tokens on AI Logic, Firestore, Storage & signed routes.',
              },
              {
                icon: ShieldCheck,
                title: 'Server-only ledger',
                body: 'Firestore rules block client credit writes; atomic Admin SDK transactions + hourly rate limits.',
              },
              {
                icon: RefreshCw,
                title: 'Auto refunds + D-035',
                body: 'Prices show before every click; mint chips never silently charge; failed cloud runs auto-refund.',
              },
              {
                icon: KeyRound,
                title: 'Zero-server BYOK safety',
                body: 'Optional Gemini keys stay in localStorage and go straight to Google via x-goog-api-key only.',
              },
              {
                icon: Terminal,
                title: 'Remote Config controls',
                body: 'Live kill_switch, export pause, model routing overrides & prices with zero redeploy.',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className={cn(paper.frame, 'p-4')}>
                  <span className="grid size-8 place-items-center rounded-lg border-2 border-ink bg-mist">
                    <Icon className="size-4" strokeWidth={2} aria-hidden />
                  </span>
                  <h3 className={cn(poster, 'mt-2.5 text-[22px]')}>{item.title}</h3>
                  <p className="mt-1 text-[12px] leading-[1.5] text-black/80">{item.body}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-12 overflow-hidden rounded-xl border-2 border-ink bg-black text-paper shadow-[5px_5px_0_#000]">
            <Sprockets className="opacity-35" />
            <div className="flex flex-wrap items-center justify-between gap-6 px-6 py-7 sm:px-8">
              <div>
                <h2 className={cn(poster, 'text-[clamp(34px,4.2vw,52px)]')}>
                  See the monster in action.
                </h2>
                <p className="mt-1.5 max-w-[520px] text-[13.5px] text-paper/75">
                  Drop a talking-head video, try a sample voiceover, or inspect every commit,
                  decision and Kiro spec on GitHub.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/start" className={btn('flame', 'md', true)}>
                  Create a project
                  <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
                </Link>
                <a
                  href={REPO}
                  target="_blank"
                  rel="noreferrer"
                  className={btn('paper', 'md', true)}
                >
                  Read the source
                </a>
              </div>
            </div>
            <Sprockets className="opacity-35" />
          </div>
        </section>
      </main>
    </PaperPage>
  );
}
