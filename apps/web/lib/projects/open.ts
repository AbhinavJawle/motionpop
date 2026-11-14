import type { EditorProject } from '@motionpop/schemas';
import { encodeWav, synthVoice } from '../audio/synth-voice';
import { DEMO_PROJECT_ID, demoProject, synthRate } from './fixture';
import { PERF_PROJECT_ID, perfProject } from './perf-fixture';
import type { LoadResult, ProjectRepository } from './repository';

/**
 * Opens a project for the editor: the saved copy if there is one, else the demo fixture for
 * `/editor/demo` (or the 3,000-word perf fixture for `/editor/perf`). A corrupt save is returned as-is so the UI can offer "Restore last good version".
 */
export async function openProject(
  id: string,
  repo: ProjectRepository,
  now: () => number = Date.now,
): Promise<LoadResult> {
  const r = await repo.load(id);
  if (r.ok || r.error === 'invalid') return r;
  if (id === DEMO_PROJECT_ID) return { ok: true, project: demoProject(now()) };
  if (id === PERF_PROJECT_ID) return { ok: true, project: perfProject(now()) };
  return r;
}

/**
 * A playable URL for the project's voiceover. The demo voice is synthesized from the word
 * timings; real projects use their stored audio (spec 05). The caller revokes blob URLs.
 */
export function voiceUrl(project: EditorProject): string {
  const rate = synthRate(project.voiceover.src);
  if (rate === null) return project.voiceover.src;
  const samples = synthVoice(project.transcript.words, project.voiceover.durationMs, 1, rate);
  return URL.createObjectURL(new Blob([encodeWav(samples, rate)], { type: 'audio/wav' }));
}
