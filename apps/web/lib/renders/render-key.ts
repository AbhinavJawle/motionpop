import { projectCompileInput, assetsInUse } from '@motionpop/motion/compiler';
import {
  reelMediaOf,
  sha256Hex,
  stableJson,
  type EditorProject,
  type RenderOptions,
} from '@motionpop/schemas';

/**
 * Bump when the composition or the render pipeline changes what an identical export looks like,
 * so old renders are not reused for it.
 */
export const RENDER_KEY_VERSION = 2;

/**
 * The composition runtime's version (spec 13b, D-075). An export made by an older runtime must not
 * be reused after an engine update, so this is hashed into every key. The web server cannot read
 * the built runtime bundle, so bump this string with any change to packages/motion's runtime,
 * compiler or engine output.
 */
export const RUNTIME_VERSION = '07c-engine-v3';

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
  videoPath?: string;
  clipPaths?: Readonly<Record<string, string>>;
  stockOverlayPaths?: Readonly<Record<string, string>>;
  stockAudioPaths?: Readonly<Record<string, string>>;
  /** Defaults to RUNTIME_VERSION; tests pass another to check that the key changes. */
  runtimeVersion?: string;
}): string {
  const {
    project,
    options,
    voicePath,
    videoPath,
    clipPaths,
    stockOverlayPaths,
    stockAudioPaths,
    runtimeVersion = RUNTIME_VERSION,
  } = input;
  const assetSrcs = new Set(assetsInUse(project).map((a) => a.src ?? ''));
  if (project.reel) {
    const wanted = new Set(reelMediaOf(project.reel).flatMap((m) => (m.asset ? [m.asset] : [])));
    for (const a of project.assets ?? []) {
      if (wanted.has(a.id) && a.status === 'ready') assetSrcs.add(a.src ?? '');
    }
  }
  const assets = [...assetSrcs].map((src) => sha256Hex(src)).sort();
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
      ...(videoPath ? { videoPath } : {}),
      ...(clipPaths && Object.keys(clipPaths).length ? { clipPaths } : {}),
      ...(project.reel ? { reel: project.reel } : {}),
      ...(project.audio ? { audio: project.audio } : {}),
      ...(project.mediaBin?.length ? { mediaBin: project.mediaBin } : {}),
      ...(project.stockOverlays?.length ? { stockOverlays: project.stockOverlays } : {}),
      ...(project.stockAudio?.length ? { stockAudio: project.stockAudio } : {}),
      ...(project.stockMediaLanes?.length ? { stockMediaLanes: project.stockMediaLanes } : {}),
      ...(project.stockAudioLanes?.length ? { stockAudioLanes: project.stockAudioLanes } : {}),
      ...(stockOverlayPaths && Object.keys(stockOverlayPaths).length ? { stockOverlayPaths } : {}),
      ...(stockAudioPaths && Object.keys(stockAudioPaths).length ? { stockAudioPaths } : {}),
      ...(project.video?.cuts.length ? { videoCuts: project.video.cuts } : {}),
      ...(project.video?.punchIns.length ? { videoPunchIns: project.video.punchIns } : {}),
      ...(project.video?.stages?.length ? { videoStages: project.video.stages } : {}),
    }),
  );
}
