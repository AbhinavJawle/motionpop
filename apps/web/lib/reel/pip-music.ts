import { appAudioStore } from '@/lib/audio/app-audio-store';
import { composite, setAudio, setReelMusicBrief } from '@/lib/commands';
import type { EditorStore } from '@/lib/stores/editor';
import { resolveReelMusic } from './media';

/**
 * New music for the reel from a brief (spec 37 R3.2): the same generator the reel's first pass
 * uses. The track replaces any synthesised bed; one undo step. False when no music came back.
 */
export async function makeReelMusic(
  store: EditorStore,
  brief: string,
  deps: { resolve?: typeof resolveReelMusic } = {},
): Promise<boolean> {
  const p = store.getState().project;
  const text = brief.trim().slice(0, 300);
  if (!p?.reel || text.length < 3) return false;
  const next = await (deps.resolve ?? resolveReelMusic)(
    { ...p.reel, music: { brief: text } },
    p.durationMs,
    p.id,
    { audioStore: appAudioStore() },
  );
  const src = next.music?.src;
  if (!src) return false;
  return store
    .getState()
    .exec(composite('New music', [setReelMusicBrief(text, src), setAudio({ musicId: undefined })]));
}
