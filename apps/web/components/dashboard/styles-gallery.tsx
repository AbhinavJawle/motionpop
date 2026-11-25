'use client';

import { builtInSkills, type BuiltInRecipeId, type RecipeStyle } from '@motionpop/ai';
import { ExternalLink, FolderGit2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { StyleArt } from '@/components/configure/art';
import { PipLoop } from '@/components/landing/pip-loop';
import { AppBar } from '@/components/paper/app-bar';
import { btn, paper, PaperPage, poster } from '@/components/paper/kit';
import { cn } from '@/lib/cn';
import { LOOK_STILLS } from '@/lib/editor/look-stills';
import { styleOptions } from '@/lib/inspector/timing-view';
import { useCommunitySkills } from '@/lib/skills/community-skills';

type StyleCategory = 'all' | 'community' | 'reel' | 'motion';

interface ReelStyleCardData {
  recipeId: BuiltInRecipeId;
  recipeName: string;
  recipeBlurb: string;
  style: RecipeStyle;
}

const CAPTION_LABELS: Readonly<Record<RecipeStyle['captionStyle'], string>> = {
  seam: 'Seam label captions',
  pop: 'Bold pop captions',
  editorial: 'Editorial italic captions',
  boxed: 'Highlight box captions',
  clean: 'Clean minimal captions',
};

/**
 * `/styles` (spec 14, updated in spec 40): every style a creator can start from, categorised into
 * talking-head Reel styles (from `builtInSkills.recipes()`) and Motion graphic looks (for
 * voiceovers, scripts and standalone graphics).
 */
export function StylesGallery() {
  const router = useRouter();
  const [category, setCategory] = useState<StyleCategory>('all');

  const reelStyles = useMemo<ReelStyleCardData[]>(
    () =>
      builtInSkills.recipes().flatMap((recipe) =>
        recipe.styles.map((style) => ({
          recipeId: recipe.id,
          recipeName: recipe.name,
          recipeBlurb: recipe.blurb,
          style,
        })),
      ),
    [],
  );
  const motionLooks = useMemo(() => styleOptions(), []);
  const { skills: communitySkills } = useCommunitySkills();

  const showCommunity = category === 'all' || category === 'community';
  const showReels = category === 'all' || category === 'reel';
  const showMotion = category === 'all' || category === 'motion';

  const tabs: readonly { id: StyleCategory; label: string; count: number }[] = [
    {
      id: 'all',
      label: 'All styles',
      count: communitySkills.length + reelStyles.length + motionLooks.length,
    },
    { id: 'community', label: 'Open-source skills', count: communitySkills.length },
    { id: 'reel', label: 'Reel styles', count: reelStyles.length },
    { id: 'motion', label: 'Motion graphic looks', count: motionLooks.length },
  ];

  return (
    <PaperPage>
      <AppBar active="styles" />
      <main className="mx-auto w-full max-w-[1240px] px-6 pt-14 pb-24 lg:px-10">
        <header className="flex items-end justify-between gap-8 border-b-2 border-ink pb-8">
          <div className="min-w-0 flex-1">
            <h1 className={cn(poster, 'text-[clamp(52px,6.5vw,96px)]')}>
              Pick a look.
              <br />
              Every graphic follows it.
            </h1>
            <p className="mt-4 max-w-[660px] text-[15px] leading-[1.65]">
              Motionpop has two engines under one roof: <strong>Reel styles</strong> tuned for
              talking-head videos, and <strong>Motion graphic looks</strong> for voiceovers, scripts
              and standalone graphics. Switch any time in the editor and the whole video restyles in
              one step.
            </p>
            <div role="tablist" aria-label="Style category" className="mt-6 flex flex-wrap gap-2.5">
              {tabs.map((tab) => {
                const active = category === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setCategory(tab.id)}
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
          </div>
          <PipLoop
            name="plane"
            className="hidden h-[168px] w-[250px] shrink-0 select-none md:block"
          />
        </header>

        {showCommunity && (
          <section aria-labelledby="styles-community-title" className="mt-12">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-md border-2 border-ink bg-[#fde68a] px-2 py-0.5 text-[11px] font-semibold uppercase">
                    Open-Source SKILL.md · All Formats
                  </span>
                  <span className="text-[12px] text-black/60 tabular-nums">
                    {communitySkills.length} curated studio skills
                  </span>
                </div>
                <h2
                  id="styles-community-title"
                  className={cn(poster, 'mt-3 text-[clamp(38px,4.5vw,56px)]')}
                >
                  Open-source director skills
                </h2>
                <p className="mt-2 max-w-[660px] text-[14px] leading-[1.6] text-black/75">
                  Community-tested visual grammars and editing playbooks from top GitHub repos —
                  pick any one like a style for Talking-Head Reels, Voiceovers, or Motion Graphics.
                </p>
              </div>
              <Link href="/skills" className={btn('paper', 'sm')}>
                Explore full skill library
              </Link>
            </div>

            <div className="mt-7 grid gap-7 sm:grid-cols-2 xl:grid-cols-3">
              {communitySkills.map((sk) => (
                <article
                  key={sk.id}
                  className={cn(paper.frame, paper.press, 'flex flex-col overflow-hidden')}
                >
                  {sk.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- static open-source skill preview
                    <img
                      src={sk.thumbnailUrl}
                      alt={sk.name}
                      className="block aspect-video w-full border-b-2 border-ink object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="aspect-video w-full border-b-2 border-ink"
                      style={{ background: sk.accent }}
                    />
                  )}
                  <div className="flex flex-1 flex-col px-5 pt-4 pb-5">
                    <h3 className={cn(poster, 'text-[30px] leading-tight')}>{sk.name}</h3>
                    {sk.repoSlug && (
                      <div className="mt-1.5">
                        {sk.sourceUrl ? (
                          <a
                            href={sk.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded border border-ink/30 bg-mist/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-black/80 hover:border-ink hover:text-flame"
                          >
                            <FolderGit2 className="size-2.5 shrink-0" aria-hidden />
                            {sk.repoSlug}
                            <ExternalLink className="size-2.5 shrink-0" aria-hidden />
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded border border-ink/30 bg-mist/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-black/80">
                            <FolderGit2 className="size-2.5 shrink-0" aria-hidden />
                            {sk.repoSlug}
                          </span>
                        )}
                      </div>
                    )}
                    <p className="mt-2 text-[12px] leading-[1.6] text-black/70">{sk.blurb}</p>
                    <button
                      type="button"
                      onClick={() => router.push(`/start?skill=${encodeURIComponent(sk.id)}`)}
                      className={btn('ink', 'md', false, 'mt-5 self-start')}
                    >
                      Start with this skill
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {showReels && (
          <section
            aria-labelledby="styles-reels-title"
            className={cn(showCommunity ? 'mt-16 border-t-2 border-ink pt-12' : 'mt-12')}
          >
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-md border-2 border-ink bg-[#8dbceb] px-2 py-0.5 text-[11px] font-semibold uppercase">
                    Talking-head video · 9:16
                  </span>
                  <span className="text-[12px] text-black/60 tabular-nums">
                    {reelStyles.length} styles across {builtInSkills.recipes().length} recipes
                  </span>
                </div>
                <h2
                  id="styles-reels-title"
                  className={cn(poster, 'mt-3 text-[clamp(38px,4.5vw,56px)]')}
                >
                  Reel styles
                </h2>
                <p className="mt-2 max-w-[640px] text-[14px] leading-[1.6] text-black/75">
                  Built for the template reel engine: split-screen stages, card reveals, speaker
                  framing, synced kinetic captions and colour themes paired to each{' '}
                  <Link href="/recipes" className={paper.link}>
                    director recipe
                  </Link>
                  .
                </p>
              </div>
              <Link href="/recipes" className={btn('paper', 'sm')}>
                Explore recipes
              </Link>
            </div>

            <div className="mt-7 grid gap-7 sm:grid-cols-2 xl:grid-cols-3">
              {reelStyles.map(({ recipeId, recipeName, recipeBlurb, style }) => (
                <article
                  key={`${recipeId}:${style.id}`}
                  className={cn(paper.frame, paper.press, 'flex flex-col overflow-hidden')}
                >
                  <div className="relative h-[220px] w-full overflow-hidden border-b-2 border-ink">
                    <StyleArt style={style} />
                    <Link
                      href={`/recipes#${recipeId}`}
                      className="absolute top-3 left-3 rounded-md border-2 border-ink bg-paper px-2 py-0.5 text-[11px] font-semibold shadow-[2px_2px_0_#000] transition-colors hover:bg-[#8dbceb]"
                    >
                      {recipeName}
                    </Link>
                    <div
                      aria-hidden
                      className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full border-2 border-ink bg-paper px-2 py-1 shadow-[2px_2px_0_#000]"
                    >
                      {style.swatch.map((hex, idx) => (
                        <span
                          key={idx}
                          className="size-3.5 rounded-full border border-ink"
                          style={{ background: hex }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col px-5 pt-4 pb-5">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className={cn(poster, 'text-[34px]')}>{style.name}</h3>
                      <span className="text-[11px] text-black/55 uppercase">{style.look} look</span>
                    </div>
                    <p className="mt-1.5 text-[12px] leading-[1.6] text-black/70">{recipeBlurb}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="rounded-md border-2 border-ink px-1.5 py-px text-[11px]">
                        {CAPTION_LABELS[style.captionStyle]}
                      </span>
                      <span className="rounded-md border-2 border-ink px-1.5 py-px text-[11px]">
                        {style.theme?.background
                          ? `${style.theme.background} ground`
                          : 'house ground'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/start?recipe=${encodeURIComponent(recipeId)}&style=${encodeURIComponent(style.id)}`,
                        )
                      }
                      className={btn('ink', 'md', false, 'mt-5 self-start')}
                    >
                      Start reel with this style
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {showMotion && (
          <section
            aria-labelledby="styles-motion-title"
            className={cn(showReels ? 'mt-16 border-t-2 border-ink pt-12' : 'mt-12')}
          >
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-md border-2 border-ink bg-[#ff6a3d] px-2 py-0.5 text-[11px] font-semibold uppercase">
                    Voiceover &amp; scripts · 16:9 · 9:16 · 1:1
                  </span>
                  <span className="text-[12px] text-black/60 tabular-nums">
                    {motionLooks.length} full style packs
                  </span>
                </div>
                <h2
                  id="styles-motion-title"
                  className={cn(poster, 'mt-3 text-[clamp(38px,4.5vw,56px)]')}
                >
                  Motion graphic looks
                </h2>
                <p className="mt-2 max-w-[640px] text-[14px] leading-[1.6] text-black/75">
                  Full style packs for explainers, data stories and standalone graphics: palettes,
                  bundled OFL typefaces, seeded paper textures, map styling, motion curves and
                  paired{' '}
                  <Link href="/skills" className={paper.link}>
                    slot skills
                  </Link>
                  .
                </p>
              </div>
              <Link href="/skills" className={btn('paper', 'sm')}>
                Explore skills
              </Link>
            </div>

            <div className="mt-7 grid gap-7 sm:grid-cols-2 xl:grid-cols-3">
              {motionLooks.map((o) => {
                const still = LOOK_STILLS[o.id];
                return (
                  <article
                    key={o.id}
                    className={cn(paper.frame, paper.press, 'flex flex-col overflow-hidden')}
                  >
                    {still ? (
                      // eslint-disable-next-line @next/next/no-img-element -- small static stills
                      <img
                        src={still}
                        alt=""
                        className="block aspect-video w-full border-b-2 border-ink object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <LookSwatch colors={o.colors} name={o.name} />
                    )}
                    <div className="flex flex-1 flex-col px-5 pt-4 pb-5">
                      <h3 className={cn(poster, 'text-[34px]')}>{o.name}</h3>
                      <p className="mt-1.5 text-[13px] font-semibold">{o.tagline}</p>
                      <p className="mt-2 text-[12px] leading-[1.6] text-black/65">
                        {o.description}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {o.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded-md border-2 border-ink px-1.5 py-px text-[11px]"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => router.push(`/start?style=${encodeURIComponent(o.id)}`)}
                        className={btn('ink', 'md', false, 'mt-5 self-start')}
                      >
                        Start with this look
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </PaperPage>
  );
}

/** A look without a still: its own paper, ink and accents, set like a title card. */
function LookSwatch({
  colors,
  name,
}: {
  colors: { bg: string; ink?: string; accent?: string; accent2?: string };
  name: string;
}) {
  return (
    <div
      aria-hidden
      className="relative flex aspect-video w-full items-center justify-center overflow-hidden border-b-2 border-ink"
      style={{ background: colors.bg, color: colors.ink ?? '#000' }}
    >
      <span className="font-poster text-[56px] leading-none tracking-[0.01em] uppercase">40%</span>
      <span className="absolute right-5 bottom-5 flex gap-1.5">
        {[colors.ink, colors.accent, colors.accent2].filter(Boolean).map((c, i) => (
          <span
            key={i}
            className="size-4 rounded-full border-2 border-ink"
            style={{ background: c }}
          />
        ))}
      </span>
      <span className="sr-only">{name}</span>
    </div>
  );
}
