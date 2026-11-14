import type { EditorProject } from '@motionpop/schemas';
import { encodeWav, synthVoice, SYNTH_SAMPLE_RATE } from '../audio/synth-voice';
import { DEMO_PROJECT_ID, DEMO_VOICE_SRC, demoProject } from './fixture';
import type { LoadResult, ProjectRepository } from './repository';

/**
 * Opens a project for the editor: the saved copy if there is one, else the demo fixture for
 * `/editor/demo`. A corrupt save is returned as-is so the UI can offer "Restore last good version".
 */
export async function openProject(
  id: string,
  repo: ProjectRepository,
  now: () => number = Date.now,
): Promise<LoadResult> {
  const r = await repo.load(id);
  if (r.ok || r.error === 'invalid' || id !== DEMO_PROJECT_ID) return r;
  return { ok: true, project: demoProject(now()) };
}

/**
 * A playable URL for the project's voiceover. The demo voice is synthesized from the word
 * timings; real projects use their stored audio (spec 05). The caller revokes blob URLs.
 */
export function voiceUrl(project: EditorProject): string {
  if (project.voiceover.src !== DEMO_VOICE_SRC) return project.voiceover.src;
  const samples = synthVoice(project.transcript.words, project.voiceover.durationMs, 1, SYNTH_SAMPLE_RATE);
  return URL.createObjectURL(new Blob([encodeWav(samples)], { type: 'audio/wav' }));
}
