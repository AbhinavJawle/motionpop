import { directReel } from '@motionpop/ai';
import { getRouter } from '@/lib/ai/router-client';
import { setReel } from '@/lib/commands';
import { editorStore } from '@/lib/stores/editor';

/**
 * Directs the open project's reel again (spec 25 R4.1): the cloud director when it is available
 * (3 credits, shown on the button), else the free one. One undo step.
 */
export async function regenerateReel(opts: { free?: boolean } = {}): Promise<'cloud' | 'auto'> {
  const { project, exec } = editorStore.getState();
  if (!project?.reel) throw new Error('This project has no reel');
  const router = opts.free ? null : await getRouter().catch(() => null);
  const words = project.transcript.words.map((w) => ({
    text: w.text,
    startMs: w.startMs,
    endMs: w.endMs,
  }));
  const r = await directReel(router, {
    look: project.reel.look,
    words,
    durationMs: project.durationMs,
  });
  const plan = { ...r.plan, focus: project.reel.focus, captions: project.reel.captions };
  exec(setReel(plan, 'Re-direct the reel'));
  return r.source;
}
