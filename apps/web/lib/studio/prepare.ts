import { sanitizeProjectContext } from '@pireel/studio-engine/project-context';
import type { StudioProjectDto } from '@pireel/studio-engine/project-dto';
import type { EditorProject } from '@motionpop/schemas';
import { appAudioStore } from '../audio/app-audio-store';
import { projectLibrary } from '../projects/use-project-list';
import { buildStudioDocument } from './bridge';
import { putStudioDocument } from './studio-store';

export const isVideo = (blob: Blob) => blob.type.startsWith('video/');

/** The recording a project was made from, when it is a video. */
export async function projectVideo(project: EditorProject): Promise<File | null> {
  const ref = project.voiceover.originalSrc ?? project.voiceover.src;
  const blob = await appAudioStore().get(ref);
  if (!blob || !isVideo(blob)) return null;
  return blob instanceof File ? blob : new File([blob], project.title, { type: blob.type });
}

/** Builds the edited studio document for a processed video project and leaves it for the studio. */
export async function prepareStudio(projectId: string): Promise<boolean> {
  const r = await projectLibrary().load(projectId);
  if (!r.ok) return false;
  const video = await projectVideo(r.project);
  if (!video) return false;
  const document = await buildStudioDocument(r.project, video);
  const dto: StudioProjectDto = {
    id: projectId,
    title: r.project.title,
    document,
    context: sanitizeProjectContext({}),
    videoSig: null,
    videoDurationSec: r.project.durationMs / 1000,
    coverThumb: null,
    version: 1,
    updatedAt: Date.now(),
  };
  await putStudioDocument(dto);
  return true;
}
