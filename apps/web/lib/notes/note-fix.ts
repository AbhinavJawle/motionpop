import {
  applyParamsPatch,
  editContext,
  noteFixTask,
  splitEditDoc,
  timingDefaultsFor,
  type Router,
} from '@motionpop/ai';
import type { AppConfig, Slot } from '@motionpop/schemas';
import { APP_CONFIG_DEFAULTS, FORMATS } from '@motionpop/schemas';
import type { Route } from '@/lib/ai/route';
import { applyVersion, composite, setNoteStatus } from '@/lib/commands';
import { sameSlot } from '@/lib/commands/auto-fill';
import { styleFor } from '@/lib/composition/project-to-compile';
import { newSpendKey, type CreditsClient } from '@/lib/credits/client';
import { spendWithUi } from '@/lib/credits/spend-with-ui';
import { sceneFor, schemaFor } from '@/lib/motion/registry';
import { newVersion } from '@/lib/slots/new-version';
import type { QuickEditOutcome } from '@/lib/slots/quick-edit';
import { sceneGate } from '@/lib/slots/scene-fill';
import type { EditorStore } from '@/lib/stores/editor';
import { cropRect, regionOf, type Region } from './geometry';

/**
 * Frame note → `note.fix` (spec 09 R8.3 to R8.5, design "Flows → Frame note" step 4). Routed,
 * checked, charged and refunded exactly like the quick edit (it shares its outcome type): the
 * device is free and never falls back to the cloud by itself (D-035); the cloud is a click and
 * costs 1 credit, reserved first with a new key per attempt (D-047) and returned when nothing was
 * applied. On success the patch becomes one version labelled with the note text and the note is
 * marked `fixed` with that version, in one undo step.
 */
export interface NoteFixDeps {
  store: EditorStore;
  credits: CreditsClient | null;
  getRouter: () => Promise<Router | null>;
  /**
   * What the preview shows inside a crop: the texts of the elements there and a JPEG (data URL)
   * when frame capture works. Returns nothing it can't get; the note then goes without.
   */
  look: (crop: Region) => Promise<{ regionText: string[]; image?: string | undefined }>;
  config?: Pick<AppConfig, 'creditCosts' | 'imageCredits' | 'exportCredits'>;
  doc?: Document;
  now?: () => number;
  newKey?: () => string;
}

const sameTiming = (a: Slot['timing'], b: Slot['timing']) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The base64 part of a JPEG data URL, or undefined for anything else or anything too big. */
export function jpegBase64(url: string | undefined): string | undefined {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(url ?? '');
  return m?.[1] && m[1].length <= 400_000 ? m[1] : undefined;
}

export async function runNoteFix(
  deps: NoteFixDeps,
  slotId: string,
  noteId: string,
  route: Route,
): Promise<QuickEditOutcome> {
  if (route.kind === 'disabled') return { kind: 'blocked', reason: route.reason };
  if (route.kind === 'local') return { kind: 'blocked', reason: 'Needs on-device AI' };
  const project = deps.store.getState().project;
  const slot = project?.slots.find((s) => s.id === slotId);
  const note = slot?.notes.find((n) => n.id === noteId);
  if (!project || !slot || !note) return { kind: 'changed' };
  const schema = schemaFor(slot.componentId);
  if (!schema) return { kind: 'blocked', reason: 'Coming soon' };
  const text = note.text.trim();
  if (text === '') return { kind: 'blocked', reason: 'Type what to change' };

  const defaults = timingDefaultsFor(styleFor(project).motion);
  const ctx = editContext(schema, slot.componentId, slot.params, slot.timing, defaults);
  const scene = sceneFor(slot.componentId);
  const gateFor = scene ? sceneGate(scene, project, slot, deps.doc) : null;

  let txId: string | null = null;
  if (route.kind === 'cloud') {
    if (!deps.credits) return { kind: 'blocked', reason: 'Sign in to use cloud AI' };
    const spent = await spendWithUi(
      deps.credits,
      { action: 'edit', key: (deps.newKey ?? newSpendKey)(), refId: slot.id },
      deps.config ?? APP_CONFIG_DEFAULTS,
    );
    if (spent === null) return { kind: 'no-credits' };
    if (!spent.ok) {
      return spent.reason === 'insufficient'
        ? { kind: 'no-credits' }
        : { kind: 'blocked', reason: 'Couldn’t reserve the credit' };
    }
    txId = spent.txId;
  }
  const refund = async () => {
    if (txId && deps.credits) await deps.credits.refund(txId);
  };
  const failed = (): QuickEditOutcome =>
    route.kind === 'cloud' ? { kind: 'cloud-failed' } : { kind: 'device-failed' };

  const router = await deps.getRouter().catch(() => null);
  if (!router) {
    await refund();
    return failed();
  }

  const size = FORMATS[project.format];
  const region = regionOf(note.shape, size.width / size.height);
  const seen: { regionText: string[]; image?: string | undefined } = await deps
    .look(cropRect(region))
    .catch(() => ({ regionText: [] }));
  const image = jpegBase64(seen.image);

  const task = noteFixTask(schemaFor, {
    timingDefaults: defaults,
    ...(gateFor ? { gate: (_id: string, params: unknown) => gateFor.check(params) } : {}),
  });
  let res;
  try {
    res = await router.run(
      task,
      {
        ...ctx,
        note: { text, tMs: note.tMs, region },
        regionText: seen.regionText.slice(0, 8),
        ...(image ? { image } : {}),
      },
      { mode: route.mode, allowCloud: false },
    );
  } catch {
    await refund();
    return failed();
  }

  // The slot, or the note, moved on while the model worked: never overwrite what the user did.
  const now = deps.store.getState().project?.slots.find((s) => s.id === slotId);
  const nowNote = now?.notes.find((n) => n.id === noteId);
  if (
    !now ||
    !nowNote ||
    nowNote.status !== 'open' ||
    !sameSlot(now, slot) ||
    !sameTiming(now.timing, slot.timing)
  ) {
    await refund();
    return { kind: 'changed' };
  }

  if (res.output.escalate) {
    await refund();
    return {
      kind: 'escalate',
      message: res.output.message?.trim() || 'That needs a new graphic. Try Generate.',
    };
  }
  const applied = applyParamsPatch(ctx.current, res.output.patch);
  if (!applied.ok) {
    await refund();
    return failed();
  }
  const { params, timing } = splitEditDoc(applied.params, defaults);
  const ranOn = res.ranOn === 'cloud' ? 'cloud' : 'device';
  const version = newVersion({
    slotId,
    componentId: slot.componentId,
    params,
    timing,
    source: ranOn === 'cloud' ? 'ai-cloud' : 'ai-device',
    model: res.model,
    costCredits: ranOn === 'cloud' ? res.costCredits : 0,
    label: text,
    now: (deps.now ?? Date.now)(),
  });
  const ok = deps.store
    .getState()
    .exec(
      composite('Fix note', [
        applyVersion(slotId, { params, timing, version }),
        setNoteStatus(slotId, noteId, 'fixed', version.id),
      ]),
    );
  if (!ok) {
    await refund();
    return { kind: 'changed' };
  }
  return { kind: 'applied', ms: res.latencyMs, ranOn, versionId: version.id };
}
