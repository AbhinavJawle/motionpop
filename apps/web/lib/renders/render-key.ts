import { projectCompileInput, assetsInUse } from '@motionpop/motion/compiler';
import { sha256Hex, stableJson, type EditorProject, type RenderOptions } from '@motionpop/schemas';

/**
 * Bump when the composition or the render pipeline changes what an identical export looks like,
 * so old renders are not reused for it.
 */
export const RENDER_KEY_VERSION = 1;

/**
 * The identity of an export (spec 13b R2): the same project content, assets, options and voice
 * give the same key. The job compiles the composition from `projectCompileInput`, so this hashes
 * that input rather than the compiled HTML: the HTML needs the built runtime bundle, which the
 * web server does not always have. Assets are hashed by their source, sorted, so their order
 * doesn't matter.
 */
export function renderKeyOf(input: {
  project: EditorProject;
  options: RenderOptions;
  voicePath: string;
}): string {
  const { project, options, voicePath } = input;
  const assets = assetsInUse(project)
    .map((a) => sha256Hex(a.src ?? ''))
    .sort();
  return sha256Hex(
    stableJson({
      version: RENDER_KEY_VERSION,
      compile: projectCompileInput(project, { mode: 'render', format: options.format }),
      assets,
      options,
      voicePath,
    }),
  );
}
