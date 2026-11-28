'use client';

import { builtInSkills, recipeResolveTask, SCENES, SKILLS } from '@motionpop/ai';
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
  Server,
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
import { useLocalLlm } from '@/lib/ai/local-llm';
import { getRouterFor } from '@/lib/ai/router-client';
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
    task: 'Whisper + Auto-Cut',
    job: 'Transcribes every word with exact timing and trims awkward pauses, hiccups, and bad retakes',
    mode: 'LOCAL_DSP',
    model: 'Whisper in your browser (GPU / WASM) + Web Audio',
    cost: 'Free · local',
    guardrail: 'Non-destructive cuts (undo anytime) + cloud transcription backup',
  },
  {
    task: 'setup.recommend',
    job: 'Reads your transcript or idea and automatically picks the best recipe, director skill, and look',
    mode: 'ONLY_ON_DEVICE',
    model: 'Chrome Gemini Nano (or your local Ollama / LM Studio)',
    cost: 'Free · on-device',
    guardrail: 'Instant offline fallback if Chrome AI is off; never overwrites your manual picks',
  },
  {
    task: 'reel.note.local',
    job: 'Fixes circled frame notes right on your talking-head reel (text, numbers, colors, layout, captions)',
    mode: 'ONLY_ON_DEVICE',
    model: 'Chrome Gemini Nano (Firebase AI Logic)',
    cost: 'Free · on-device',
    guardrail: 'Never bills cloud credits silently — asks before trying the cloud',
  },
  {
    task: 'pip.quick',
    job: 'Handles instant chat edits with Pip (change look, toggle captions, swap music, trim cuts)',
    mode: 'ONLY_ON_DEVICE',
    model: 'Chrome Gemini Nano (Firebase AI Logic)',
    cost: 'Free · on-device',
    guardrail: 'Checks every edit against your project before applying; 1-click undo',
  },
  {
    task: 'reel.draft',
    job: 'Directs a complete talking-head reel completely free and offline using 8 core visual templates',
    mode: 'ONLY_ON_DEVICE',
    model: 'Chrome Gemini Nano (Firebase AI Logic)',
    cost: 'Free · on-device',
    guardrail: 'Clean scene timing check + instant built-in backup director',
  },
  {
    task: 'recipe.resolve',
    job: 'Turns plain English like "dark tech news vibe" into a matching recipe, color theme, and caption style',
    mode: 'ONLY_ON_DEVICE',
    model: 'Chrome Gemini Nano (Firebase AI Logic)',
    cost: 'Free · on-device',
    guardrail: 'Strict output check + fast keyword match backup',
  },
  {
    task: 'edit.patch / note.fix',
    job: 'Quick text edits and circled frame notes on explainer motion graphics',
    mode: 'PREFER_ON_DEVICE',
    model: `Gemini Nano → ${cfg.modelFast} (or Ollama / LM Studio)`,
    cost: `Free / ${costOf('edit', 1, cfg)} cr`,
    guardrail: 'Validates every patch and auto-repairs once if anything looks off',
  },
  {
    task: 'component.fill (auto)',
    job: 'Background auto-fill of detected motion-graphic slots with structured scene params',
    mode: 'ONLY_ON_DEVICE',
    model: 'Chrome Gemini Nano (Firebase AI Logic)',
    cost: 'Free · on-device',
    guardrail: 'Measures text so nothing clips or overlaps; deterministic defaults backup',
  },
  {
    task: 'slots.detect',
    job: 'Finds key spoken moments in transcripts (chunked ≤ 400 words on-device via Remote Config)',
    mode: 'PREFER_ON_DEVICE',
    model: `Gemini Nano (≤400w chunks) → ${cfg.modelStrong}`,
    cost: 'Free · on-device',
    guardrail: 'Instant local deterministic detector fallback when Nano is unavailable',
  },
  {
    task: 'direct.plan / prompt.prefill',
    job: 'Plans your video pacing arc and drafts starting prompts for each graphic slot',
    mode: 'ONLY_ON_DEVICE',
    model: 'Chrome Gemini Nano (Firebase AI Logic)',
    cost: 'Free · on-device',
    guardrail: 'Always falls back cleanly to built-in pacing rules',
  },
  {
    task: 'reel.direct / reel.edit',
    job: 'Full 21-template talking-head director that watches 6 keyframes and double-checks retake cuts',
    mode: 'ONLY_IN_CLOUD',
    model: `${cfg.modelStrong} · ${cfg.modelFast} (or 0 cr with Ollama / BYOK)`,
    cost: `${costOf('reel', 1, cfg)} cr / reel`,
    guardrail: 'Checks every scene field; auto-refunds and falls back to Nano if cloud fails',
  },
  {
    task: 'reel.note / reel.compose',
    job: 'Big creative rewrites and one-off custom animated scenes built from scratch',
    mode: 'ONLY_IN_CLOUD',
    model: `${cfg.modelStrong} (or 0 cr with Ollama / BYOK)`,
    cost: `${costOf('edit', 1, cfg)} cr / +${costOf('custom', 1, cfg)} cr`,
    guardrail: 'Safety scan + isolated sandbox preview check + auto-repair loop',
  },
  {
    task: 'pip.plan / media.index',
    job: 'Multi-step timeline plans from Pip chat plus smart indexing of your uploaded B-roll clips',
    mode: 'ONLY_IN_CLOUD',
    model: `${cfg.modelStrong} (or 0 cr with Ollama / BYOK)`,
    cost: `${costOf('pip-plan', 1, cfg)} cr + gens`,
    guardrail: 'Shows the full plan before applying; whole plan undoes in one click',
  },
  {
    task: 'component.fill (Generate)',
    job: 'Upgraded graphic generation guided by your chosen Markdown skill playbook',
    mode: 'ONLY_IN_CLOUD',
    model: `${cfg.modelFast} (or 0 cr with Ollama / BYOK)`,
    cost: `${costOf('generate', 1, cfg)} cr`,
    guardrail: 'Layout check + up to 2 automatic repair rounds',
  },
  {
    task: 'film.direct / build / vision',
    job: 'Builds multi-beat custom motion sequences and inspects screenshots to catch visual bugs',
    mode: 'ONLY_IN_CLOUD',
    model: `${cfg.modelStrong} / ${cfg.modelFilmBuild} (or 0 cr with Ollama / BYOK)`,
    cost: `${costOf('film', 1, cfg)} cr / 30s`,
    guardrail: 'Code safety scan + layout check + visual screenshot review',
  },
  {
    task: 'tts.generate / images / music',
    job: '5 natural AI voices, crisp transparent cutout art, and custom looping background music',
    mode: 'ONLY_IN_CLOUD',
    model: `${cfg.modelTts} · ${cfg.modelImage} · lyria-002`,
    cost: `${costOf('tts', 1, cfg)} cr/m · ${cfg.imageCredits} cr`,
    guardrail: 'Caches repeated lines, retries rate limits, and auto-refunds on any failure',
  },
  {
    task: 'Export (1080p MP4 · Alpha WebM)',
    job: 'Turns your exact preview into a finished 1080p video or transparent overlay file',
    mode: 'ONLY_IN_CLOUD',
    model: 'Cloud Run · HyperFrames + FFmpeg',
    cost:
      exportCost('1080p', 60_000, cfg.exportCredits) === 0
        ? 'Free'
        : `${exportCost('1080p', 60_000, cfg.exportCredits)} cr/min`,
    guardrail: 'Renders the exact same HTML as your preview (within 1.02% pixel match)',
  },
];

const MODE_STYLE: Readonly<Record<RoutingRow['mode'], { label: string; bg: string }>> = {
  LOCAL_DSP: { label: 'LOCAL BROWSER', bg: '#a7f3d0' },
  ONLY_ON_DEVICE: { label: 'ON-DEVICE', bg: '#3ddc97' },
  PREFER_ON_DEVICE: { label: 'DEVICE FIRST', bg: '#a7f3d0' },
  ONLY_IN_CLOUD: { label: 'CLOUD / LOCAL LLM', bg: '#c4b5fd' },
};

const SECTIONS = [
  { id: 'frankenstein-monster', label: '1. The 12 Engines' },
  { id: 'on-device-nano', label: '2. Free Local & Hybrid AI' },
  { id: 'pipeline-engines', label: '3. Video to Export' },
  { id: 'judges', label: '4. Firebase & Kiro Brief' },
  { id: 'security-credits', label: '5. Privacy & Safety' },
] as const;

const FRANKENSTEIN_ORGANS = [
  {
    num: '01',
    tag: 'BUILT-IN AI',
    bg: '#3ddc97',
    title: '11 On-Device Chrome AI Tasks',
    body: 'Quick edits, circled frame notes, instant Pip commands, style auto-picking, and offline reel drafts run right inside Chrome via Gemini Nano — 0 credits, even with Wi-Fi off.',
  },
  {
    num: '02',
    tag: 'LOCAL SPEECH',
    bg: '#a7f3d0',
    title: 'Private Browser Transcription',
    body: 'Whisper runs locally in your browser (using your GPU when available) to timestamp every word and hear where your voice emphasizes key points — your audio never has to leave your laptop.',
  },
  {
    num: '03',
    tag: 'AUTO CUTTER',
    bg: '#fde68a',
    title: 'Automatic Retake & Pause Trimmer',
    body: 'Spots bad takes, repeated lines, stumbles, and awkward dead air automatically, then trims them cleanly without ever touching your original clip.',
  },
  {
    num: '04',
    tag: 'CLOUD MODELS',
    bg: '#c4b5fd',
    title: 'Frontier Directing, Voices & Music',
    body: `When you want full creative firepower, ${cfg.modelStrong} and ${cfg.modelFast} direct complex scenes, ${cfg.modelTts} generates 5 natural voices, ${cfg.modelImage} paints transparent cutouts, and Vertex AI lyria-002 composes custom looping soundtracks.`,
  },
  {
    num: '05',
    tag: 'DUAL ENGINES',
    bg: '#8dbceb',
    title: 'Talking-Head Reels & Custom Graphics',
    body: '21 animated reel templates for vertical talking-head videos plus 9 responsive motion-graphic scenes and 11 studio looks — working seamlessly in 9:16, 16:9, and 1:1.',
  },
  {
    num: '06',
    tag: '4-STAGE QA',
    bg: '#fed7aa',
    title: 'Self-Checking AI Visuals',
    body: 'Before any AI-generated scene lands on your timeline, we scan the code for safety, render it in a locked-down sandbox, check for clipped text or covered faces, and auto-fix issues.',
  },
  {
    num: '07',
    tag: 'AUDIO SYNTH',
    bg: '#a7f3d0',
    title: 'Built-In Sound Effects & Ducking',
    body: 'No stock sound packs needed. Every whoosh, pop, tick, rise, and hit is generated live in your browser, synced to the exact moment graphics enter, with music automatically dipping while you speak.',
  },
  {
    num: '08',
    tag: '6 MEDIA APIS',
    bg: '#dbeafe',
    title: 'Photos, Icons, Screenshots & Maps',
    body: 'Finds real, properly licensed visuals from Pixabay, Pexels, Wikimedia, and Openverse, pulls crisp brand icons, takes live website screenshots, and draws smooth offline vector maps.',
  },
  {
    num: '09',
    tag: 'SKILLS DB',
    bg: '#fef08a',
    title: 'Open-Source Director Playbooks',
    body: 'Includes 8 built-in video recipes, 16 open-source community director skills, and 8 graphic skills — plus you can write your own plain Markdown playbooks or import them from GitHub.',
  },
  {
    num: '10',
    tag: '7 FIREBASE',
    bg: '#ddd6fe',
    title: '7 Firebase Products Working Together',
    body: 'Powered end-to-end by Firebase AI Logic, App Check, Auth, Firestore (projects, skills, and credit ledger), Cloud Storage, Remote Config, and App Hosting.',
  },
  {
    num: '11',
    tag: 'LOCAL & BYOK',
    bg: '#ede9fe',
    title: 'Ollama, LM Studio & Your Own Key',
    body: 'Run all directing, edits, and notes on your own computer with Ollama or LM Studio (0 credits, works offline in any browser) — or paste your own Google AI Studio Gemini key right in Settings.',
  },
  {
    num: '12',
    tag: 'CLOUD RUN',
    bg: '#ff8a5c',
    title: 'What You Preview Is What Exports',
    body: 'Cloud Run steps through the exact same HTML you see in the editor at 30 frames a second and mixes your video, animations, and audio into 1080p MP4 or transparent WebM (within 1.02% of preview).',
  },
] as const;

const FIREBASE_SEVEN = [
  ['Firebase AI Logic', 'Powers our default hybrid setup — trying Chrome Gemini Nano on your device first and seamlessly reaching cloud Gemini when needed'],
  ['App Check', 'Protects our AI calls, database, storage, and API routes with reCAPTCHA Enterprise and short-lived tokens so bots stay out'],
  ['Authentication', 'Google Sign-In and Email/Password with verified server checks on every credit spend, music track, and video export'],
  ['Cloud Firestore', 'Stores your projects, 200-step undo history, shared and personal director skills, usage stats, and server-verified credit balance'],
  ['Cloud Storage', 'Safely holds your uploaded clips, cleaned voice tracks, B-roll, generated soundtracks, finished exports, and share links'],
  ['Remote Config', 'Lets us tune model routing, credit prices, and emergency pauses live without redeploying the app'],
  ['App Hosting', 'Runs our Next.js 16 web app in production right alongside Cloud Run video rendering and Secret Manager'],
] as const;

const KIRO_SURFACES = [
  ['142 Kiro CLI runs', 'Every run is logged honestly in KIRO_LOG.md by our automated hook — real spec-driven engineering from day one'],
  ['49 EARS Specs & 21 Steering Docs', 'Clear requirements, designs, and task checklists in .kiro/specs/ backed by guardrails in .kiro/steering/ for motion, hybrid AI, and security'],
  ['3 Custom Scoped Agents', 'Dedicated motionpop-builder, motion-qa, and spec-reviewer agents (.kiro/agents/) with tight file and command permissions'],
  ['3 Automated Hooks', 'Loads context at session start, checks lint/types on edited files automatically, and logs finished work to KIRO_LOG.md'],
  ['3 Live MCP Servers', 'Connected to context7 (live docs), chrome-devtools (visual frame checks), and firebase-tools (.kiro/settings/mcp.json)'],
  ['Automated Quality Guards', '394 test files including 350 randomized Gemini Nano fuzz tests, strict schema guards, and credit-safety checks'],
  ['Antigravity + 8 Firebase Skills', 'Built with Antigravity plus 8 official Firebase Agent Skills and HyperFrames skills checked directly into the repo'],
] as const;

const MONOREPO_STITCHES = [
  ['apps/web', 'Next.js 16 · React 19 · Tailwind 4', 'The editor, Pip chat, local Whisper worker, auto-cutter, local Ollama/LM Studio & BYOK settings, and signed APIs'],
  ['packages/ai', 'Firebase AI Logic · Ollama/LM Studio · Zod', 'One clean AI router for 20+ tasks (11 Nano-ready), automatic repair loops, local OpenAI-compatible provider, Lyria 2 music, and BYOK'],
  ['packages/motion', 'Pure TypeScript · HyperFrames · Web Audio', 'Frame-accurate animation core (zero GSAP), 21 reel templates, 9 scenes, 11 studio looks, built-in SFX synth, and layout checker'],
  ['packages/schemas', 'Zod 4 · Strict TypeScript', 'Shared data contracts for projects, reels, director skills, timings in milliseconds, and credit pricing'],
  ['services/render', 'Cloud Run · HyperFrames · FFmpeg', '30 fps headless browser capture + video/audio mixing into 1080p MP4, transparent WebM, and thumbnails'],
  ['skills/ & .kiro/', 'Kiro · Antigravity · Firebase Agent Skills', 'Open-source Markdown playbooks, 8 Firebase Agent Skills, 49 specs, 21 steering docs, 3 custom agents, and hooks'],
] as const;

function LiveNanoProbe() {
  const availability = useAIStatusStore((s) => s.availability);
  const setupActive = useAIStatusStore((s) => s.setupActive);
  const progress = useAIStatusStore((s) => s.setupProgress);
  const setupError = useAIStatusStore((s) => s.setupError);
  const online = useAIStatusStore((s) => s.online);
  const { active: byokActive } = useByok();
  const { active: localLlmActive, model: localLlmModel } = useLocalLlm();
  const [probeBusy, setProbeBusy] = useState(false);
  const [probeOut, setProbeOut] = useState<{
    ranOn: string;
    latencyMs: number;
    json: string;
  } | null>(null);
  const [probeErr, setProbeErr] = useState<string | null>(null);

  useEffect(() => {
    void detectAvailability();
    return watchConnection();
  }, []);

  async function runLiveNanoTest() {
    setProbeBusy(true);
    setProbeErr(null);
    try {
      const router = await getRouterFor('nano');
      if (!router) throw new Error('On-device router unavailable in this build');
      const res = await router.run(
        recipeResolveTask,
        {
          recipeId: 'custom',
          recipeText: 'Fast-paced editorial explainer with bold numbers and crisp cuts',
          styleText: 'Warm paper background with terracotta accents',
          kind: 'video',
        },
        { allowCloud: false, mode: 'ONLY_ON_DEVICE' },
      );
      setProbeOut({
        ranOn: res.ranOn,
        latencyMs: res.latencyMs,
        json: JSON.stringify(res.output, null, 2),
      });
    } catch (err) {
      setProbeErr(err instanceof Error ? err.message : 'On-device test failed');
    } finally {
      setProbeBusy(false);
    }
  }

  const effectiveAvailability =
    availability === 'downloading' && !setupActive ? 'downloadable' : availability;

  const badge = localLlmActive
    ? { bg: '#3ddc97', label: `Local LLM READY (${localLlmModel})` }
    : effectiveAvailability === 'available'
      ? { bg: '#3ddc97', label: 'Gemini Nano READY in this browser' }
      : effectiveAvailability === 'downloadable'
        ? { bg: '#fde68a', label: 'Gemini Nano downloadable in this browser' }
        : effectiveAvailability === 'downloading'
          ? { bg: '#8dbceb', label: progressLabel(progress) }
          : effectiveAvailability === 'checking'
            ? { bg: '#e5e7eb', label: 'Checking your browser AI…' }
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
          {localLlmActive ? (
            <Server className="size-4" strokeWidth={2} aria-hidden />
          ) : availability === 'available' ? (
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
                  {localLlmActive
                    ? 'Offline (local LLM active)'
                    : 'Offline (built-in Chrome AI active)'}
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
            {localLlmActive
              ? 'Your local Ollama / LM Studio server is powering directing, edits, and notes right now at 0 credits — even offline.'
              : availability === 'available'
                ? 'Built-in Chrome AI is ready — quick edits, notes, and style picks run right on your laptop at 0 credits, even offline.'
                : 'Use Chrome 139+ for built-in Gemini Nano, connect Ollama / LM Studio in any browser, or let our cloud AI handle everything automatically.'}
          </p>
          {setupError && <p className="mt-0.5 text-[11px] font-medium text-flame">{setupError}</p>}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={probeBusy || effectiveAvailability !== 'available'}
          title={
            effectiveAvailability === 'available'
              ? 'Run a live on-device recipe.resolve call via Firebase AI Logic (0 credits)'
              : 'Open in Desktop Chrome 139+ with Gemini Nano enabled to run the live on-device test'
          }
          onClick={() => void runLiveNanoTest()}
          className={cn(
            btn(effectiveAvailability === 'available' ? 'flame' : 'paper', 'sm'),
            'disabled:cursor-not-allowed disabled:opacity-55',
          )}
        >
          <Zap className="size-3.5" strokeWidth={2} aria-hidden />
          {probeBusy
            ? 'Running Nano…'
            : effectiveAvailability === 'available'
              ? 'Test Gemini Nano'
              : 'Test Nano (Chrome 139+)'}
        </button>
        {effectiveAvailability === 'downloadable' && !localLlmActive && (
          <button type="button" onClick={() => void setUpOnDevice()} className={btn('flame', 'sm')}>
            <Download className="size-3.5" strokeWidth={2} aria-hidden />
            Set up Gemini Nano
          </button>
        )}
        {effectiveAvailability === 'downloading' && (
          <button type="button" onClick={() => cancelSetUp()} className={btn('paper', 'sm')}>
            Cancel
          </button>
        )}
        <Link href="/settings#local-llm" className={btn('paper', 'sm')}>
          <Server className="size-3.5" strokeWidth={2} aria-hidden />
          {localLlmActive ? 'Manage Local AI' : 'Connect Ollama'}
        </Link>
        <Link href="/settings#byok" className={btn('paper', 'sm')}>
          <KeyRound className="size-3.5" strokeWidth={2} aria-hidden />
          {byokActive ? 'Manage BYOK' : 'Optional BYOK'}
        </Link>
        <Link href="/start" className={btn('ink', 'sm')}>
          Try it now
          <ArrowRight className="size-3.5" strokeWidth={2} aria-hidden />
        </Link>
      </div>
      {(probeOut || probeErr) && (
        <div className="w-full border-t border-ink/20 pt-3">
          {probeErr ? (
            <p className="text-[11.5px] font-medium text-flame">{probeErr}</p>
          ) : (
            probeOut && (
              <div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                  <span className="rounded border border-ink bg-[#3ddc97] px-2 py-0.5">
                    inferenceSource: {probeOut.ranOn === 'device' ? 'on_device' : probeOut.ranOn}
                  </span>
                  <span className="rounded border border-ink bg-paper px-2 py-0.5 tabular-nums">
                    {probeOut.latencyMs} ms · 0 credits
                  </span>
                  <span className="text-black/60">
                    Live <code>recipe.resolve</code> output via Firebase AI Logic
                  </span>
                </div>
                <pre className="mt-2 max-h-40 overflow-auto rounded-lg border border-ink/25 bg-black p-2.5 font-mono text-[11px] leading-[1.45] text-[#a7f3d0]">
                  {probeOut.json}
                </pre>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Public `/how-it-works` route (spec 40 R5): clear, human, diagram-driven walkthrough of how
 * Motionpop works — covering on-device Chrome Gemini Nano, Ollama / LM Studio, BYOK, Firebase,
 * HyperFrames export parity, and Kiro engineering.
 */
export function HowItWorksPage() {
  const [routeFilter, setRouteFilter] = useState<'all' | 'local' | 'cloud'>('all');
  const recipeCount = builtInSkills.recipes().length;
  const reelStyleCount = builtInSkills.recipes().reduce((sum, r) => sum + r.styles.length, 0);
  const templateCount = ReelTemplateSchema.options.filter(
    (opt) => opt.shape.template.value !== 'none',
  ).length;
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
        {/* HERO — Clear, human, still genuinely impressive */}
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
                How Motionpop actually works.
              </h1>
              <p className="mt-3 max-w-[760px] text-[15px] leading-[1.6] text-black/80">
                Drop in a raw video, a voiceover, or just an idea. Motionpop transcribes every word
                right in your browser, cuts out awkward pauses and bad takes automatically, directs
                animated visuals around what you say, checks its own work, and exports a video that
                matches your preview frame for frame. We wired <strong>12 engines</strong> together
                so quick edits run free on your device (via <strong>Chrome Gemini Nano</strong> or
                your own <strong>Ollama / LM Studio</strong> models), while big creative lifts tap
                into <strong>Firebase AI Logic</strong> and cloud Gemini.
              </p>
            </div>
            <PipLoop
              name="juggle"
              className="hidden h-[176px] w-[176px] shrink-0 select-none md:block"
            />
          </div>

          <dl className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { n: '11', label: 'Free on-device AI tasks' },
              { n: '7', label: 'Firebase products' },
              { n: `${templateCount} + ${builtSceneCount}`, label: 'Reel & graphic templates' },
              { n: '142', label: 'Logged Kiro CLI runs' },
              { n: '49', label: 'Written Kiro specs' },
              { n: '≤ 1.02%', label: 'Preview vs export diff' },
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

        {/* SECTION 1: THE FRANKENSTEIN MONSTER (High-Level Architecture + 12 Plain-English Organs) */}
        <section id="frankenstein-monster" className="scroll-mt-24 border-b-2 border-ink py-12">
          <div id="frankenstein-stack" className="flex items-end justify-between gap-6">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-ink bg-[#8dbceb] px-2.5 py-0.5 text-[11px] font-semibold uppercase">
                <Wrench className="size-3.5" strokeWidth={2} aria-hidden />
                01 · The 12 Engines
              </span>
              <h2 className={cn(poster, 'mt-2.5 text-[clamp(38px,5vw,66px)]')}>
                The Frankenstein Monster — 12 stitched organs.
              </h2>
              <p className="mt-2 max-w-[700px] text-[14px] leading-[1.55] text-black/75">
                Instead of one giant black-box prompt, Motionpop connects 12 focused tools that each
                do one job really well — from local speech recognition and sound synthesis to
                sandboxed animations and cloud rendering.
              </p>
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
                <p className="mt-1.5 text-[12.5px] leading-[1.55] text-black/75">{o.body}</p>
              </article>
            ))}
          </div>

          <details className={cn(paper.frame, 'group mt-5 overflow-hidden')}>
            <summary className="flex cursor-pointer items-center justify-between gap-3 bg-mist/60 px-4 py-3 text-[12px] font-semibold select-none hover:bg-mist">
              <span>Want the codebase breakdown? See how the 6 folders fit together</span>
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
                <strong className="text-flame uppercase">What we intentionally left out:</strong> No
                GSAP (incompatible licence for open no-code editors), no Remotion, no third-party
                voice APIs (we use Gemini TTS), and zero stock sound-effect MP3s (every SFX is
                synthesized live in your browser).
              </p>
            </div>
          </details>
        </section>

        {/* SECTION 2: FREE LOCAL AI, HYBRID ROUTING, OLLAMA / LM STUDIO & BYOK */}
        <section id="on-device-nano" className="scroll-mt-24 border-b-2 border-ink py-12">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-ink bg-[#3ddc97] px-2.5 py-0.5 text-[11px] font-semibold uppercase">
              <Zap className="size-3.5" strokeWidth={2} aria-hidden />
              02 · Free Local &amp; Hybrid AI
            </span>
            <span className="text-[12px] text-black/60">
              Built-in Chrome AI · Ollama &amp; LM Studio · Cloud Gemini
            </span>
          </div>
          <h2 className={cn(poster, 'mt-2.5 text-[clamp(38px,5vw,66px)]')}>
            On-device Gemini Nano first. Cloud only when it counts.
          </h2>
          <p className="mt-2 max-w-[740px] text-[14px] leading-[1.6] text-black/75">
            Most video editors send every tiny click to an expensive cloud server. Motionpop flips
            that: small, fast jobs run right on your computer for <strong>0 credits</strong>, and
            cloud AI only steps in for heavy directing, voices, or custom artwork — unless you
            connect your own local Ollama / LM Studio model to run everything locally too.
          </p>

          <div className="mt-6">
            <HybridRouterDiagram />
          </div>

          {/* 3 Simple, scannable pillars */}
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className={cn(paper.frame, 'p-4')}>
              <span className="inline-block rounded border border-ink bg-[#3ddc97] px-2 py-0.5 text-[10px] font-semibold uppercase">
                11 Built-in Chrome AI Tasks (0 cr)
              </span>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[
                  'setup.recommend',
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
              <p className="mt-2.5 text-[12.5px] leading-[1.55] text-black/75">
                Circle a spot on a frame, ask Pip to tweak captions, or let Motionpop pick your best
                style from your transcript — it all runs privately inside Chrome with zero credits.
              </p>
            </div>

            <div className={cn(paper.frame, 'p-4')}>
              <span className="inline-block rounded border border-ink bg-[#fde68a] px-2 py-0.5 text-[10px] font-semibold uppercase">
                No Surprise Charges, Ever
              </span>
              <ul className="mt-2.5 space-y-2 text-[12.5px] leading-[1.55] text-black/80">
                <li>
                  • <strong>Built to fit small models:</strong> Every on-device prompt and response
                  shape is kept lean and tested automatically so Chrome&apos;s built-in model gives
                  clean, reliable answers.
                </li>
                <li>
                  • <strong>Free chips stay free:</strong> If a free on-device edit runs into
                  something too complex, it never quietly charges you — it tells you why and lets
                  you click <strong>Try in the cloud</strong> only if you want to.
                </li>
                <li>
                  • <strong>Right tool for speech:</strong> Local Whisper handles transcription in
                  your browser; cloud <code>{cfg.modelTts}</code> handles AI voiceovers.
                </li>
              </ul>
            </div>

            <div className={cn(paper.frame, 'p-4')}>
              <span className="inline-block rounded border border-ink bg-[#c4b5fd] px-2 py-0.5 text-[10px] font-semibold uppercase">
                Test It Offline in 30 Seconds
              </span>
              <ol className="mt-2.5 list-decimal space-y-1.5 pl-4 text-[12.5px] leading-[1.55] text-black/80">
                <li>
                  In Desktop Chrome 139+, turn on{' '}
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
                  Turn off your Wi-Fi (or toggle DevTools → Offline), circle something on your
                  video, and ask for a fix — it still works right on your laptop at 0 credits.
                </li>
              </ol>
            </div>
          </div>

          {/* Two clear zero-credit power-user options: Local LLM (Ollama / LM Studio) + Optional BYOK */}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div
              className={cn(
                paper.frame,
                'flex flex-col justify-between gap-3 bg-[#ecfdf5]/75 p-4',
              )}
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded border border-ink bg-[#3ddc97] px-2 py-0.5 text-[10px] font-semibold uppercase">
                    <Server className="size-3" strokeWidth={2} aria-hidden />
                    Ollama &amp; LM Studio · Full Local AI
                  </span>
                  <span className="text-[11px] font-semibold text-black/60">
                    Any browser · 0 credits · Works offline
                  </span>
                </div>
                <p className="mt-2 text-[12.5px] leading-[1.55] text-black/80">
                  Already running models like <code className="text-[11px]">qwen3:8b</code> or{' '}
                  <code className="text-[11px]">gemma3:12b</code> on your own computer? Connect{' '}
                  <strong>Ollama</strong> (<code className="text-[11px]">localhost:11434</code>),{' '}
                  <strong>LM Studio</strong> (<code className="text-[11px]">localhost:1234</code>),
                  or any OpenAI-compatible local server. Your browser talks straight to your machine
                  to run directing, edits, and notes locally — nothing leaves your laptop.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-black/65">
                  Auto-detects installed models + strips thinking tags + handles text-only models.
                </span>
                <Link href="/settings#local-llm" className={btn('ink', 'sm')}>
                  <Server className="size-3.5" strokeWidth={2} aria-hidden />
                  Connect Ollama / LM Studio
                </Link>
              </div>
            </div>

            <div
              className={cn(
                paper.frame,
                'flex flex-col justify-between gap-3 bg-[#ede9fe]/45 p-4',
              )}
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded border border-ink bg-[#ddd6fe] px-2 py-0.5 text-[10px] font-semibold uppercase">
                    <KeyRound className="size-3" strokeWidth={2} aria-hidden />
                    Optional Bring Your Own Key
                  </span>
                  <span className="text-[11px] font-semibold text-black/60">
                    Browser-only · 0 Motionpop credits
                  </span>
                </div>
                <p className="mt-2 text-[12.5px] leading-[1.55] text-black/80">
                  Prefer using your own Google AI Studio billing for cloud directing, AI voices, and
                  cutout images? Paste your Gemini API key in Settings. It stays strictly in your
                  browser (<code className="text-[11px]">localStorage</code>), goes straight to
                  Google, and still runs Chrome Nano first whenever it can.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-black/65">
                  Never sent to Motionpop servers. Pick any Gemini model on your key.
                </span>
                <Link href="/settings#byok" className={btn('paper', 'sm')}>
                  <KeyRound className="size-3.5" strokeWidth={2} aria-hidden />
                  Settings → BYOK
                </Link>
              </div>
            </div>
          </div>

          {/* Filterable Live Task Routing Table */}
          <div id="routing-matrix" className="mt-7 scroll-mt-24">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className={cn(poster, 'text-[30px]')}>
                  Where Every Task Runs &amp; What It Costs
                </h3>
                <p className="text-[12px] text-black/65">
                  With Ollama / LM Studio connected, every text &amp; directing task runs locally on
                  your machine for 0 credits.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter AI tasks">
                {(
                  [
                    ['all', `All (${ROUTING_ROWS.length})`],
                    [
                      'local',
                      `On-Device & Local (${ROUTING_ROWS.filter((r) => r.mode !== 'ONLY_IN_CLOUD').length})`,
                    ],
                    [
                      'cloud',
                      `Cloud (${ROUTING_ROWS.filter((r) => r.mode === 'ONLY_IN_CLOUD').length})`,
                    ],
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
                      <th className="px-3.5 py-2.5 font-semibold uppercase">What it does</th>
                      <th className="px-3.5 py-2.5 font-semibold uppercase">Runs on</th>
                      <th className="px-3.5 py-2.5 font-semibold uppercase">Engine / Model</th>
                      <th className="px-3.5 py-2.5 font-semibold uppercase">Cost</th>
                      <th className="px-3.5 py-2.5 font-semibold uppercase">Safety net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/15">
                    {visibleRows.map((row) => {
                      const m = MODE_STYLE[row.mode];
                      return (
                        <tr key={row.task} className="align-top hover:bg-mist/55">
                          <td className="px-3.5 py-2.5">
                            <code className="font-semibold">{row.task}</code>
                            <div className="mt-0.5 text-[11.5px] text-black/70">{row.job}</div>
                          </td>
                          <td className="px-3.5 py-2.5">
                            <span
                              className="inline-block rounded border border-ink px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap"
                              style={{ background: m.bg }}
                            >
                              {m.label}
                            </span>
                          </td>
                          <td className="px-3.5 py-2.5 text-[11.5px] text-black/85">{row.model}</td>
                          <td className="px-3.5 py-2.5 font-semibold whitespace-nowrap tabular-nums">
                            {row.cost}
                          </td>
                          <td className="px-3.5 py-2.5 text-[11.5px] text-black/75">
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

        {/* SECTION 3: END-TO-END PIPELINE & FRAME-EXACT EXPORT */}
        <section id="pipeline-engines" className="scroll-mt-24 border-b-2 border-ink py-12">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-ink bg-[#ff8a5c] px-2.5 py-0.5 text-[11px] font-semibold uppercase">
              <Film className="size-3.5" strokeWidth={2} aria-hidden />
              03 · Raw Clip to Finished Video
            </span>
          </div>
          <h2 className={cn(poster, 'mt-2.5 text-[clamp(38px,5vw,66px)]')}>
            Raw footage to frame-exact MP4 — zero drift.
          </h2>
          <p className="mt-2 max-w-[740px] text-[14px] leading-[1.6] text-black/75">
            The moment you drop a clip in, Motionpop starts transcribing and finding retakes in the
            background while you pick your style. Every animation is driven by exact timestamps in
            milliseconds — so the video you export looks identical to the preview you edited.
          </p>

          <div className="mt-6">
            <PipelineFlowDiagram />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <article className={cn(paper.frame, 'p-4')}>
              <div className="flex items-center justify-between gap-2">
                <h3 className={cn(poster, 'text-[28px]')}>Talking-Head Reel Engine</h3>
                <span className="rounded border border-ink bg-[#8dbceb]/60 px-2 py-0.5 text-[10px] font-semibold uppercase">
                  Vertical 9:16
                </span>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-[1.6] text-black/80">
                Built for creators talking to camera. Mixes{' '}
                <strong>{templateCount} visual templates</strong> (big headlines, lists, stat
                counters, charts, terminals, comparisons, quotes, logos, screenshots, and custom
                scenes) across <strong>5 stage layouts</strong>,{' '}
                <strong>
                  {recipeCount} recipes / {reelStyleCount} styles
                </strong>
                , and 5 kinetic caption styles.
              </p>
            </article>

            <article className={cn(paper.frame, 'p-4')}>
              <div className="flex items-center justify-between gap-2">
                <h3 className={cn(poster, 'text-[28px]')}>Motion Graphics &amp; Film Engine</h3>
                <span className="rounded border border-ink bg-[#fde68a]/80 px-2 py-0.5 text-[10px] font-semibold uppercase">
                  16:9 · 9:16 · 1:1
                </span>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-[1.6] text-black/80">
                Built for explainers, voiceovers, and standalone transparent overlays. Includes{' '}
                <strong>{builtSceneCount} responsive scenes</strong> (stats, timelines, maps,
                charts, versus cards, and photo callouts), <strong>11 curated studio looks</strong>,{' '}
                <strong>{slotSkillCount} graphic skills</strong>, and a multi-beat{' '}
                <strong>Film Mode</strong> that reviews its own screenshots to catch layout bugs.
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
              <div className="flex flex-1 flex-col gap-4 p-5 text-[12.5px] leading-[1.6]">
                <ul className="space-y-2">
                  {FIREBASE_SEVEN.map(([name, desc]) => (
                    <li key={name} className="text-black/80">
                      <strong className="text-ink">{name}:</strong> {desc}.
                    </li>
                  ))}
                </ul>
                <div className="mt-auto rounded-lg border-2 border-ink bg-[#eff6ff] p-3.5 text-[12px] text-black/85">
                  <strong>Why Desktop Chrome:</strong> Serious timeline editing belongs on a big
                  screen — and Desktop Chrome 139+ lets us run local Whisper transcription,
                  multimodal Gemini Nano, live audio synthesis, and 30 fps animations straight from
                  a single URL with zero install. Built with <strong>Antigravity</strong> and{' '}
                  <strong>8 official Firebase Agent Skills</strong>.
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
              <div className="flex flex-1 flex-col gap-4 p-5 text-[12.5px] leading-[1.6]">
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

        {/* SECTION 5: SECURITY, PRIVACY & CREDIT SAFETY */}
        <section id="security-credits" className="scroll-mt-24 pt-12">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-ink bg-black px-2.5 py-0.5 text-[11px] font-semibold text-paper uppercase">
              <ShieldCheck className="size-3.5 text-flame" strokeWidth={2} aria-hidden />
              05 · Privacy &amp; Safety
            </span>
          </div>
          <h2 className={cn(poster, 'mt-2.5 text-[clamp(36px,4.6vw,60px)]')}>
            Private by default. Honest about every credit.
          </h2>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              {
                icon: Lock,
                title: 'App Check protected',
                body: 'Every AI request, database write, and upload is verified by Firebase App Check so only the real app can call it.',
              },
              {
                icon: ShieldCheck,
                title: 'Tamper-proof credits',
                body: 'Your credit balance is updated only by verified server code — never trusted from the browser.',
              },
              {
                icon: RefreshCw,
                title: 'Clear prices & auto refunds',
                body: 'You always see the cost before you click. Free local buttons never bill you, and any failed cloud run refunds itself automatically.',
              },
              {
                icon: KeyRound,
                title: 'Zero-server BYOK safety',
                body: 'Both your optional Gemini key and your local Ollama / LM Studio address stay strictly in your browser — never sent to our servers.',
              },
              {
                icon: Terminal,
                title: 'Instant safety switches',
                body: 'Remote Config lets us adjust models, pricing, or pause cloud spending in seconds if anything unexpected happens.',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className={cn(paper.frame, 'p-4')}>
                  <span className="grid size-8 place-items-center rounded-lg border-2 border-ink bg-mist">
                    <Icon className="size-4" strokeWidth={2} aria-hidden />
                  </span>
                  <h3 className={cn(poster, 'mt-2.5 text-[22px]')}>{item.title}</h3>
                  <p className="mt-1 text-[12.5px] leading-[1.55] text-black/80">{item.body}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-12 overflow-hidden rounded-xl border-2 border-ink bg-black text-paper shadow-[5px_5px_0_#000]">
            <Sprockets className="opacity-35" />
            <div className="flex flex-wrap items-center justify-between gap-6 px-6 py-7 sm:px-8">
              <div>
                <h2 className={cn(poster, 'text-[clamp(34px,4.2vw,52px)]')}>
                  See it in action.
                </h2>
                <p className="mt-1.5 max-w-[540px] text-[13.5px] text-paper/75">
                  Drop in a talking-head clip, connect Ollama or LM Studio on your laptop, try a
                  sample project, or read every single line of code on GitHub.
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
