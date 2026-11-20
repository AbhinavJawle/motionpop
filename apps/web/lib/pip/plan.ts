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
  PipCaptionChoiceSchema,
  SlotPlacementSchema,
  VideoStageModeSchema,
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
    },
    history: history.slice(-6).map((h) => ({ role: h.role, text: h.text.slice(0, 400) })),
    message: message.slice(0, 1000),
  };
}

/** Credits a step spends when applied: only a cloud regeneration costs (quick edits route per user). */
export function stepCredits(
  action: PipStep['action'],
  cfg: CostConfig = APP_CONFIG_DEFAULTS,
): number {
  return action === 'generateSlot' ? costOf('generate', 1, cfg) : 0;
}

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
  const styleIds = new Set(styleOptions().map((s) => s.id));
  const steps: PipStep[] = [];
  const dropped: PipPlan['dropped'] = [];
  const seen = new Set<string>();
  const drop = (label: string, reason: string) =>
    dropped.length < 8 && dropped.push({ label: clip(label || 'A step', 60), reason });

  for (const m of out.steps.slice(0, 8)) {
    const label = clip(m.label.trim() || m.action, 60);
    const slotId = refs.get(m.slot);
    const base = { id: `step-${steps.length + 1}`, action: m.action, label, include: true };
    const key = `${m.action}:${slotId ?? ''}:${m.choice}`;
    if (seen.has(key)) continue;
    switch (m.action) {
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
          drop(label, 'Choose full, split-left, split-right, pip, backdrop, or cutaway');
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
  | 'toggleCuts';

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

/** The chips that make sense for this project right now (empty state). */
export function chipsFor(project: EditorProject): Chip[] {
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
    steps: steps.slice(0, 8).map(step),
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
      const on = (project.captions ?? DEFAULT_CAPTIONS).enabled;
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
  }
}
