import {
  DETECT_CATALOGUE,
  ImageSubjectSchema,
  catalogueEntry,
  isDetectable,
  type PipPlanInput,
} from '@motionpop/ai';
import { assetsInUse } from '@motionpop/motion/compiler';
import {
  APP_CONFIG_DEFAULTS,
  DEFAULT_CAPTIONS,
  FormatSchema,
  PIP_MAX_STEPS,
  PipCaptionChoiceSchema,
  ReelLookSchema,
  ReelSfxKindSchema,
  SlotPlacementSchema,
  VideoStageModeSchema,
  audioOf,
  costOf,
  type Brand,
  type CostConfig,
  type EditorProject,
  type PipModelOutput,
  type PipPlan,
  type PipScope,
  type PipStep,
} from '@motionpop/schemas';
import { slotCardText } from '@/lib/editor/slot-display';
import { styleOptions } from '@/lib/inspector/timing-view';
import { imageRoleOf, suggestSubject } from '@/lib/images/generate';

/**
 * Pip plans (spec 10 design §2, §5, §6), pure. A model answer is enforced here: slot refs resolve
 * to real slots, choices must exist, credits are computed in code, anything else is dropped with a
 * reason. Suggestion chips build their plan in code with no model call (free, instant).
 */

/** Slots in time order get refs s1..sN; the model only sees refs. */
export function slotRefs(project: EditorProject): Map<string, string> {
  const sorted = [...project.slots].sort((a, b) => a.startMs - b.startMs);
  return new Map(sorted.map((s, i) => [`s${i + 1}`, s.id]));
}

/** Reel scenes in time order get refs r1..rN (spec 37). */
export function sceneRefs(project: EditorProject): Map<string, string> {
  const sorted = [...(project.reel?.scenes ?? [])].sort((a, b) => a.startMs - b.startMs);
  return new Map(sorted.map((s, i) => [`r${i + 1}`, s.id]));
}

/** Keys of a scene's content that are not words on screen. */
const NOT_TEXT = new Set([
  'template',
  'icon',
  'asset',
  'src',
  'html',
  'css',
  'script',
  'kind',
  'url',
  'at',
]);

/** The words a scene shows, short (what the model needs to tell scenes apart). */
export function sceneText(content: unknown, max = 140): string {
  const out: string[] = [];
  const walk = (v: unknown, depth: number) => {
    if (out.join(' ').length > max || depth > 3) return;
    if (typeof v === 'string') {
      const t = v.trim();
      if (t) out.push(t);
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) if (!NOT_TEXT.has(k)) walk(x, depth + 1);
  };
  walk(content, 0);
  return clip(out.join(' · ').replace(/\s+/g, ' '), max);
}

/** The reel's state in a few words, for Pip (spec 37 R1.1). */
function reelInput(project: EditorProject): PipPlanInput['project']['reel'] {
  const r = project.reel;
  if (!r) return undefined;
  const refs = sceneRefs(project);
  const a = audioOf(project);
  const music = r.music?.src
    ? `generated "${clip(r.music.brief, 60)}"`
    : a.musicId === 'calm-pad' || a.musicId === 'steady-pulse'
      ? a.musicId
      : 'none';
  const theme = r.theme
    ? `${r.theme.accent}${r.theme.accent2 ? ` ${r.theme.accent2}` : ''} ${r.theme.background} gradient`
    : r.look === 'mono'
      ? 'house black and white (no colour yet)'
      : 'house cream and orange';
  return {
    look: r.look,
    captions: r.captions,
    theme: clip(theme, 80),
    sound: clip(
      `effects ${a.autoSfx ? `on (${a.sfxGainDb >= 0 ? '+' : ''}${a.sfxGainDb} dB)` : 'off'}; music ${music}; added sounds ${r.sfx?.length ?? 0}`,
      160,
    ),
    cuts: project.video?.cuts.filter((c) => c.enabled).length ?? 0,
    scenes: [...refs].slice(0, 80).map(([ref, id]) => {
      const s = r.scenes.find((x) => x.id === id)!;
      return {
        ref,
        template: s.content.template,
        layout: s.layout,
        startMs: s.startMs,
        endMs: s.endMs,
        text: sceneText(s.content),
      };
    }),
  };
}

export function pipInput(
  project: EditorProject,
  scope: PipScope,
  history: { role: string; text: string }[],
  message: string,
): PipPlanInput {
  const refs = slotRefs(project);
  const refOf = new Map([...refs].map(([ref, id]) => [id, ref]));
  const captions = project.captions ?? DEFAULT_CAPTIONS;
  return {
    scope: scope.kind === 'slot' ? (refOf.get(scope.slotId) ?? 'video') : 'video',
    project: {
      format: project.format,
      styleId: project.styleId,
      ...(project.video ? { hasVideo: true } : {}),
      ...(project.mediaBin?.length
        ? {
            mediaBin: project.mediaBin.map((c) => ({
              id: c.id,
              name: c.name,
              kind: c.kind,
              ...(c.summary ? { summary: c.summary } : {}),
            })),
          }
        : {}),
      styles: styleOptions()
        .slice(0, 12)
        .map((s) => ({ id: s.id, name: s.name })),
      captions: { enabled: captions.enabled, preset: captions.presetId },
      slots: [...refs].slice(0, 40).map(([ref, id]) => {
        const s = project.slots.find((x) => x.id === id)!;
        return {
          ref,
          componentId: s.componentId,
          name: catalogueEntry(s.componentId)?.name ?? s.componentId,
          title: slotCardText(s).title.slice(0, 120),
          status: s.status,
          startMs: s.startMs,
          endMs: s.endMs,
        };
      }),
      words: project.transcript.words
        .filter((w) => !w.filler)
        .slice(0, 3000)
        .map((w) => [w.i, w.text] as [number, string]),
      components: DETECT_CATALOGUE.filter((c) => c.built)
        .slice(0, 16)
        .map((c) => ({ id: c.id, name: c.name, useWhen: c.useWhen.slice(0, 160) })),
      ...(project.reel ? { reel: reelInput(project) } : {}),
    },
    history: history.slice(-6).map((h) => ({ role: h.role, text: h.text.slice(0, 400) })),
    message: message.slice(0, 1000),
  };
}

/**
 * Credits a step spends when applied: a cloud regeneration, a reel scene edit (the note price; a
 * new graphic adds the custom price, shown on the card) and directing the reel again.
 */
export function stepCredits(
  action: PipStep['action'],
  cfg: CostConfig = APP_CONFIG_DEFAULTS,
): number {
  switch (action) {
    case 'generateSlot':
      return costOf('generate', 1, cfg);
    case 'editScene':
      return costOf('edit', 1, cfg);
    case 'regenerateReel':
      return costOf('reel', 1, cfg);
    default:
      return 0;
  }
}

const HEX_IN = /#[0-9a-fA-F]{6}\b/g;

export function planCredits(plan: PipPlan): number {
  return plan.steps.filter((s) => s.include).reduce((n, s) => n + s.credits, 0);
}

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** Model answer → plan. Never throws; invalid steps go to `dropped` with a reason. */
export function enforcePlan(
  out: PipModelOutput,
  project: EditorProject,
  source: PipPlan['source'],
  cfg: CostConfig = APP_CONFIG_DEFAULTS,
): PipPlan {
  const refs = slotRefs(project);
  const scenes = sceneRefs(project);
  const styleIds = new Set(styleOptions().map((s) => s.id));
  const steps: PipStep[] = [];
  const dropped: PipPlan['dropped'] = [];
  const seen = new Set<string>();
  const drop = (label: string, reason: string) =>
    dropped.length < PIP_MAX_STEPS && dropped.push({ label: clip(label || 'A step', 60), reason });
  const reel = project.reel;
  const NO_REEL = 'Only for video reels';

  for (const m of out.steps.slice(0, PIP_MAX_STEPS)) {
    const label = clip(m.label.trim() || m.action, 60);
    const slotId = refs.get(m.slot);
    const sceneId = scenes.get(m.slot);
    // A slot action aimed at a reel scene means the scene action (the model mixes them up).
    const action: PipStep['action'] =
      sceneId && !slotId
        ? m.action === 'updateSlot' || m.action === 'generateSlot'
          ? 'editScene'
          : m.action === 'removeSlot'
            ? 'clearScene'
            : m.action
        : m.action;
    const base = { id: `step-${steps.length + 1}`, action, label, include: true };
    const key = `${action}:${slotId ?? sceneId ?? ''}:${m.choice}:${action === 'addSound' ? m.atWord : ''}`;
    if (seen.has(key)) continue;
    const instruction = m.instruction.trim().slice(0, 200);
    switch (action) {
      case 'editScene':
      case 'clearScene': {
        if (!reel) {
          drop(label, NO_REEL);
          continue;
        }
        if (!sceneId) {
          drop(label, 'That scene isn’t in the reel');
          continue;
        }
        if (action === 'editScene' && !instruction) {
          drop(label, 'Nothing to change was given');
          continue;
        }
        steps.push({
          ...base,
          sceneId,
          ...(action === 'editScene' ? { instruction } : {}),
          credits: stepCredits(action, cfg),
        });
        break;
      }
      case 'setReelTheme': {
        if (!reel) {
          drop(label, NO_REEL);
          continue;
        }
        const hexes = instruction.match(HEX_IN) ?? [];
        if (!hexes[0]) {
          drop(label, 'No colours were given');
          continue;
        }
        const background =
          m.choice === 'plain' || m.choice === 'bold' || m.choice === 'soft' ? m.choice : 'soft';
        steps.push({
          ...base,
          theme: {
            accent: hexes[0].toUpperCase(),
            ...(hexes[1] ? { accent2: hexes[1].toUpperCase() } : {}),
            background,
          },
          credits: 0,
        });
        break;
      }
      case 'setReelLook': {
        const look = ReelLookSchema.safeParse(m.choice);
        if (!reel) {
          drop(label, NO_REEL);
          continue;
        }
        if (!look.success) {
          drop(label, 'Choose mono or cream');
          continue;
        }
        if (look.data === reel.look) {
          drop(label, 'The reel already has that look');
          continue;
        }
        steps.push({ ...base, look: look.data, credits: 0 });
        break;
      }
      case 'regenerateReel':
        if (!reel) {
          drop(label, NO_REEL);
          continue;
        }
        steps.push({
          ...base,
          ...(instruction ? { instruction } : {}),
          credits: stepCredits(m.action, cfg),
        });
        break;
      case 'setSound': {
        const c = m.choice;
        if (c !== 'on' && c !== 'off' && c !== 'louder' && c !== 'quieter' && c !== 'clear') {
          drop(label, 'Choose on, off, louder, quieter or clear');
          continue;
        }
        if (c === 'clear' && !reel?.sfx?.length) {
          drop(label, 'There are no added sounds');
          continue;
        }
        steps.push({ ...base, sound: c, credits: 0 });
        break;
      }
      case 'setMusic': {
        const c = m.choice;
        if (c !== 'none' && c !== 'calm-pad' && c !== 'steady-pulse' && c !== 'ai') {
          drop(label, 'Unknown music');
          continue;
        }
        if (c === 'ai' && (!reel || instruction.length < 3)) {
          drop(label, reel ? 'No music brief was given' : NO_REEL);
          continue;
        }
        steps.push({ ...base, music: c, ...(c === 'ai' ? { instruction } : {}), credits: 0 });
        break;
      }
      case 'addSound': {
        const kind = ReelSfxKindSchema.safeParse(m.choice);
        if (!reel) {
          drop(label, NO_REEL);
          continue;
        }
        if (!kind.success) {
          drop(label, 'Unknown sound');
          continue;
        }
        if (m.atWord < 0 || !project.transcript.words[m.atWord]) {
          drop(label, 'No word to put it on');
          continue;
        }
        steps.push({ ...base, sfxKind: kind.data, atWord: m.atWord, credits: 0 });
        break;
      }
      case 'updateSlot':
      case 'generateSlot':
      case 'removeSlot': {
        if (!slotId) {
          drop(label, 'That graphic isn’t on the timeline');
          continue;
        }
        const instruction = m.instruction.trim();
        if (m.action === 'updateSlot' && !instruction) {
          drop(label, 'Nothing to change was given');
          continue;
        }
        steps.push({
          ...base,
          slotId,
          ...(instruction ? { instruction: instruction.slice(0, 200) } : {}),
          credits: stepCredits(m.action, cfg),
        });
        break;
      }
      case 'addSlot': {
        const word = project.transcript.words[m.atWord];
        if (!word || m.atWord < 0) {
          drop(label, 'No word to place it on');
          continue;
        }
        steps.push({
          ...base,
          atWord: m.atWord,
          ...(isDetectable(m.choice) ? { componentId: m.choice } : {}),
          ...(m.instruction.trim() ? { instruction: m.instruction.trim().slice(0, 200) } : {}),
          credits: 0,
        });
        break;
      }
      case 'setStyle':
        if (!styleIds.has(m.choice)) {
          drop(label, 'That style doesn’t exist');
          continue;
        }
        steps.push({ ...base, styleId: m.choice, credits: 0 });
        break;
      case 'setFormat': {
        const f = FormatSchema.safeParse(m.choice);
        if (!f.success) {
          drop(label, 'Unknown format');
          continue;
        }
        steps.push({ ...base, format: f.data, credits: 0 });
        break;
      }
      case 'setCaptions': {
        const c = PipCaptionChoiceSchema.safeParse(m.choice);
        if (!c.success) {
          drop(label, 'Unknown caption style');
          continue;
        }
        steps.push({ ...base, captions: c.data, credits: 0 });
        break;
      }
      case 'setPlacement': {
        const pl = SlotPlacementSchema.safeParse(m.choice);
        if (!pl.success) {
          drop(label, 'Choose overlay or cutaway');
          continue;
        }
        steps.push({
          ...base,
          ...(slotId ? { slotId } : {}),
          placement: pl.data,
          credits: 0,
        });
        break;
      }
      case 'setVideoStage': {
        if (!project.video) {
          drop(label, 'Only available for video projects');
          continue;
        }
        const st = VideoStageModeSchema.safeParse(m.choice);
        if (!st.success) {
          drop(label, 'Unknown video stage mode');
          continue;
        }
        steps.push({
          ...base,
          ...(slotId ? { slotId } : {}),
          videoStage: st.data,
          credits: 0,
        });
        break;
      }
      case 'setBeatClip': {
        if (reel && sceneId) {
          const clipChoice = m.choice === 'none' ? '' : m.choice;
          if (clipChoice && !project.mediaBin?.some((c) => c.id === clipChoice)) {
            drop(label, 'That clip is not in the Media Bin');
            continue;
          }
          steps.push({
            ...base,
            sceneId,
            clipId: clipChoice,
            credits: 0,
          });
          break;
        }
        if (!project.video) {
          drop(label, 'Only available for video projects');
          continue;
        }
        if (!slotId) {
          drop(label, 'Pick a specific beat to attach a clip to');
          continue;
        }
        const clipChoice = m.choice === 'none' ? '' : m.choice;
        if (clipChoice && !project.mediaBin?.some((c) => c.id === clipChoice)) {
          drop(label, 'That clip is not in the Media Bin');
          continue;
        }
        steps.push({
          ...base,
          slotId,
          clipId: clipChoice,
          credits: 0,
        });
        break;
      }
      case 'toggleCuts': {
        if (!project.video) {
          drop(label, 'This project has no video cuts');
          continue;
        }
        const enabled = m.choice !== 'disable';
        steps.push({ ...base, cutEnabled: enabled, credits: 0 });
        break;
      }
      case 'addPunchIn':
      case 'cutRange': {
        if (!project.video) {
          drop(label, 'Only available for video projects');
          continue;
        }
        const word = project.transcript.words[m.atWord];
        if (!word || m.atWord < 0) {
          drop(label, 'No word to anchor it on');
          continue;
        }
        steps.push({
          ...base,
          atWord: m.atWord,
          ...(m.instruction.trim() ? { instruction: m.instruction.trim().slice(0, 200) } : {}),
          credits: 0,
        });
        break;
      }
    }
    seen.add(key);
  }
  return { reply: clip(out.reply.trim() || 'Here’s the plan', 240), steps, dropped, source };
}

// ---------------------------------------------------------------------------------------------
// Code-built plans for the suggestion chips (no model, free)

export type ChipId =
  | 'fill'
  | 'pictures'
  | 'brand'
  | 'title'
  | 'captions'
  | 'vertical'
  | 'overlays'
  | 'cutaways'
  | 'toggleCuts'
  // Video reels (spec 37)
  | 'reelColour'
  | 'reelSfx'
  | 'reelMusic'
  | 'reelLook';

export interface Chip {
  id: ChipId;
  label: string;
}

const needsFill = (p: EditorProject) =>
  p.slots.filter((s) => s.status === 'suggested' || s.status === 'failed');

/** Ready graphics that take a picture and have none yet, in time order. */
export function needsPicture(p: EditorProject) {
  const have = new Set(assetsInUse(p).map((a) => a.id));
  return [...p.slots]
    .filter((s) => s.status === 'ready' && imageRoleOf(s.componentId) !== null)
    .filter((s) => {
      const id = (s.params as { images?: { assetId?: string }[] }).images?.[0]?.assetId;
      return !id || !have.has(id);
    })
    .sort((a, b) => a.startMs - b.startMs);
}

/** A subject the image model accepts: the suggested one with any refused words taken out. */
export function cleanSubject(raw: string): string | null {
  let s = raw.replace(/["“”]/g, '').trim();
  if (ImageSubjectSchema.safeParse(s).success) return s;
  s = s
    .split(/\s+/)
    .filter((w) => ImageSubjectSchema.safeParse(`a ${w} b`).success)
    .join(' ');
  return ImageSubjectSchema.safeParse(s).success ? s : null;
}

/** A vivid pair that lifts either house look (ember into violet). */
export const REEL_DEFAULT_THEME = { accent: '#FF5A36', accent2: '#7C5CFF' } as const;

/** Chips for a Reel-engine project (spec 37): adapts to graphics-only vs voiced/video reels. */
function reelChips(project: EditorProject): Chip[] {
  const r = project.reel!;
  const graphicOnly = Boolean(r.graphicOnly && !project.video);
  if (graphicOnly) {
    const out: Chip[] = [
      {
        id: 'reelColour',
        label: r.theme ? 'Back to the look’s own colours' : 'Add colour and gradients',
      },
      { id: 'reelLook', label: r.look === 'mono' ? 'Try the cream look' : 'Try the mono look' },
      { id: 'brand', label: 'Use brand colours everywhere' },
    ];
    if (project.format !== '9:16') out.push({ id: 'vertical', label: 'Make a vertical version' });
    return out;
  }
  const a = audioOf(project);
  const hasMusic = !!r.music?.src || a.musicId === 'calm-pad' || a.musicId === 'steady-pulse';
  return [
    {
      id: 'reelColour',
      label: r.theme ? 'Back to the look’s own colours' : 'Add colour and gradients',
    },
    { id: 'reelSfx', label: a.autoSfx ? 'Turn sound effects off' : 'Turn sound effects on' },
    { id: 'reelMusic', label: hasMusic ? 'Remove the music' : 'Add a calm music bed' },
    { id: 'captions', label: r.captions ? 'Turn captions off' : 'Add captions' },
    { id: 'reelLook', label: r.look === 'mono' ? 'Try the cream look' : 'Try the mono look' },
  ];
}

/** The chips that make sense for this project right now (empty state). */
export function chipsFor(project: EditorProject): Chip[] {
  if (project.reel && project.slots.length === 0) return reelChips(project);
  const out: Chip[] = [];
  if (project.video) {
    const anyCutaway = project.slots.some((s) => s.placement !== 'overlay');
    if (project.slots.length > 0) {
      out.push(
        anyCutaway
          ? { id: 'overlays', label: 'Float graphics as overlays over speaker' }
          : { id: 'cutaways', label: 'Make graphics full-screen cutaways' },
      );
    }
    if (project.video.cuts.length > 0) {
      const anyEnabled = project.video.cuts.some((c) => c.enabled);
      out.push({
        id: 'toggleCuts',
        label: anyEnabled ? 'Restore all AI video cuts' : 'Re-apply AI video cuts',
      });
    }
  }
  const empty = needsFill(project).length;
  if (empty > 0)
    out.push({ id: 'fill', label: `Fill the ${empty} empty slot${empty === 1 ? '' : 's'}` });
  const pics = needsPicture(project).length;
  if (pics > 0)
    out.push({ id: 'pictures', label: `Add pictures to ${pics} graphic${pics === 1 ? '' : 's'}` });
  out.push({ id: 'brand', label: 'Use brand colours everywhere' });
  const first = [...project.slots].sort((a, b) => a.startMs - b.startMs)[0];
  if (!first || first.startMs > 600)
    out.push({ id: 'title', label: 'Add an opening title at 0:00' });
  const cap = project.captions ?? DEFAULT_CAPTIONS;
  out.push({ id: 'captions', label: cap.enabled ? 'Turn captions off' : 'Add captions' });
  if (project.format !== '9:16') out.push({ id: 'vertical', label: 'Make a vertical version' });
  return out.slice(0, 5);
}

/** Pip's answer to the brand chip before any brand kit is saved (the panel opens with it). */
export const NO_BRAND_YET = 'Pick your brand colours first. I opened the Brand panel for you.';

export function codePlan(
  chip: ChipId,
  project: EditorProject,
  cfg: CostConfig = APP_CONFIG_DEFAULTS,
  /** The creator's saved brand kit (Brand panel), for the brand chip. */
  savedBrand: Brand | null = null,
): PipPlan {
  const step = (s: Omit<PipStep, 'id' | 'include'>, i: number): PipStep => ({
    ...s,
    id: `step-${i + 1}`,
    include: true,
  });
  const plan = (reply: string, steps: Omit<PipStep, 'id' | 'include'>[]): PipPlan => ({
    reply,
    steps: steps.slice(0, PIP_MAX_STEPS).map(step),
    dropped: [],
    source: 'code',
  });
  switch (chip) {
    case 'fill':
      return plan(
        'Here’s the plan',
        needsFill(project)
          .sort((a, b) => a.startMs - b.startMs)
          .map((s) => ({
            action: 'generateSlot' as const,
            slotId: s.id,
            label: clip(`Fill ${slotCardText(s).title}`, 60),
            credits: stepCredits('generateSlot', cfg),
          })),
      );
    case 'pictures': {
      const cap = 6;
      const steps = needsPicture(project)
        .slice(0, Math.min(8, cap))
        .flatMap((s) => {
          const subject = cleanSubject(suggestSubject(s));
          const role = imageRoleOf(s.componentId);
          if (!subject || !role) return [];
          return [
            {
              action: 'addImage' as const,
              slotId: s.id,
              instruction: subject,
              label: clip(`Picture: ${subject}`, 60),
              credits: costOf('image', 1, cfg),
            },
          ];
        });
      return steps.length
        ? plan('A picture for each, painted in your look', steps)
        : plan(
            'No graphic here takes a picture yet. Stats, lines, lists, quotes and photos do.',
            [],
          );
    }
    case 'brand': {
      if (!savedBrand) return plan(NO_BRAND_YET, []);
      if (project.reel)
        return plan('Your brand colours across the reel', [
          {
            action: 'setReelTheme',
            theme: {
              accent: savedBrand.accent,
              ...(savedBrand.accent2 ? { accent2: savedBrand.accent2 } : {}),
              background: 'soft',
            },
            label: 'Use my brand colours',
            credits: 0,
          },
        ]);
      if (
        project.brand?.accent.toLowerCase() === savedBrand.accent.toLowerCase() &&
        (project.brand.accent2 ?? '').toLowerCase() === (savedBrand.accent2 ?? '').toLowerCase()
      )
        return plan('Every graphic already wears your brand colours', []);
      return plan('Your brand colours on every graphic, captions too', [
        { action: 'setBrand', brand: savedBrand, label: 'Use my brand colours', credits: 0 },
      ]);
    }
    case 'title': {
      const first = project.transcript.words.findIndex((w) => !w.filler);
      return first < 0
        ? plan('There are no words to put a title on yet', [])
        : plan('Here’s the plan', [
            {
              action: 'addSlot',
              atWord: first,
              componentId: isDetectable('hook-statement') ? 'hook-statement' : undefined,
              instruction: 'An opening title for the video',
              label: 'Add opening title',
              credits: 0,
            } as Omit<PipStep, 'id' | 'include'>,
          ]);
    }
    case 'captions': {
      const on = project.reel
        ? project.reel.captions
        : (project.captions ?? DEFAULT_CAPTIONS).enabled;
      return plan('Done in one step', [
        {
          action: 'setCaptions',
          captions: on ? 'off' : 'on',
          label: on ? 'Turn captions off' : 'Turn captions on',
          credits: 0,
        },
      ]);
    }
    case 'vertical':
      return plan('Re-laid out for vertical', [
        { action: 'setFormat', format: '9:16', label: 'Switch to 9:16', credits: 0 },
      ]);
    case 'overlays':
      return plan('Floating every graphic over the speaker', [
        {
          action: 'setPlacement',
          placement: 'overlay',
          label: 'Make graphics transparent overlays',
          credits: 0,
        },
      ]);
    case 'cutaways':
      return plan('Switching graphics to full-screen cutaways', [
        {
          action: 'setPlacement',
          placement: 'cutaway',
          label: 'Make graphics full-screen',
          credits: 0,
        },
      ]);
    case 'toggleCuts': {
      const anyEnabled = Boolean(project.video?.cuts.some((c) => c.enabled));
      return plan(anyEnabled ? 'Restoring the trimmed moments' : 'Applying your AI video cuts', [
        {
          action: 'toggleCuts',
          cutEnabled: !anyEnabled,
          label: anyEnabled ? 'Restore all video cuts' : 'Apply AI video cuts',
          credits: 0,
        },
      ]);
    }
    case 'reelColour': {
      const r = project.reel;
      if (!r) return plan('This project has no reel', []);
      return r.theme
        ? plan('Back to the look’s own colours', [
            { action: 'setReelTheme', label: 'Use the look’s colours', credits: 0 },
          ])
        : plan('Colour and soft gradients on every scene. Ask me for any colours you like.', [
            {
              action: 'setReelTheme',
              theme: { ...REEL_DEFAULT_THEME, background: 'soft' },
              label: 'Ember and violet, soft gradient',
              credits: 0,
            },
          ]);
    }
    case 'reelSfx': {
      const on = audioOf(project).autoSfx;
      return plan(on ? 'Quiet it is' : 'Every reveal gets its sound', [
        {
          action: 'setSound',
          sound: on ? 'off' : 'on',
          label: on ? 'Sound effects off' : 'Sound effects on',
          credits: 0,
        },
      ]);
    }
    case 'reelMusic': {
      const a = audioOf(project);
      const has =
        !!project.reel?.music?.src || a.musicId === 'calm-pad' || a.musicId === 'steady-pulse';
      return has
        ? plan('Just your voice and the effects', [
            { action: 'setMusic', music: 'none', label: 'Remove the music', credits: 0 },
          ])
        : plan('A calm bed under your voice. Ask me for any mood and I’ll write new music.', [
            { action: 'setMusic', music: 'calm-pad', label: 'Calm music bed', credits: 0 },
          ]);
    }
    case 'reelLook': {
      const next = project.reel?.look === 'mono' ? 'cream' : 'mono';
      return plan(next === 'cream' ? 'Warm and editorial' : 'Clean and bold', [
        {
          action: 'setReelLook',
          look: next,
          label: next === 'cream' ? 'Switch to cream' : 'Switch to mono',
          credits: 0,
        },
      ]);
    }
  }
}
