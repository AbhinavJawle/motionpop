import type { CreditsClient } from '@/lib/credits/client';
import { setReel } from '@/lib/commands';
import { editorStore } from '@/lib/stores/editor';
import { directReelPaid, resolveReelMedia } from './media';

/**
 * Directs the open project's reel again (spec 25 R4.1, spec 26 R5.1): the cloud director when it
 * is available (charged, price on the button; refunded if it fails), else the free one. Then the
 * new plan's pictures are fetched (illustrations charged per picture). One undo step.
 */
export async function regenerateReel(
  opts: { free?: boolean; credits?: CreditsClient | null } = {},
): Promise<'cloud' | 'auto'> {
  const { project } = editorStore.getState();
  if (!project?.reel) throw new Error('This project has no reel');
  const words = project.transcript.words.map((w) => ({
    text: w.text,
    startMs: w.startMs,
    endMs: w.endMs,
  }));
  const credits = opts.credits ?? null;
  const r = await directReelPaid(
    { look: project.reel.look, words, durationMs: project.durationMs, refId: project.id },
    { credits, free: opts.free ?? false },
  );
  const media = await resolveReelMedia(r.plan, project.reel.look, project.id, {
    credits,
    existing: project.assets ?? [],
  }).catch(() => ({ plan: r.plan, assets: [] }));
  const plan = { ...media.plan, focus: project.reel.focus, captions: project.reel.captions };
  const { exec } = editorStore.getState();
  exec(setReel(plan, 'Re-direct the reel', media.assets));
  return r.source;
}
