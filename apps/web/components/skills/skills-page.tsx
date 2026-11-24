'use client';

import type { UserSkill } from '@motionpop/schemas';
import {
  ArrowRight,
  Camera,
  Cloud,
  Database,
  ExternalLink,
  FileCode2,
  FolderGit2,
  Layers,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Volume2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PipLoop } from '@/components/landing/pip-loop';
import { AppBar } from '@/components/paper/app-bar';
import { btn, paper, PaperPage, poster } from '@/components/paper/kit';
import { cn } from '@/lib/cn';
import { reelDirectorSkills, slotSkills, type SlotSkillDetail } from '@/lib/skills/catalog';
import { useUserSkills } from '@/lib/skills/user-skills';
import { SkillImportModal } from './skill-import-modal';

type SkillFilter = 'all' | 'custom' | 'reel' | 'slot';

const ENERGY_BADGE: Readonly<Record<SlotSkillDetail['energy'], { label: string; bg: string }>> = {
  high: { label: 'High energy', bg: '#ff8a5c' },
  medium: { label: 'Medium energy', bg: '#8dbceb' },
  low: { label: 'Low energy', bg: '#a7f3d0' },
};

const SHOT_COLORS = ['#8dbceb', '#ff8a5c', '#fde68a', '#a7f3d0', '#ddd6fe'] as const;

/**
 * `/skills` (spec 40 R4): full registry view of every skill Motionpop ships today — 5 Reel
 * Director Skills (`skills/recipes/*.md`) and 8 Motion-Graphic Slot Skills (`skills/*.md`) —
 * plus honest documentation of where skills live and how to add more.
 */
export function SkillsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<SkillFilter>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserSkill | null>(null);
  const { skills: customSkills, cloudSynced, save, remove } = useUserSkills();
  const recipes = reelDirectorSkills();
  const slots = slotSkills();

  const showCustom = filter === 'all' || filter === 'custom';
  const showReels = filter === 'all' || filter === 'reel';
  const showSlots = filter === 'all' || filter === 'slot';

  const tabs: readonly { id: SkillFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All skills', count: customSkills.length + recipes.length + slots.length },
    { id: 'custom', label: 'Your skills', count: customSkills.length },
    { id: 'reel', label: 'Reel director skills', count: recipes.length },
    { id: 'slot', label: 'Motion-graphic slot skills', count: slots.length },
  ];

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (sk: UserSkill) => {
    setEditing(sk);
    setModalOpen(true);
  };

  return (
    <PaperPage>
      <AppBar active="skills" />
      <main className="mx-auto w-full max-w-[1240px] px-6 pt-14 pb-24 lg:px-10">
        <header className="border-b-2 border-ink pb-8">
          <div className="flex items-end justify-between gap-8">
            <div className="min-w-0 flex-1">
              <h1 className={cn(poster, 'text-[clamp(52px,6.5vw,96px)]')}>
                Director skills.
                <br />
                Every play in Pip&apos;s playbook.
              </h1>
              <p className="mt-4 max-w-[680px] text-[15px] leading-[1.65]">
                Instead of giant ad-hoc prompts, Motionpop directs scenes with structured Markdown
                skill specs: <strong>{recipes.length} Reel Director Skills</strong> that govern full
                talking-head recipes and <strong>{slots.length} Motion-Graphic Slot Skills</strong>{' '}
                that choreograph individual voiceover scenes down to exact percentage beat windows.
              </p>
            </div>
            <PipLoop
              name="sketch"
              className="hidden h-[176px] w-[198px] shrink-0 select-none md:block"
            />
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div role="tablist" aria-label="Skill category" className="flex flex-wrap gap-2">
              {tabs.map((tab) => {
                const active = filter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(tab.id)}
                    className={btn(active ? 'ink' : 'paper', 'sm')}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={cn(
                        'rounded px-1.5 py-px text-[11px] tabular-nums',
                        active ? 'bg-paper/20 text-paper' : 'bg-black/8 text-black/70',
                      )}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={openCreate} className={btn('flame', 'sm')}>
              <Plus className="size-4" strokeWidth={2.2} aria-hidden />
              Import / Create skill
            </button>
          </div>
        </header>

        {/* Where skills live + How to add one */}
        <section
          aria-labelledby="skills-storage-title"
          className={cn(paper.frame, paper.raised, 'mt-8 overflow-hidden')}
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-ink bg-[#fde68a]/55 px-5 py-4 sm:px-7">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-lg border-2 border-ink bg-paper">
                <Database className="size-4" strokeWidth={2} aria-hidden />
              </span>
              <div>
                <h2 id="skills-storage-title" className={cn(poster, 'text-[28px]')}>
                  Where skills live &amp; how to add more
                </h2>
                <p className="text-[12px] text-black/75">
                  Built-in skills ship in <code className="font-semibold">@motionpop/ai</code>; your
                  imported &amp; custom <code className="font-semibold">SKILL.md</code> skills save
                  to Firestore (<code className="font-semibold">users/&#123;uid&#125;/skills</code>)
                  + browser cache.
                </p>
              </div>
            </div>
            <Link href="/how-it-works#skills-kiro" className={btn('paper', 'sm')}>
              See architecture
              <ArrowRight className="size-3.5" strokeWidth={2} aria-hidden />
            </Link>
          </div>

          <div className="grid gap-6 px-5 py-5 text-[13px] leading-[1.6] sm:px-7 lg:grid-cols-2">
            <div className="rounded-xl border-2 border-ink bg-mist/40 p-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-black/60 uppercase">
                <FolderGit2 className="size-3.5" strokeWidth={2} aria-hidden />
                1. Add a Reel Director Skill (Recipe)
              </div>
              <ol className="mt-2.5 list-decimal space-y-1.5 pl-5 text-[12px] text-black/80">
                <li>
                  Add <code className="rounded bg-black/6 px-1">skills/recipes/&lt;id&gt;.md</code>{' '}
                  with YAML frontmatter (
                  <code className="text-[11px]">id, name, kind: recipe, scene_ms, styles</code>).
                </li>
                <li>
                  Add the recipe id to{' '}
                  <code className="rounded bg-black/6 px-1">RecipeIdSchema</code> in{' '}
                  <code className="text-[11px]">packages/schemas/src/edit-config.ts</code>.
                </li>
                <li>
                  Add the matching <code className="text-[11px]">DirectorSkill</code> entry in{' '}
                  <code className="rounded bg-black/6 px-1">packages/ai/src/skills/recipes.ts</code>
                  .
                </li>
                <li>
                  Run{' '}
                  <code className="rounded bg-black/6 px-1">pnpm --filter @motionpop/ai test</code>{' '}
                  — <code className="text-[11px]">registry.test.ts</code> verifies 1:1 sync with the
                  Markdown file.
                </li>
              </ol>
            </div>

            <div className="rounded-xl border-2 border-ink bg-mist/40 p-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-black/60 uppercase">
                <FileCode2 className="size-3.5" strokeWidth={2} aria-hidden />
                2. Add a Motion-Graphic Slot Skill
              </div>
              <ol className="mt-2.5 list-decimal space-y-1.5 pl-5 text-[12px] text-black/80">
                <li>
                  Add <code className="rounded bg-black/6 px-1">skills/&lt;id&gt;.md</code>{' '}
                  following{' '}
                  <code className="text-[11px]">.kiro/steering/director-skill-format.md</code>.
                </li>
                <li>
                  Register its <code className="text-[11px]">useWhen</code>,{' '}
                  <code className="text-[11px]">worksWith</code> and{' '}
                  <code className="text-[11px]">defaultDurationMs</code> in{' '}
                  <code className="rounded bg-black/6 px-1">
                    packages/ai/src/slots/catalogue.ts
                  </code>
                  .
                </li>
                <li>
                  Run{' '}
                  <code className="rounded bg-black/6 px-1">
                    pnpm --filter @motionpop/ai skills:build
                  </code>{' '}
                  to regenerate <code className="text-[11px]">slot-sequences.ts</code> for{' '}
                  <code className="text-[11px]">component.fill</code>.
                </li>
                <li>
                  Instant option: click <strong>Import / Create skill</strong> above to save any
                  custom <code className="text-[11px]">SKILL.md</code> straight to Firestore{' '}
                  <code className="text-[11px]">users/&#123;uid&#125;/skills</code> without a
                  deploy.
                </li>
              </ol>
            </div>
          </div>
        </section>

        {/* Your custom / imported skills (Firestore + localStorage) */}
        {showCustom && (customSkills.length > 0 || filter === 'custom') && (
          <section aria-labelledby="custom-skills-heading" className="mt-12">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-3">
              <div>
                <h2 id="custom-skills-heading" className={cn(poster, 'text-[36px]')}>
                  Your custom skills ({customSkills.length})
                </h2>
                <p className="mt-1 text-[13px] text-black/65">
                  Imported <code className="text-[12px]">SKILL.md</code> specs stored in{' '}
                  {cloudSynced ? 'Firestore (synced to your account)' : 'this browser'} — selectable
                  right inside <code className="text-[12px]">/start/configure</code>.
                </p>
              </div>
              <button type="button" onClick={openCreate} className={btn('ink', 'sm')}>
                <Plus className="size-3.5" strokeWidth={2} aria-hidden />
                Import SKILL.md
              </button>
            </div>

            {customSkills.length === 0 ? (
              <div
                className={cn(
                  paper.frame,
                  'mt-6 flex flex-wrap items-center justify-between gap-4 p-6',
                )}
              >
                <div>
                  <p className="text-[14px] font-semibold">No custom skills imported yet</p>
                  <p className="mt-1 text-[13px] text-black/65">
                    Paste any <code className="text-[12px]">SKILL.md</code>, upload a{' '}
                    <code className="text-[12px]">.md</code> file, or import from a GitHub repo URL
                    to direct videos in your own style.
                  </p>
                </div>
                <button type="button" onClick={openCreate} className={btn('flame', 'sm')}>
                  <Plus className="size-3.5" strokeWidth={2} aria-hidden />
                  Import your first skill
                </button>
              </div>
            ) : (
              <div className="mt-6 grid gap-5 md:grid-cols-2">
                {customSkills.map((sk) => (
                  <article
                    key={sk.id}
                    data-testid={`user-skill-${sk.id}`}
                    className={cn(paper.frame, paper.raised, 'flex flex-col justify-between p-5')}
                  >
                    <div>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="size-5 shrink-0 rounded-md border-2 border-ink"
                            style={{ background: sk.accent }}
                            aria-hidden
                          />
                          <h3 className={cn(poster, 'text-[28px] leading-none')}>{sk.name}</h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded border border-ink bg-[#d1fae5] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase">
                            {sk.target === 'both'
                              ? 'Reels + Film'
                              : sk.target === 'reel'
                                ? 'Reel only'
                                : 'Film only'}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded border border-ink bg-paper px-1.5 py-0.5 font-mono text-[10px]">
                            <Cloud className="size-2.5" aria-hidden />
                            {cloudSynced ? 'DB synced' : 'Local'}
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 text-[13px] leading-[1.55] text-black/75">{sk.blurb}</p>
                      <pre className="mt-3 max-h-[110px] overflow-hidden rounded-lg border border-ink/20 bg-mist/60 p-2.5 font-mono text-[11px] leading-[1.45] whitespace-pre-wrap text-black/75">
                        {sk.markdown.slice(0, 280)}
                        {sk.markdown.length > 280 ? '…' : ''}
                      </pre>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-black/15 pt-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => router.push(`/start?skill=${encodeURIComponent(sk.id)}`)}
                          className={btn('flame', 'sm')}
                        >
                          Use in new video
                          <ArrowRight className="size-3.5" strokeWidth={2} aria-hidden />
                        </button>
                        {sk.sourceUrl && (
                          <a
                            href={sk.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-medium underline underline-offset-4 hover:text-flame"
                          >
                            Source
                            <ExternalLink className="size-3" aria-hidden />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(sk)}
                          aria-label={`Edit ${sk.name}`}
                          className={btn('paper', 'sm')}
                        >
                          <Pencil className="size-3" strokeWidth={2} aria-hidden />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(sk.id)}
                          aria-label={`Delete ${sk.name}`}
                          className="inline-flex h-8 items-center justify-center rounded-lg border-2 border-ink bg-paper px-2 text-black/70 hover:bg-[#fee2e2] hover:text-error"
                        >
                          <Trash2 className="size-3.5" strokeWidth={2} aria-hidden />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Section A: Reel Director Skills */}
        {showReels && (
          <section aria-labelledby="skills-reel-heading" className="mt-12">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <span className="rounded-md border-2 border-ink bg-[#8dbceb] px-2 py-0.5 text-[11px] font-semibold uppercase">
                  skills/recipes/*.md · Reel Engine v3
                </span>
                <h2
                  id="skills-reel-heading"
                  className={cn(poster, 'mt-3 text-[clamp(38px,4.5vw,56px)]')}
                >
                  Reel director skills ({recipes.length})
                </h2>
                <p className="mt-2 max-w-[660px] text-[14px] leading-[1.6] text-black/75">
                  Loaded by <code className="text-[12px]">builtInSkills.recipe(id)</code> and
                  compiled into the <code className="text-[12px]">RECIPE</code> brief injected into{' '}
                  <code className="text-[12px]">reel.direct</code>.
                </p>
              </div>
              <Link href="/recipes" className={btn('paper', 'sm')}>
                Open full recipes view
              </Link>
            </div>

            <div className="mt-7 grid gap-6 md:grid-cols-2">
              {recipes.map((r) => (
                <article
                  key={r.id}
                  id={`recipe-${r.id}`}
                  className={cn(paper.frame, paper.press, 'scroll-mt-24 flex flex-col p-5')}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <span className="inline-block rounded border border-ink bg-[#8dbceb]/45 px-1.5 py-px text-[11px] font-semibold">
                        skills/recipes/{r.id}.md
                      </span>
                      <h3 className={cn(poster, 'mt-2 text-[34px]')}>{r.name}</h3>
                    </div>
                    <span className="rounded-md border-2 border-ink bg-paper px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                      {(r.sceneMs.min / 1000).toFixed(1)}–{(r.sceneMs.max / 1000).toFixed(1)}s /
                      scene
                    </span>
                  </div>
                  <p className="mt-2 text-[13px] font-semibold">{r.blurb}</p>
                  <p className="mt-2 text-[12px] leading-[1.6] text-black/75">{r.visualGrammar}</p>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {r.preferredTemplates.map((t) => (
                      <span
                        key={t}
                        className="rounded-md border border-ink bg-mist px-1.5 py-px text-[11px]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t-2 border-ink pt-3 text-[12px]">
                    <span className="text-black/65 tabular-nums">
                      split {Math.round(r.layoutMix.split * 100)}% · speaker{' '}
                      {Math.round(r.layoutMix.speaker * 100)}% · full{' '}
                      {Math.round(r.layoutMix.full * 100)}% · card{' '}
                      {Math.round(r.layoutMix.card * 100)}%
                    </span>
                    <Link href={`/recipes#${r.id}`} className={paper.link}>
                      Full recipe →
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Section B: Motion-Graphic Slot Skills */}
        {showSlots && (
          <section
            aria-labelledby="skills-slot-heading"
            className={cn(showReels ? 'mt-16 border-t-2 border-ink pt-12' : 'mt-12')}
          >
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <span className="rounded-md border-2 border-ink bg-[#ff8a5c] px-2 py-0.5 text-[11px] font-semibold uppercase">
                  skills/*.md · Voiceover &amp; Scene Engine
                </span>
                <h2
                  id="skills-slot-heading"
                  className={cn(poster, 'mt-3 text-[clamp(38px,4.5vw,56px)]')}
                >
                  Motion-graphic slot skills ({slots.length})
                </h2>
                <p className="mt-2 max-w-[680px] text-[14px] leading-[1.6] text-black/75">
                  Chosen per moment by <code className="text-[12px]">slots.detect</code>; their
                  percentage shot sequence is compiled into{' '}
                  <code className="text-[12px]">SLOT_SEQUENCES</code> and fed into{' '}
                  <code className="text-[12px]">component.fill</code> so every graphic lands on the
                  spoken key word.
                </p>
              </div>
            </div>

            <div className="mt-7 grid gap-7 lg:grid-cols-2">
              {slots.map((sk) => {
                const energy = ENERGY_BADGE[sk.energy];
                return (
                  <article
                    key={sk.id}
                    id={`slot-${sk.id}`}
                    className={cn(paper.frame, paper.raised, 'scroll-mt-24 overflow-hidden')}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-ink bg-mist/55 px-5 py-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded border border-ink bg-paper px-1.5 py-px text-[11px] font-medium">
                            {sk.filePath}
                          </span>
                          <span
                            className="rounded border border-ink px-1.5 py-px text-[11px] font-semibold"
                            style={{ background: energy.bg }}
                          >
                            {energy.label}
                          </span>
                          <span className="rounded border border-ink bg-paper px-1.5 py-px text-[11px] tabular-nums">
                            default {(sk.defaultDurationMs / 1000).toFixed(0)}s
                          </span>
                        </div>
                        <h3 className={cn(poster, 'mt-2 text-[34px]')}>{sk.name}</h3>
                        <p className="mt-1 text-[13px] font-semibold text-black/85">{sk.intent}</p>
                      </div>
                    </div>

                    <div className="space-y-4 px-5 py-5 text-[12px] leading-[1.6]">
                      <div>
                        <div className="text-[10px] font-semibold tracking-[0.08em] text-black/55 uppercase">
                          Use when
                        </div>
                        <p className="mt-1 text-[13px]">{sk.useWhen}</p>
                      </div>

                      <div>
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.08em] text-black/55 uppercase">
                          <Layers className="size-3" strokeWidth={2} aria-hidden />
                          Works with scenes
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {sk.scenes.map((sc) => (
                            <span
                              key={sc.id}
                              className="rounded-md border-2 border-ink bg-paper px-2 py-0.5 text-[11px] font-semibold"
                            >
                              {sc.name} <span className="font-normal text-black/55">({sc.id})</span>
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Share of duration bar */}
                      <div>
                        <div className="text-[10px] font-semibold tracking-[0.08em] text-black/55 uppercase">
                          Shot sequence · share of duration
                        </div>
                        <div
                          className="mt-2 flex h-6 w-full overflow-hidden rounded-md border-2 border-ink"
                          aria-label={`${sk.name} shot sequence bar`}
                        >
                          {sk.shots.map((seg, i) => (
                            <div
                              key={seg.rangeLabel}
                              style={{
                                width: `${seg.endPct - seg.startPct}%`,
                                background: SHOT_COLORS[i % SHOT_COLORS.length],
                              }}
                              className="flex items-center justify-center border-r-2 border-ink px-1 text-[10px] font-semibold last:border-r-0 tabular-nums"
                              title={`${seg.rangeLabel}: ${seg.action}`}
                            >
                              {seg.endPct - seg.startPct >= 15 ? seg.rangeLabel : ''}
                            </div>
                          ))}
                        </div>
                        <ol className="mt-2.5 space-y-1">
                          {sk.shots.map((seg, i) => (
                            <li key={seg.rangeLabel} className="flex items-start gap-2">
                              <span
                                aria-hidden
                                className="mt-1.5 size-2.5 shrink-0 rounded-xs border border-ink"
                                style={{ background: SHOT_COLORS[i % SHOT_COLORS.length] }}
                              />
                              <span>
                                <strong className="tabular-nums">{seg.rangeLabel}:</strong>{' '}
                                {seg.action}
                              </span>
                            </li>
                          ))}
                        </ol>
                      </div>

                      <div className="grid gap-3 border-t-2 border-ink pt-3 sm:grid-cols-2">
                        <div>
                          <div className="flex items-center gap-1 text-[10px] font-semibold tracking-[0.08em] text-black/55 uppercase">
                            <Camera className="size-3" strokeWidth={2} aria-hidden />
                            Camera
                          </div>
                          <p className="mt-1 text-black/80">{sk.camera}</p>
                        </div>
                        <div>
                          <div className="flex items-center gap-1 text-[10px] font-semibold tracking-[0.08em] text-black/55 uppercase">
                            <Sparkles className="size-3" strokeWidth={2} aria-hidden />
                            Emphasis
                          </div>
                          <p className="mt-1 text-black/80">{sk.emphasis}</p>
                        </div>
                        <div>
                          <div className="flex items-center gap-1 text-[10px] font-semibold tracking-[0.08em] text-black/55 uppercase">
                            <Volume2 className="size-3" strokeWidth={2} aria-hidden />
                            Sound cues
                          </div>
                          <p className="mt-1 text-black/80">{sk.soundCues}</p>
                        </div>
                        <div>
                          <div className="text-[10px] font-semibold tracking-[0.08em] text-black/55 uppercase">
                            Voice sync
                          </div>
                          <p className="mt-1 text-black/80">{sk.voiceSync}</p>
                        </div>
                      </div>

                      <div className="rounded-lg border-2 border-ink bg-mist/40 p-3">
                        <div className="text-[10px] font-semibold tracking-[0.08em] text-black/55 uppercase">
                          Rules &amp; anti-patterns
                        </div>
                        <ul className="mt-1 space-y-0.5 text-black/80">
                          {sk.rules.map((rule) => (
                            <li key={rule}>• {rule}</li>
                          ))}
                        </ul>
                        <p className="mt-1.5 text-black/65">
                          <strong>Avoid:</strong> {sk.antiPatterns}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </main>
      <SkillImportModal
        key={editing?.id ?? (modalOpen ? 'new' : 'closed')}
        open={modalOpen}
        editing={editing}
        cloudSynced={cloudSynced}
        onClose={() => setModalOpen(false)}
        onSave={async (sk) => {
          await save(sk);
        }}
      />
    </PaperPage>
  );
}
