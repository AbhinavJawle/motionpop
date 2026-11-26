'use client';

import {
  builtInSkills,
  recommendSetup,
  resolveByKeywords,
  resolveRecipe,
  toUserSkillRef,
  ttsMinutes,
  type BuiltInRecipeId,
  type SetupRecommendation,
} from '@motionpop/ai';
import type {
  EditConfig,
  Format,
  MusicMood,
  RecipeId,
  ReelCaptionStyle,
  ReelHookStyle,
  UserSkill,
} from '@motionpop/schemas';
import { FolderGit2, Plus, RotateCcw, Sparkles, Wand2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PaperPage, paper } from '@/components/paper/kit';
import { ProjectTopBar } from '@/components/start/project-top-bar';
import { cn } from '@/lib/cn';
import { CONFIGURE_COPY as C } from '@/lib/configure/copy';
import {
  defaultEdit,
  GRAPHIC_LOOKS,
  VOICEOVER_LOOKS,
  withRecipe,
  withStyle,
} from '@/lib/configure/defaults';
import { summarize, usesResolved } from '@/lib/configure/summary';
import { getRouter } from '@/lib/ai/router-client';
import { useCreditsBalance, useCreditsClient } from '@/lib/credits/use-credits-client';
import { LOOK_STILLS } from '@/lib/editor/look-stills';
import { takePending } from '@/lib/intake/pending';
import {
  addJobExtraClips,
  discard,
  prepare,
  release,
  removeJobExtraClip,
  setJobExtraClipKind,
  setJobFormat,
  submit,
  swapJobPrimaryClip,
  useJobs,
  watch,
} from '@/lib/pipeline/jobs-store';
import { useAppConfig, useOnline } from '@/lib/renders/hooks';
import { getAnySkillById, useCommunitySkills } from '@/lib/skills/community-skills';
import { useUserSkills } from '@/lib/skills/user-skills';

import { CaptionArt, HookArt, LookArt, MoodArt, RecipeArt, StyleArt } from './art';
import { MediaCard, pipLine } from './media-card';
import { StartHero } from '@/components/start/start-hero';
import { DescribeField, OptionRow, Section, Toggle, type Option } from './option-row';
import { SummaryPanel } from './summary-panel';

const HOOKS: readonly { value: ReelHookStyle; label: string; sub: string }[] = [
  { value: 'headline', label: 'Bold headline', sub: 'A title that sells it' },
  { value: 'stat', label: 'Big stat', sub: 'Lead with the number' },
  { value: 'visual', label: 'Visual slam', sub: 'Show the thing' },
  { value: 'cold-open', label: 'Clean cold open', sub: 'Straight into it' },
];

const CAPTIONS: readonly { value: ReelCaptionStyle; label: string }[] = [
  { value: 'seam', label: 'Seam label' },
  { value: 'pop', label: 'Bold pop' },
  { value: 'editorial', label: 'Editorial italic' },
  { value: 'boxed', label: 'Highlight box' },
  { value: 'clean', label: 'Clean minimal' },
];

const FORMATS: readonly { value: Format; label: string; sub: string }[] = [
  { value: '16:9', label: '16:9', sub: 'Widescreen · YouTube' },
  { value: '9:16', label: '9:16', sub: 'Vertical · Reels & Shorts' },
  { value: '1:1', label: '1:1', sub: 'Square · Social' },
];

const MOODS: readonly { value: MusicMood; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'minimal-tech', label: 'Minimal tech' },
  { value: 'upbeat', label: 'Upbeat' },
  { value: 'lofi', label: 'Lo-fi' },
  { value: 'dramatic', label: 'Dramatic' },
  { value: 'none', label: 'None' },
];

/**
 * The creator's own words that steer the edit. The recipe text only counts while the recipe is
 * "Describe your own": a built-in recipe picked afterwards leaves the old text behind.
 */
const ownWords = (e: Pick<EditConfig, 'recipeId' | 'customRecipe' | 'customStyle'>) => ({
  recipeText: e.recipeId === 'custom' ? (e.customRecipe?.trim() ?? '') : '',
  styleText: e.customStyle?.trim() ?? '',
});

/**
 * `/start/configure` (spec 39 R2): the take on top with its free preparation, the creator's
 * choices on the left, the priced summary on the right. Nothing is spent until Create.
 */
export function ConfigureScreen() {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJobs((s) => (jobId ? s.jobs[jobId] : undefined));
  const [edit, setEdit] = useState<EditConfig | null>(null);
  const [creating, setCreating] = useState(false);
  const config = useAppConfig();
  const online = useOnline();
  const balance = useCreditsBalance();
  const { client, byok, localLlm, hasAccountCredits } = useCreditsClient();
  const { skills: communitySkills } = useCommunitySkills();
  const { skills: userSkills } = useUserSkills();
  const [resolving, setResolving] = useState<'idle' | 'thinking' | 'device' | 'rules'>('idle');
  const [autoRec, setAutoRec] = useState<{
    rec: SetupRecommendation;
    status: 'applied' | 'suggested' | 'dismissed';
  } | null>(null);
  /** True once the creator clicks any recipe/skill/style option or arrived with an explicit preset. */
  const userTouchedRef = useRef(false);
  /** Snapshot of the initial defaults before auto-pick, for 1-click Reset. */
  const initialEditRef = useRef<EditConfig | null>(null);
  /** Tracks which `jobId|transcript` we already recommended for so we never re-run needlessly. */
  const recommendedKeyRef = useRef('');
  const resolveSeq = useRef(0);
  /** The words `edit.resolved` was made from, so Create can tell when it is out of date. */
  const resolvedFor = useRef('');
  const resolveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The latest choices, for the debounced resolve that fires after the render it started in. */
  const editRef = useRef<EditConfig | null>(null);
  useEffect(() => {
    editRef.current = edit;
  }, [edit]);
  useEffect(
    () => () => {
      if (resolveTimer.current) clearTimeout(resolveTimer.current);
    },
    [],
  );
  /** The job this screen prepared, and the watch it holds from Create until Processing takes over. */
  const jobIdRef = useRef<string | null>(null);
  const unwatch = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      unwatch.current?.();
      unwatch.current = null;
      // Leaving without Create: the preparation stops, the take stays for the next visit.
      if (jobIdRef.current) release(jobIdRef.current);
    },
    [],
  );
  /** The speed the script screen chose: the voice is priced (and made) at this pace. */
  const [ttsSpeed, setTtsSpeed] = useState(1);

  // The pending take: read, never consumed here (a reload keeps it, review fix #6).
  useEffect(() => {
    let live = true;
    void takePending()
      .catch(() => null)
      .then((take) => {
        if (!live) return;
        if (!take) return router.replace('/start');
        const id = prepare(take);
        jobIdRef.current = id;
        setTtsSpeed(take.meta.tts?.speed ?? 1);
        setJobId(id);
        const kind = useJobs.getState().jobs[id]?.kind ?? 'voiceover';
        const preSkill = getAnySkillById(take.draft.userSkillId);
        // Respect explicit presets carried from /skills, /recipes, or /styles.
        userTouchedRef.current = Boolean(
          preSkill || take.draft.recipeId || take.draft.styleId,
        );
        const initial = defaultEdit(kind, {
          source: take.meta.source,
          ...(preSkill
            ? { recipeId: preSkill.baseRecipeId }
            : take.draft.recipeId
              ? { recipeId: take.draft.recipeId }
              : {}),
          ...(preSkill?.lookId
            ? { lookHint: preSkill.lookId }
            : take.draft.styleId
              ? { lookHint: take.draft.styleId }
              : {}),
          ...(take.meta.graphicPrompt ? { promptHint: take.meta.graphicPrompt } : {}),
        });
        const startingEdit = preSkill
          ? {
              ...initial,
              hookStyle: preSkill.hookStyle,
              captions: { ...initial.captions, style: preSkill.captionStyle },
              sound: {
                ...initial.sound,
                music: kind === 'graphic' ? 'none' : preSkill.music,
              },
              userSkill: toUserSkillRef(preSkill),
            }
          : initial;
        initialEditRef.current = startingEdit;
        setEdit(startingEdit);
      });
    return () => {
      live = false;
    };
  }, [router]);

  const kind = job?.kind ?? 'voiceover';
  const transcriptText = job?.transcriptText;

  // Automatically pick the best skill, recipe, style & hook once the transcript/prompt is ready.
  useEffect(() => {
    if (!job?.id || !transcriptText?.trim()) return;
    const key = `${job.id}|${transcriptText.slice(0, 160)}`;
    if (recommendedKeyRef.current === key) return;
    recommendedKeyRef.current = key;
    let live = true;
    void getRouter()
      .catch(() => null)
      .then((routerClient) =>
        recommendSetup(routerClient, { transcript: transcriptText, kind }),
      )
      .then((rec) => {
        if (!live || rec.confidence !== 'high') return;
        const matchedSkill = rec.skillId
          ? (communitySkills.find((s) => s.id === rec.skillId) ?? getAnySkillById(rec.skillId))
          : undefined;
        if (!userTouchedRef.current) {
          setEdit((prev) => {
            if (!prev) return prev;
            const next = withRecipe(prev, kind, rec.recipeId, rec.styleId);
            const styled = withStyle(next, kind, rec.styleId);
            return {
              ...styled,
              hookStyle: rec.hookStyle,
              captions:
                matchedSkill && kind !== 'graphic'
                  ? { ...styled.captions, style: matchedSkill.captionStyle }
                  : styled.captions,
              sound: {
                ...styled.sound,
                music: kind === 'graphic' ? 'none' : rec.musicMood,
              },
              userSkill: matchedSkill ? toUserSkillRef(matchedSkill) : undefined,
            };
          });
          setAutoRec({ rec, status: 'applied' });
        } else {
          setAutoRec({ rec, status: 'suggested' });
        }
      });
    return () => {
      live = false;
    };
  }, [job?.id, transcriptText, kind, communitySkills]);
  const video = kind === 'video';
  const graphic = kind === 'graphic';
  const script = job?.script;
  const summary = useMemo(
    () =>
      edit
        ? summarize(edit, {
            kind,
            ...(script ? { script: { minutes: ttsMinutes(script, ttsSpeed) } } : {}),
            signedIn: hasAccountCredits ?? client !== null,
            ...(resolving === 'device' || resolving === 'rules' ? { resolvedBy: resolving } : {}),
            balance,
            online,
            config,
            ...(byok ? { byok: true } : {}),
            ...(localLlm ? { localLlm: true } : {}),
          })
        : null,
    [
      edit,
      kind,
      script,
      ttsSpeed,
      client,
      hasAccountCredits,
      balance,
      online,
      config,
      resolving,
      byok,
      localLlm,
    ],
  );

  if (!job || !edit || !summary) {
    return (
      <PaperPage>
        <ProjectTopBar />
        <main className="mx-auto max-w-[1240px] px-6 pt-16 lg:px-10">
          <p className="text-[14px] text-black/60">{C.loading}</p>
        </main>
      </PaperPage>
    );
  }

  const set = (patch: Partial<EditConfig>) => {
    userTouchedRef.current = true;
    setEdit((e) => (e ? { ...e, ...patch } : e));
  };
  const recipe = edit.recipeId;
  const skill = recipe === 'custom' ? undefined : builtInSkills.recipe(recipe);

  const recipeOptions: Option<RecipeId>[] = [
    ...builtInSkills.recipes().map((r) => ({
      value: r.id as RecipeId,
      label: r.name,
      sub: r.blurb,
      art: <RecipeArt recipe={r.id} swatch={r.styles[0]?.swatch} />,
    })),
    {
      value: 'custom',
      label: C.recipe.custom,
      sub: C.recipe.customSub,
      art: <RecipeArt recipe="custom" />,
    },
  ];

  const styleOptions: Option<string>[] = video
    ? [
        ...(
          builtInSkills.recipe(recipe === 'custom' ? 'tech-explainer' : (recipe as BuiltInRecipeId))
            ?.styles ?? []
        ).map((s) => ({ value: s.id, label: s.name, art: <StyleArt style={s} /> })),
        { value: '__custom', label: C.style.custom, art: <RecipeArt recipe="custom" /> },
      ]
    : [
        ...(graphic ? GRAPHIC_LOOKS : VOICEOVER_LOOKS).map((l) => ({
          value: l.id,
          label: l.name,
          art: <LookArt src={LOOK_STILLS[l.id]} />,
        })),
        { value: '__custom', label: C.style.custom, art: <RecipeArt recipe="custom" /> },
      ];
  const styleValue = edit.customStyle !== undefined ? '__custom' : edit.styleId;

  /**
   * The creator's own words become a recipe and style (R4): Gemini Nano when it is ready, the
   * keyword resolver otherwise. Runs when a field loses focus, 600 ms later; a newer run wins.
   */
  const resolveSoon = () => {
    if (resolveTimer.current) clearTimeout(resolveTimer.current);
    // New words make any answer still on its way out of date.
    resolveSeq.current++;
    resolveTimer.current = setTimeout(() => {
      const current = editRef.current;
      if (!current) return;
      const { recipeText, styleText } = ownWords(current);
      if (!recipeText && !styleText) {
        // Emptied: nothing described, so nothing resolved either.
        resolvedFor.current = '';
        setResolving('idle');
        setEdit((e) => (e && e.resolved ? { ...e, resolved: undefined } : e));
        return;
      }
      const seq = ++resolveSeq.current;
      setResolving('thinking');
      void getRouter()
        .catch(() => null)
        .then((r) =>
          resolveRecipe(r, {
            recipeId: current.recipeId,
            kind,
            ...(recipeText ? { recipeText } : {}),
            ...(styleText ? { styleText } : {}),
          }),
        )
        .then(({ resolved, ranOn }) => {
          if (seq !== resolveSeq.current) return;
          resolvedFor.current = `${recipeText}|${styleText}`;
          setResolving(ranOn);
          setEdit((e) =>
            e
              ? {
                  ...e,
                  resolved,
                  // A described recipe sets the opening and captions, as picking a recipe does.
                  ...(e.recipeId === 'custom'
                    ? {
                        hookStyle: resolved.hookStyle,
                        captions: { ...e.captions, style: resolved.captionStyle },
                      }
                    : {}),
                }
              : e,
          );
        });
    }, 600);
  };
  const resolveStatus =
    resolving === 'thinking'
      ? 'Pip is reading it…'
      : resolving === 'device'
        ? '⚡ free · on-device'
        : resolving === 'rules'
          ? 'free · quick match'
          : 'Pip reads this when you click away.';

  const remove = () => {
    jobIdRef.current = null;
    discard(job.id);
    router.replace('/start');
  };
  const create = () => {
    if (creating) return;
    setCreating(true);
    // Words the creator later switched away from don't steer the edit; words not yet read
    // (Create pressed straight from the field) get the instant keyword match.
    const { recipeText, styleText } = ownWords(edit);
    const final: EditConfig =
      !usesResolved(edit) || (!recipeText && !styleText)
        ? { ...edit, resolved: undefined }
        : edit.resolved && resolvedFor.current === `${recipeText}|${styleText}`
          ? edit
          : {
              ...edit,
              resolved: resolveByKeywords({
                recipeId: edit.recipeId,
                kind,
                ...(recipeText ? { recipeText } : {}),
                ...(styleText ? { styleText } : {}),
              }),
            };
    if (submit(job.id, final)) {
      // A fast job can finish before the router reaches its page: it counts as watched from now
      // until this screen unmounts (the processing page watches it from its own mount).
      unwatch.current ??= watch(job.id);
      router.push(`/processing/${encodeURIComponent(job.id)}`);
    } else setCreating(false);
  };

  const applyAutoRec = (rec: SetupRecommendation) => {
    const matchedSkill = rec.skillId
      ? (communitySkills.find((s) => s.id === rec.skillId) ?? getAnySkillById(rec.skillId))
      : undefined;
    setEdit((prev) => {
      if (!prev) return prev;
      const next = withRecipe(prev, kind, rec.recipeId, rec.styleId);
      const styled = withStyle(next, kind, rec.styleId);
      return {
        ...styled,
        hookStyle: rec.hookStyle,
        captions:
          matchedSkill && kind !== 'graphic'
            ? { ...styled.captions, style: matchedSkill.captionStyle }
            : styled.captions,
        sound: {
          ...styled.sound,
          music: kind === 'graphic' ? 'none' : rec.musicMood,
        },
        userSkill: matchedSkill ? toUserSkillRef(matchedSkill) : undefined,
      };
    });
    setAutoRec({ rec, status: 'applied' });
  };

  const resetAutoRec = () => {
    userTouchedRef.current = true;
    if (initialEditRef.current) setEdit(initialEditRef.current);
    setAutoRec((cur) => (cur ? { ...cur, status: 'dismissed' } : null));
  };

  const toggleUserSkill = (sk: UserSkill) => {
    userTouchedRef.current = true;
    setEdit((e) => {
      if (!e) return e;
      if (e.userSkill?.id === sk.id) {
        return { ...e, userSkill: undefined };
      }
      const next = withRecipe(e, kind, sk.baseRecipeId, sk.lookId);
      const styled =
        sk.lookId && kind !== 'video' ? withStyle(next, kind, sk.lookId) : next;
      return {
        ...styled,
        hookStyle: sk.hookStyle,
        captions: {
          ...styled.captions,
          style: sk.captionStyle,
        },
        sound: { ...styled.sound, music: kind === 'graphic' ? 'none' : sk.music },
        userSkill: toUserSkillRef(sk),
      };
    });
  };

  return (
    <PaperPage>
      <ProjectTopBar />
      <main className="mx-auto w-full max-w-[1240px] px-6 pb-24 lg:px-10">
        <StartHero
          bubble={pipLine(job)}
          headline={graphic ? C.headlineGraphic : video ? C.headlineVideo : C.headlineVoice}
          subline={graphic ? C.sublineGraphic : C.subline}
          pip={job.prep.stage === 'transcribing' ? 'sound' : 'craft'}
        />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-8">
            <MediaCard
              job={job}
              onRemove={remove}
              onAddExtraClips={(files) => {
                void addJobExtraClips(job.id, files);
              }}
              onRemoveExtraClip={(ref) => removeJobExtraClip(job.id, ref)}
              onSetExtraClipKind={(ref, kindHint) => setJobExtraClipKind(job.id, ref, kindHint)}
              onMakeMainClip={(ref) => {
                recommendedKeyRef.current = '';
                setAutoRec(null);
                void swapJobPrimaryClip(job.id, ref);
              }}
            />

            <div className={cn(paper.frame, 'p-5 sm:p-7')}>
              {!video && (
                <div className="mb-7 flex flex-wrap items-center justify-between gap-3 border-b-2 border-black/10 pb-6">
                  <div>
                    <p className="text-[14px] font-semibold">{C.format.title}</p>
                    <p className="text-[12px] text-black/55">{C.format.hint}</p>
                  </div>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Canvas format">
                    {FORMATS.map((f) => {
                      const active = (job.format ?? '16:9') === f.value;
                      return (
                        <button
                          key={f.value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setJobFormat(job.id, f.value)}
                          className={cn(
                            'flex flex-col items-start rounded-lg border-2 border-ink px-3 py-1.5 text-left transition-colors',
                            active
                              ? 'bg-ink text-paper shadow-[2px_2px_0_#ff6a3d]'
                              : 'bg-paper text-ink hover:bg-mist',
                          )}
                        >
                          <span className="font-mono text-[12px] font-bold">{f.label}</span>
                          <span
                            className={cn(
                              'text-[10px]',
                              active ? 'text-paper/75' : 'text-black/55',
                            )}
                          >
                            {f.sub}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Auto-pick status / banner driven by the prepared transcript or prompt */}
              {!autoRec && job.prep.stage === 'transcribing' && (
                <div
                  role="status"
                  className="mb-6 flex items-center gap-2.5 rounded-xl border-2 border-dashed border-ink/30 bg-mist/40 px-4 py-3 text-[12px] text-black/70"
                >
                  <Wand2 className="size-4 shrink-0 animate-pulse text-flame" aria-hidden />
                  <span>
                    Listening to your audio to auto-pick the best recipe, skill, and visual style…
                  </span>
                </div>
              )}
              {autoRec && autoRec.status !== 'dismissed' && (() => {
                const recSkill = autoRec.rec.skillId
                  ? (communitySkills.find((s) => s.id === autoRec.rec.skillId) ??
                    getAnySkillById(autoRec.rec.skillId))
                  : undefined;
                const recRecipe = builtInSkills.recipe(autoRec.rec.recipeId);
                const applied = autoRec.status === 'applied';
                return (
                  <div
                    role="status"
                    data-testid="auto-pick-banner"
                    className={cn(
                      'mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-ink px-4 py-3',
                      applied ? 'bg-[#a7f3d0]/45 shadow-[3px_3px_0_var(--color-hard)]' : 'bg-[#fde68a]/45',
                    )}
                  >
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border-2 border-ink bg-paper">
                        <Wand2 className="size-3.5 text-ink" strokeWidth={2.2} aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-[12px] font-bold text-ink">
                          <span>
                            {applied
                              ? 'Auto-picked from your transcript:'
                              : 'Suggested from your transcript:'}
                          </span>
                          <span className="rounded-md border border-ink bg-paper px-1.5 py-0.5 text-[11px]">
                            {recSkill ? recSkill.name : (recRecipe?.name ?? autoRec.rec.recipeId)}
                          </span>
                          {recRecipe && recSkill && (
                            <span className="font-normal text-black/65">
                              · {recRecipe.name}
                            </span>
                          )}
                          <span className="rounded-full border border-ink/30 bg-paper/80 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-black/65">
                            {autoRec.rec.ranOn === 'device' ? '⚡ on-device' : 'instant match'}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11.5px] text-black/75">{autoRec.rec.reason}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {applied ? (
                        <button
                          type="button"
                          onClick={resetAutoRec}
                          className="inline-flex items-center gap-1 rounded-lg border-2 border-ink bg-paper px-2.5 py-1 text-[11px] font-semibold hover:bg-mist"
                        >
                          <RotateCcw className="size-3" strokeWidth={2} aria-hidden />
                          Reset
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => applyAutoRec(autoRec.rec)}
                            className="inline-flex items-center gap-1 rounded-lg border-2 border-ink bg-ink px-2.5 py-1 text-[11px] font-semibold text-paper hover:bg-ink/90"
                          >
                            Apply
                          </button>
                          <button
                            type="button"
                            aria-label="Dismiss suggestion"
                            onClick={() =>
                              setAutoRec((cur) => (cur ? { ...cur, status: 'dismissed' } : null))
                            }
                            className="grid size-7 place-items-center rounded-lg border-2 border-ink/40 bg-paper text-ink hover:border-ink"
                          >
                            <X className="size-3.5" aria-hidden />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

              <Section n={1} id="cfg-recipe" title={C.recipe.title} hint={C.recipe.hint}>
                <OptionRow
                  layoutKey="recipe"
                  label={C.recipe.title}
                  options={recipeOptions}
                  value={recipe}
                  onChange={(r) => {
                    userTouchedRef.current = true;
                    setEdit((e) => (e ? withRecipe(e, kind, r) : e));
                  }}
                  soon={C.soon.recipes}
                />
                {recipe === 'custom' && (
                  <DescribeField
                    label={C.recipe.customLabel}
                    value={edit.customRecipe ?? ''}
                    onChange={(v) => set({ customRecipe: v })}
                    onCommit={resolveSoon}
                    status={resolveStatus}
                    placeholder={C.recipe.placeholder}
                  />
                )}
                {/* Open-source community skills (shared Firestore DB) + personal custom SKILL.md */}
                <div className="mt-5 rounded-xl border-2 border-ink/20 bg-mist/35 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-flame" strokeWidth={2.2} aria-hidden />
                      <span className="text-[12px] font-bold tracking-[0.04em] uppercase">
                        Open-source director skills ({communitySkills.length})
                      </span>
                      {edit.userSkill && (
                        <button
                          type="button"
                          onClick={() => set({ userSkill: undefined })}
                          className="rounded border border-ink/40 bg-paper px-1.5 py-0.5 text-[10px] font-semibold hover:bg-mist"
                        >
                          Clear active skill
                        </button>
                      )}
                    </div>
                    <Link
                      href="/skills"
                      className="inline-flex items-center gap-1 rounded-lg border-2 border-ink bg-paper px-2.5 py-1 text-[11px] font-semibold hover:bg-[#fde68a]"
                    >
                      <Plus className="size-3" strokeWidth={2} aria-hidden />
                      {userSkills.length > 0 ? 'Manage / import SKILL.md' : 'Import SKILL.md'}
                    </Link>
                  </div>
                  <p className="mt-1 text-[11px] text-black/60">
                    Pick any open-source motion-design or video-editing skill just like a style —
                    steers pacing, typography, cutouts, and bespoke hero scenes.
                  </p>

                  {/* Community open-source skill visual cards */}
                  <div
                    role="group"
                    aria-label="Open-source director skills"
                    className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4"
                  >
                    {communitySkills.map((sk) => {
                      const active = edit.userSkill?.id === sk.id;
                      return (
                        <button
                          key={sk.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleUserSkill(sk)}
                          className={cn(
                            'group flex flex-col overflow-hidden rounded-[10px] border-2 text-left transition-all',
                            active
                              ? 'border-ink bg-ink text-paper shadow-[3px_3px_0_#ff6a3d]'
                              : 'border-ink/30 bg-paper text-ink hover:border-ink hover:bg-mist/50',
                          )}
                        >
                          <div className="relative aspect-[16/10] w-full overflow-hidden border-b border-ink/20 bg-[#151519]">
                            {sk.thumbnailUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element -- static open-source skill preview
                              <img
                                src={sk.thumbnailUrl}
                                alt=""
                                loading="lazy"
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                            ) : (
                              <div
                                className="h-full w-full"
                                style={{ background: sk.accent }}
                              />
                            )}
                            <span
                              className="absolute right-1.5 bottom-1.5 size-2.5 rounded-full border border-black"
                              style={{ background: sk.accent }}
                              aria-hidden
                            />
                            {autoRec?.status === 'applied' && autoRec.rec.skillId === sk.id && (
                              <span className="absolute top-1.5 left-1.5 rounded-md border border-black bg-[#a7f3d0] px-1.5 py-0.5 font-mono text-[8.5px] font-bold tracking-[0.04em] text-black uppercase">
                                Auto-picked
                              </span>
                            )}
                          </div>
                          <div className="flex flex-1 flex-col justify-between p-2">
                            <span className="line-clamp-1 text-[11px] leading-[1.3] font-bold">
                              {sk.name}
                            </span>
                            {sk.repoSlug && (
                              <span
                                className={cn(
                                  'mt-1 inline-flex items-center gap-1 truncate font-mono text-[9px]',
                                  active ? 'text-paper/75' : 'text-black/55',
                                )}
                                title={sk.repoSlug}
                              >
                                <FolderGit2 className="size-2.5 shrink-0" aria-hidden />
                                <span className="truncate">{sk.repoSlug}</span>
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Personal imported skills (Firestore users/{uid}/skills) */}
                  {userSkills.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/10 pt-3">
                      <span className="text-[10px] font-bold tracking-[0.06em] text-black/60 uppercase">
                        Your imported skills
                      </span>
                      {userSkills.map((sk) => {
                        const active = edit.userSkill?.id === sk.id;
                        return (
                          <button
                            key={sk.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => toggleUserSkill(sk)}
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-lg border-2 border-ink px-2.5 py-1 text-[12px] font-medium transition-colors',
                              active
                                ? 'bg-ink text-paper shadow-[2px_2px_0_#ff6a3d]'
                                : 'bg-paper text-ink hover:bg-mist',
                            )}
                          >
                            <span
                              className="size-2.5 rounded-full border border-current"
                              style={{ background: sk.accent }}
                              aria-hidden
                            />
                            {sk.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Section>

              <Section
                n={2}
                id="cfg-style"
                title={C.style.title}
                hint={graphic ? C.style.hintGraphic : video ? C.style.hintVideo : C.style.hintVoice}
              >
                <OptionRow
                  layoutKey="style"
                  label={C.style.title}
                  options={styleOptions}
                  value={styleValue}
                  onChange={(v) => {
                    userTouchedRef.current = true;
                    if (v === '__custom') set({ customStyle: edit.customStyle ?? '' });
                    else setEdit((e) => (e ? withStyle(e, kind, v) : e));
                  }}
                  soon={C.soon.styles}
                />
                {edit.customStyle !== undefined && (
                  <DescribeField
                    label={C.style.customLabel}
                    value={edit.customStyle}
                    onChange={(v) => set({ customStyle: v })}
                    onCommit={resolveSoon}
                    status={resolveStatus}
                    placeholder={C.style.placeholder}
                  />
                )}
              </Section>

              {graphic && (
                <Section n={3} id="cfg-visuals" title={C.visuals.title} hint={C.visuals.hint}>
                  <div className="grid max-w-[640px] gap-3">
                    <SwitchRow
                      title={C.visuals.toggle}
                      sub={C.visuals.toggleSub}
                      checked={edit.illustrations}
                      onChange={(illustrations) => set({ illustrations })}
                    />
                  </div>
                </Section>
              )}

              {video && (
                <Section n={3} id="cfg-hook" title={C.hook.title} hint={C.hook.hint}>
                  <OptionRow
                    layoutKey="hook"
                    size="sm"
                    label={C.hook.title}
                    options={HOOKS.map((h) => ({ ...h, art: <HookArt hook={h.value} /> }))}
                    value={edit.hookStyle}
                    onChange={(hookStyle) => set({ hookStyle })}
                    soon={C.soon.hooks}
                  />
                </Section>
              )}

              {!graphic && (
                <Section
                  n={video ? 4 : 3}
                  id="cfg-captions"
                  title={C.captions.title}
                  hint={C.captions.hint}
                  right={
                    <Toggle
                      label={C.captions.title}
                      checked={edit.captions.enabled}
                      onChange={(enabled) => set({ captions: { ...edit.captions, enabled } })}
                    />
                  }
                >
                  {edit.captions.enabled && (
                    <OptionRow
                      layoutKey="captions"
                      size="sm"
                      label={C.captions.styleLabel}
                      options={CAPTIONS.map((c) => ({
                        ...c,
                        art: <CaptionArt style={c.value} label="to get started" />,
                      }))}
                      value={edit.captions.style}
                      onChange={(style) => set({ captions: { ...edit.captions, style } })}
                      soon={C.soon.captions}
                    />
                  )}
                </Section>
              )}

              {video && (
                <Section
                  n={5}
                  id="cfg-cta"
                  title={C.cta.title}
                  hint={C.cta.hint}
                  right={
                    <Toggle
                      label={C.cta.title}
                      checked={edit.cta.enabled}
                      onChange={(enabled) => set({ cta: { ...edit.cta, enabled } })}
                    />
                  }
                >
                  {edit.cta.enabled && (
                    <div className={cn(paper.field, 'flex max-w-[420px] items-center gap-2 px-3')}>
                      <input
                        value={edit.cta.text ?? ''}
                        onChange={(e) =>
                          set({
                            cta: {
                              enabled: true,
                              ...(e.target.value ? { text: e.target.value.slice(0, 40) } : {}),
                            },
                          })
                        }
                        aria-label={C.cta.textLabel}
                        placeholder={C.cta.placeholder}
                        className="h-10 flex-1 bg-transparent text-[13px] outline-none placeholder:text-black/40"
                      />
                    </div>
                  )}
                </Section>
              )}

              {!graphic && (
                <Section n={video ? 6 : 4} id="cfg-sound" title={C.sound.title} hint={C.sound.hint}>
                  <div className="mb-6 grid max-w-[640px] gap-3">
                    {!job.script && (
                      <SwitchRow
                        title={C.sound.cleanup}
                        sub={C.sound.cleanupSub}
                        checked={edit.sound.cleanup}
                        onChange={(cleanup) => set({ sound: { ...edit.sound, cleanup } })}
                      />
                    )}
                    <SwitchRow
                      title={C.sound.sfx}
                      sub={C.sound.sfxSub}
                      checked={edit.sound.sfx}
                      onChange={(sfx) => set({ sound: { ...edit.sound, sfx } })}
                    />
                    {video && (
                      <SwitchRow
                        title={C.sound.illustrations}
                        sub={C.sound.illustrationsSub}
                        checked={edit.illustrations}
                        onChange={(illustrations) => set({ illustrations })}
                      />
                    )}
                  </div>
                  <p className="mb-3 text-[13px] font-semibold">
                    {C.sound.music}
                    {edit.sound.music === 'auto' && skill && (
                      <span className="ml-2 font-normal text-black/55">
                        {C.sound.autoFor(skill.name)}
                      </span>
                    )}
                  </p>
                  <OptionRow
                    layoutKey="music"
                    size="sm"
                    label={C.sound.music}
                    options={MOODS.map((m) => ({ ...m, art: <MoodArt mood={m.value} /> }))}
                    value={edit.sound.music}
                    onChange={(music) => set({ sound: { ...edit.sound, music } })}
                    soon={C.soon.sound}
                  />
                </Section>
              )}
            </div>
          </div>

          <SummaryPanel
            summary={summary}
            creating={creating}
            preparing={
              job.prep.stage === 'ready' || job.prep.stage === 'failed' ? null : job.prep.pct
            }
            onCreate={create}
            {...(job.prep.stage === 'failed' ? { disabledReason: C.chooseAnother } : {})}
          />
        </div>
      </main>
    </PaperPage>
  );
}

function SwitchRow({
  title,
  sub,
  checked,
  onChange,
}: {
  title: string;
  sub: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-6 rounded-[10px] border-2 border-black/15 bg-paper px-4 py-3">
      <div>
        <p className="text-[13px] font-semibold">{title}</p>
        <p className="text-[12px] text-black/55">{sub}</p>
      </div>
      <Toggle label={title} checked={checked} onChange={onChange} />
    </div>
  );
}
