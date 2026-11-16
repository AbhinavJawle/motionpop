// Moved to packages/motion (spec 08 task 4): one compile input for the preview and the render.
import { projectCompileInput } from '@motionpop/motion/compiler';
import type { CompileInput } from '@motionpop/motion/compiler';
import type { EditorProject } from '@motionpop/schemas';

export {
  compileSlot,
  isRenderable,
  projectCompileInput,
  styleFor,
} from '@motionpop/motion/compiler';

/**
 * The compiler input for the editor preview. The preview player stays muted: the editor plays
 * the voiceover itself as the master clock (spec 04 R5.1), so no `voiceSrc` here.
 */
export function previewCompileInput(project: EditorProject): CompileInput {
  return projectCompileInput(project, { mode: 'preview' });
}
