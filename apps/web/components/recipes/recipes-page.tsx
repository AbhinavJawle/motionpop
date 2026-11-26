'use client';

import type { DirectorSkill } from '@motionpop/ai';
import type { ReelLayout } from '@motionpop/schemas';
import { ArrowRight, Ban, BookOpen, Cpu, Music2, Sparkles, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RecipeArt } from '@/components/configure/art';
import { PipLoop } from '@/components/landing/pip-loop';
import { AppBar } from '@/components/paper/app-bar';
import { btn, paper, PaperPage, poster } from '@/components/paper/kit';
import { cn } from '@/lib/cn';
import { pairedSlotSkillsFor, reelDirectorSkills } from '@/lib/skills/catalog';

const LAYOUT_ORDER: readonly { key: Exclude<ReelLayout, 'pip'>; label: string; color: string }[] = [
  { key: 'split', label: 'Split', color: '#8dbceb' },
  { key: 'speaker', label: 'Speaker', color: '#a7f3d0' },
  { key: 'full', label: 'Full', color: '#ff8a5c' },
  { key: 'card', label: 'Card', color: '#fde68a' },
];

const HOOK_LABELS: Readonly<Record<DirectorSkill['defaults']['hookStyle'], string>> = {
  headline: 'Bold headline',
  stat: 'Big stat',
  visual: 'Visual slam',
  'cold-open': 'Clean cold open',
};

const fmtSec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * `/recipes` (spec 40 R3): every built-in director recipe in detail, including the exact director
 * skill file (`skills/recipes/<id>.md`), layout mix, preferred templates, soundtrack brief,
 * banned tropes, curated reel styles, paired voiceover slot skills, and custom on-device mode.
 */
export function RecipesPage() {
  const router = useRouter();
  const recipes = reelDirectorSkills();
  const totalStyles = recipes.reduce((acc, r) => acc + r.styles.length, 0);

  return (
    <PaperPage>
      <AppBar active="recipes" />
      <main className="mx-auto w-full max-w-[1240px] px-6 pt-14 pb-24 lg:px-10">
        <header className="flex items-end justify-between gap-8 border-b-2 border-ink pb-8">
          <div className="min-w-0 flex-1">
            <h1 className={cn(poster, 'text-[clamp(52px,6.5vw,96px)]')}>
              {recipes.length} recipes.
              <br />
              One director skill each.
            </h1>
            <p className="mt-4 max-w-[680px] text-[15px] leading-[1.65]">
              A recipe tells Pip how to cut, frame, pace, score and design a video before a single
              scene is built. Every built-in recipe is backed by its own{' '}
              <strong>Reel Director Skill</strong> in the codebase registry and paired with curated
              reel styles and motion-graphic slot skills.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <span className="rounded-lg border-2 border-ink bg-paper px-3 py-1.5 text-[12px] font-semibold shadow-[3px_3px_0_#000] tabular-nums">
                {recipes.length} built-in recipes
              </span>
              <span className="rounded-lg border-2 border-ink bg-[#8dbceb] px-3 py-1.5 text-[12px] font-semibold shadow-[3px_3px_0_#000] tabular-nums">
                {totalStyles} reel styles
              </span>
              <span className="rounded-lg border-2 border-ink bg-[#a7f3d0] px-3 py-1.5 text-[12px] font-semibold shadow-[3px_3px_0_#000]">
                +1 custom on-device
              </span>
            </div>
          </div>
          <PipLoop
            name="craft"
            className="hidden h-[188px] w-[154px] shrink-0 select-none md:block"
          />
        </header>

        {/* Honest registry note */}
        <section
          aria-label="How recipes connect to the skills registry"
          className={cn(
            paper.frame,
            'mt-8 flex flex-wrap items-center justify-between gap-5 px-5 py-4',
          )}
        >
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border-2 border-ink bg-[#8dbceb]">
              <BookOpen className="size-4" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0 text-[13px] leading-[1.6]">
              <p className="font-semibold">
                Built-in skills + your imported{' '}
                <code className="rounded bg-black/6 px-1.5 py-0.5 text-[12px]">SKILL.md</code>{' '}
                skills
              </p>
              <p className="mt-1 text-black/70">
                Built-in recipes, 16 open-source director skills, and any custom{' '}
                <code className="text-[12px]">SKILL.md</code> you import on{' '}
                <Link href="/skills" className={paper.link}>
                  /skills
                </Link>{' '}
                sync to your account and guide pacing, layout, and motion craft across every video
                and standalone graphic.
              </p>
            </div>
          </div>
          <Link href="/skills" className={btn('paper', 'sm')}>
            Inspect all skills
            <ArrowRight className="size-3.5" strokeWidth={2} aria-hidden />
          </Link>
        </section>

        {/* Jump pills */}
        <nav aria-label="Jump to recipe" className="mt-8 flex flex-wrap gap-2">
          {recipes.map((r) => (
            <a
              key={r.id}
              href={`#${r.id}`}
              className="rounded-lg border-2 border-ink bg-paper px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-[#8dbceb]"
            >
              {r.name}
            </a>
          ))}
          <a
            href="#custom"
            className="rounded-lg border-2 border-dashed border-ink bg-paper px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-[#a7f3d0]"
          >
            Describe your own (custom)
          </a>
        </nav>

        {/* Detailed recipe cards */}
        <div className="mt-8 flex flex-col gap-10">
          {recipes.map((recipe) => {
            const pairedSlots = pairedSlotSkillsFor(recipe.id);
            return (
              <article
                key={recipe.id}
                id={recipe.id}
                className={cn(paper.frame, paper.raised, 'scroll-mt-24 overflow-hidden')}
              >
                {/* Header strip */}
                <div className="flex flex-wrap items-center justify-between gap-5 border-b-2 border-ink bg-mist/60 px-5 py-5 sm:px-7">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="size-16 shrink-0 overflow-hidden rounded-xl border-2 border-ink shadow-[2px_2px_0_#000]">
                      <RecipeArt recipe={recipe.id} swatch={recipe.styles[0]?.swatch} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className={cn(poster, 'text-[clamp(34px,4vw,48px)]')}>{recipe.name}</h2>
                        <Link
                          href={`/skills#recipe-${recipe.id}`}
                          className="rounded-md border-2 border-ink bg-paper px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-[#8dbceb]"
                        >
                          skills/recipes/{recipe.id}.md
                        </Link>
                      </div>
                      <p className="mt-1 text-[14px] text-black/80">{recipe.blurb}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(`/start?recipe=${encodeURIComponent(recipe.id)}`)}
                    className={btn('ink', 'md')}
                  >
                    Use this recipe
                    <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
                  </button>
                </div>

                {/* Spec strip */}
                <div className="grid grid-cols-2 gap-3 border-b-2 border-ink bg-paper px-5 py-4 text-[12px] sm:grid-cols-5 sm:px-7">
                  <div>
                    <div className="text-[10px] tracking-[0.08em] text-black/55 uppercase">
                      Scene pacing
                    </div>
                    <div className="mt-1 font-semibold tabular-nums">
                      {fmtSec(recipe.sceneMs.min)} – {fmtSec(recipe.sceneMs.max)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] tracking-[0.08em] text-black/55 uppercase">
                      Default hook
                    </div>
                    <div className="mt-1 font-semibold">
                      {HOOK_LABELS[recipe.defaults.hookStyle]}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] tracking-[0.08em] text-black/55 uppercase">
                      SFX density
                    </div>
                    <div className="mt-1 font-semibold capitalize">{recipe.sfxDensity}</div>
                  </div>
                  <div>
                    <div className="text-[10px] tracking-[0.08em] text-black/55 uppercase">
                      Closing CTA
                    </div>
                    <div className="mt-1 font-semibold">
                      {recipe.defaults.ctaEnabled ? 'Enabled by default' : 'Off by default'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] tracking-[0.08em] text-black/55 uppercase">
                      Voiceover look
                    </div>
                    <Link
                      href={`/start?style=${encodeURIComponent(recipe.defaults.voiceoverLook)}`}
                      className={cn(paper.link, 'mt-1 inline-block text-[12px] font-semibold')}
                    >
                      {recipe.defaults.voiceoverLook}
                    </Link>
                  </div>
                </div>

                {/* Body */}
                <div className="grid gap-8 px-5 py-6 sm:px-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                  {/* Left: Direction & grammar */}
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-[11px] font-semibold tracking-[0.08em] text-black/60 uppercase">
                        Runtime layout mix (target share)
                      </h3>
                      <div
                        className="mt-2.5 flex h-7 w-full overflow-hidden rounded-lg border-2 border-ink"
                        aria-label="Target layout mix"
                      >
                        {LAYOUT_ORDER.map(({ key, label, color }) => {
                          const share = recipe.layoutMix[key];
                          if (!share) return null;
                          return (
                            <div
                              key={key}
                              style={{ width: `${share * 100}%`, background: color }}
                              className="flex items-center justify-center border-r-2 border-ink px-1 text-[11px] font-semibold text-ink last:border-r-0 tabular-nums"
                              title={`${label}: ${fmtPct(share)}`}
                            >
                              {share >= 0.15 ? `${label} ${fmtPct(share)}` : fmtPct(share)}
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-black/70 tabular-nums">
                        {LAYOUT_ORDER.map(({ key, label, color }) => (
                          <span key={key} className="inline-flex items-center gap-1.5">
                            <span
                              aria-hidden
                              className="size-2.5 rounded-xs border border-ink"
                              style={{ background: color }}
                            />
                            {label} {fmtPct(recipe.layoutMix[key])}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-xl border-2 border-ink bg-mist/40 p-4">
                        <h3 className="text-[11px] font-semibold tracking-[0.08em] text-black/60 uppercase">
                          Hook pattern
                        </h3>
                        <p className="mt-2 text-[13px] leading-[1.6]">{recipe.hookPattern}</p>
                      </div>
                      <div className="rounded-xl border-2 border-ink bg-mist/40 p-4">
                        <h3 className="text-[11px] font-semibold tracking-[0.08em] text-black/60 uppercase">
                          Visual grammar
                        </h3>
                        <p className="mt-2 text-[13px] leading-[1.6]">{recipe.visualGrammar}</p>
                      </div>
                    </div>

                    <div className="rounded-xl border-2 border-ink bg-paper p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] text-black/60 uppercase">
                          <Music2 className="size-3.5" strokeWidth={2} aria-hidden />
                          Soundtrack brief (lyria-002)
                        </h3>
                        <span className="rounded border border-ink bg-mist px-1.5 py-px text-[11px]">
                          auto mood: {recipe.defaults.music}
                        </span>
                      </div>
                      <p className="mt-2 text-[13px] leading-[1.6] text-black/80">
                        “{recipe.musicBrief}”
                      </p>
                    </div>
                  </div>

                  {/* Right: Templates, Guardrails, Styles, Skills */}
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-[11px] font-semibold tracking-[0.08em] text-black/60 uppercase">
                        Preferred reel templates ({recipe.preferredTemplates.length})
                      </h3>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {recipe.preferredTemplates.map((tpl) => (
                          <span
                            key={tpl}
                            className="rounded-md border-2 border-ink bg-[#8dbceb]/35 px-2 py-0.5 text-[12px] font-medium"
                          >
                            {tpl}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] text-black/60 uppercase">
                        <Ban className="size-3.5 text-flame" strokeWidth={2} aria-hidden />
                        Banned tropes (director guardrails)
                      </h3>
                      <ul className="mt-2 space-y-1 text-[12px] text-black/75">
                        {recipe.bannedTropes.map((trope) => (
                          <li key={trope} className="flex items-start gap-2">
                            <span
                              aria-hidden
                              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-flame"
                            />
                            <span>{trope}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-[11px] font-semibold tracking-[0.08em] text-black/60 uppercase">
                        Curated reel styles ({recipe.styles.length})
                      </h3>
                      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
                        {recipe.styles.map((st) => (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() =>
                              router.push(
                                `/start?recipe=${encodeURIComponent(recipe.id)}&style=${encodeURIComponent(st.id)}`,
                              )
                            }
                            className="flex items-center justify-between gap-3 rounded-lg border-2 border-ink bg-paper px-3 py-2 text-left transition-transform hover:-translate-y-0.5 hover:shadow-[3px_3px_0_#000]"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-[13px] font-semibold">{st.name}</div>
                              <div className="text-[11px] text-black/60">
                                {st.look} · {st.captionStyle} captions
                              </div>
                            </div>
                            <span className="flex shrink-0 gap-1" aria-hidden>
                              {st.swatch.map((hex, i) => (
                                <span
                                  key={i}
                                  className="size-3.5 rounded-full border border-ink"
                                  style={{ background: hex }}
                                />
                              ))}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Linked skills */}
                    <div className="rounded-xl border-2 border-ink bg-mist/45 p-4">
                      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] text-black/60 uppercase">
                        <Sparkles className="size-3.5" strokeWidth={2} aria-hidden />
                        Skills used from registry
                      </h3>
                      <div className="mt-2.5 space-y-2.5 text-[12px]">
                        <div>
                          <span className="text-black/60">Reel director skill: </span>
                          <Link
                            href={`/skills#recipe-${recipe.id}`}
                            className="inline-flex items-center rounded-md border-2 border-ink bg-[#8dbceb] px-2 py-0.5 font-semibold transition-colors hover:bg-flame"
                          >
                            {recipe.id}
                          </Link>
                        </div>
                        <div>
                          <div className="text-black/60">
                            Paired motion-graphic slot skills (voiceover &amp; scenes):
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {pairedSlots.map((sk) => (
                              <Link
                                key={sk.id}
                                href={`/skills#slot-${sk.id}`}
                                className="rounded-md border-2 border-ink bg-paper px-2 py-0.5 font-medium transition-colors hover:bg-[#fde68a]"
                                title={sk.useWhen}
                              >
                                {sk.name}
                              </Link>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}

          {/* Custom recipe card */}
          <article
            id="custom"
            className={cn(paper.frame, paper.raised, 'scroll-mt-24 overflow-hidden')}
          >
            <div className="flex flex-wrap items-center justify-between gap-5 border-b-2 border-ink bg-[#a7f3d0]/45 px-5 py-5 sm:px-7">
              <div className="flex min-w-0 items-center gap-4">
                <div className="size-16 shrink-0 overflow-hidden rounded-xl border-2 border-ink bg-paper shadow-[2px_2px_0_#000]">
                  <RecipeArt recipe="custom" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className={cn(poster, 'text-[clamp(34px,4vw,48px)]')}>Describe your own</h2>
                    <span className="inline-flex items-center gap-1 rounded-md border-2 border-ink bg-[#a7f3d0] px-2 py-0.5 text-[11px] font-semibold">
                      <Cpu className="size-3" strokeWidth={2} aria-hidden />
                      free · on-device Gemini Nano
                    </span>
                  </div>
                  <p className="mt-1 text-[14px] text-black/80">
                    Write a sentence about your vibe or topic — Pip synthesizes a validated brief on
                    your device.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push('/start?recipe=custom')}
                className={btn('ink', 'md')}
              >
                <Wand2 className="size-4" strokeWidth={2} aria-hidden />
                Try custom recipe
              </button>
            </div>
            <div className="grid gap-6 px-5 py-6 text-[13px] leading-[1.65] sm:px-7 md:grid-cols-3">
              <div>
                <h3 className="text-[11px] font-semibold tracking-[0.08em] text-black/60 uppercase">
                  1. On-device resolution
                </h3>
                <p className="mt-2 text-black/80">
                  Runs <code className="text-[12px]">recipe.resolve</code> in{' '}
                  <strong>ONLY_ON_DEVICE</strong> mode via Firebase AI Logic + Gemini Nano (0
                  credits, 300-token structured JSON schema).
                </p>
              </div>
              <div>
                <h3 className="text-[11px] font-semibold tracking-[0.08em] text-black/60 uppercase">
                  2. Deterministic fallback
                </h3>
                <p className="mt-2 text-black/80">
                  On browsers without Gemini Nano,{' '}
                  <code className="text-[12px]">resolveByKeywords()</code> matches your words
                  against every built-in recipe&apos;s keyword set, colour palette and music mood
                  with zero latency.
                </p>
              </div>
              <div>
                <h3 className="text-[11px] font-semibold tracking-[0.08em] text-black/60 uppercase">
                  3. Validated output
                </h3>
                <p className="mt-2 text-black/80">
                  Produces a strict <code className="text-[12px]">ResolvedRecipe</code> (closest
                  base director skill, look, hex theme, caption style, hook style, music mood and
                  bounded director notes) parsed with Zod before reaching the director.
                </p>
              </div>
            </div>
          </article>
        </div>
      </main>
    </PaperPage>
  );
}
