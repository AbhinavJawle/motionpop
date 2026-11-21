// Reel engine (spec 25): the public surface. Browser-safe (no Node imports).
export { mountReel, type ReelData, type ReelHandle } from './mount';
export {
  compileReel,
  reelFontCss,
  REEL_FONT_FACES,
  type ReelCompileAssets,
  type ReelCompileInput,
  type ReelSegment,
} from './compile';
export { chunkCaptions } from './captions';
export { STAGE_W as REEL_STAGE_W, STAGE_H as REEL_STAGE_H } from './looks';
