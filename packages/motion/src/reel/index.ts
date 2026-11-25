// Reel engine (spec 25): the public surface. Browser-safe (no Node imports).
export { mountReel, type ReelData, type ReelHandle } from './mount';
export {
  customFrame,
  inspectCustomScene,
  reelCustomDoc,
  reelCustomScene,
  type CustomContent,
  type CustomReport,
  type ReelCustomAssets,
  type ReelCustomScene,
} from './custom';
export {
  compileReel,
  reelFontCss,
  REEL_FONT_FACES,
  type ReelCompileAssets,
  type ReelCompileInput,
  type ReelSegment,
} from './compile';
export { CAPTION_STYLES, captionStyleOf, chunkCaptions } from './captions';
export {
  STAGE_W as REEL_STAGE_W,
  STAGE_H as REEL_STAGE_H,
  stageSizeForFormat,
  type StageSize,
} from './looks';
export { reelSfx, reelBed, type ReelBedOptions } from './sound';
export { logoSlugs, splitLogoQuery, illustrationPrompt } from './media-query';
export type { ReelImage } from './parts';
export { cutsFromSegments, focusAt, punchChanges, punchLevelAt, transKind } from './motion';
export {
  decodeWavStereo16,
  encodeWavStereo16,
  loopReelMusic,
  mixReelMusic,
  REEL_MUSIC_RMS_DB,
  type StereoPcm,
} from './music';
export { contrast as reelContrast, themedLook, themedPalette } from './theme';
export { LOOKS as REEL_LOOK_TOKENS } from './looks';
