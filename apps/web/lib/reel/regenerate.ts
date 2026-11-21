import type { CreditsClient } from '@/lib/credits/client';
import { setReel } from '@/lib/commands';
import { editorStore } from '@/lib/stores/editor';
import { appAudioStore } from '@/lib/audio/app-audio-store';
import { directReelPaid, resolveReelMedia, resolveReelMusic } from './media';

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
  // The footage did not change: keep what the first pass saw (face keys, footage kind). A new
  // music brief gets new music; otherwise the old track stays.
  const prev = project.reel;
  const sameBrief = !r.plan.music || r.plan.music.brief === prev.music?.brief;
  const scored = sameBrief
    ? r.plan
    : await resolveReelMusic(media.plan, project.durationMs, project.id, {
        audioStore: appAudioStore(),
      });
  const plan = {
    ...media.plan,
    focus: prev.focus,
    ...(prev.footage ? { footage: prev.footage } : {}),
    ...(sameBrief ? (prev.music ? { music: prev.music } : {}) : scored.music ? { music: scored.music } : {}),
    captions: prev.captions,
  };
  const { exec } = editorStore.getState();
  exec(setReel(plan, 'Re-direct the reel', media.assets));
  return r.source;
}
