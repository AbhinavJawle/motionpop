import { DETECT_CATALOGUE, catalogueEntry, isDetectable, type PipPlanInput } from '@motionpop/ai';
import {
  APP_CONFIG_DEFAULTS,
  DEFAULT_CAPTIONS,
  FormatSchema,
  PipCaptionChoiceSchema,
  costOf,
  type CostConfig,
  type EditorProject,
  type PipModelOutput,
  type PipPlan,
  type PipScope,
  type PipStep,
} from '@motionpop/schemas';
import { slotCardText } from '@/lib/editor/slot-display';
import { styleOptions } from '@/lib/inspector/timing-view';

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
    }
    seen.add(key);
  }
  return { reply: clip(out.reply.trim() || 'Here’s the plan', 240), steps, dropped, source };
}

// ---------------------------------------------------------------------------------------------
// Code-built plans for the suggestion chips (no model, free)

export type ChipId = 'fill' | 'brand' | 'title' | 'captions' | 'vertical';

export interface Chip {
  id: ChipId;
  label: string;
}

const needsFill = (p: EditorProject) =>
  p.slots.filter((s) => s.status === 'suggested' || s.status === 'failed');

/** The chips that make sense for this project right now (empty state). */
export function chipsFor(project: EditorProject): Chip[] {
  const out: Chip[] = [];
  const empty = needsFill(project).length;
  if (empty > 0)
    out.push({ id: 'fill', label: `Fill the ${empty} empty slot${empty === 1 ? '' : 's'}` });
  out.push({ id: 'brand', label: 'Use brand colours everywhere' });
  const first = [...project.slots].sort((a, b) => a.startMs - b.startMs)[0];
  if (!first || first.startMs > 600)
    out.push({ id: 'title', label: 'Add an opening title at 0:00' });
  const cap = project.captions ?? DEFAULT_CAPTIONS;
  out.push({ id: 'captions', label: cap.enabled ? 'Turn captions off' : 'Add captions' });
  if (project.format !== '9:16') out.push({ id: 'vertical', label: 'Make a vertical version' });
  return out.slice(0, 5);
}

/** The brand look: the first polished look other than the current style, else the first style. */
function brandStyleId(project: EditorProject): string | null {
  const opts = styleOptions();
  return (
    (
      opts.find((s) => s.id !== project.styleId && 'craft' in s) ??
      opts.find((s) => s.id !== project.styleId)
    )?.id ?? null
  );
}

export function codePlan(
  chip: ChipId,
  project: EditorProject,
  cfg: CostConfig = APP_CONFIG_DEFAULTS,
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
    case 'brand': {
      const id = brandStyleId(project);
      return id
        ? plan('One look for the whole video', [
            { action: 'setStyle', styleId: id, label: 'Apply the brand look', credits: 0 },
          ])
        : plan('Your video already uses the only look', []);
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
  }
}
