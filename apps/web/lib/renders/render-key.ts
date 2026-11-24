import { projectCompileInput, assetsInUse } from '@motionpop/motion/compiler';
import { sha256Hex, stableJson, type EditorProject, type RenderOptions } from '@motionpop/schemas';

/**
 * Bump when the composition or the render pipeline changes what an identical export looks like,
 * so old renders are not reused for it.
 */
export const RENDER_KEY_VERSION = 1;

/**
 * The composition runtime's version (spec 13b, D-075). An export made by an older runtime must not
 * be reused after an engine update, so this is hashed into every key. The web server cannot read
 * the built runtime bundle, so bump this string with any change to packages/motion's runtime,
 * compiler or engine output.
 */
export const RUNTIME_VERSION = '07c-engine-v2';

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
  stockOverlayPaths?: Readonly<Record<string, string>>;
  stockAudioPaths?: Readonly<Record<string, string>>;
  /** Defaults to RUNTIME_VERSION; tests pass another to check that the key changes. */
  runtimeVersion?: string;
}): string {
  const {
    project,
    options,
    voicePath,
    stockOverlayPaths,
    stockAudioPaths,
    runtimeVersion = RUNTIME_VERSION,
  } = input;
  const assets = assetsInUse(project)
    .map((a) => sha256Hex(a.src ?? ''))
    .sort();
  return sha256Hex(
    stableJson({
      version: RENDER_KEY_VERSION,
      runtime: runtimeVersion,
      compile: projectCompileInput(project, {
        mode: 'render',
        format: options.format,
        ...(options.transparent ? { background: 'transparent' } : {}),
      }),
      assets,
      options,
      voicePath,
      ...(project.stockOverlays?.length ? { stockOverlays: project.stockOverlays } : {}),
      ...(project.stockAudio?.length ? { stockAudio: project.stockAudio } : {}),
      ...(project.stockMediaLanes?.length ? { stockMediaLanes: project.stockMediaLanes } : {}),
      ...(project.stockAudioLanes?.length ? { stockAudioLanes: project.stockAudioLanes } : {}),
      ...(stockOverlayPaths && Object.keys(stockOverlayPaths).length ? { stockOverlayPaths } : {}),
      ...(stockAudioPaths && Object.keys(stockAudioPaths).length ? { stockAudioPaths } : {}),
      ...(project.video?.cuts.length ? { videoCuts: project.video.cuts } : {}),
    }),
  );
}
