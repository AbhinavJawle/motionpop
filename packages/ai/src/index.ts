// @motionpop/ai: public entry point. Exports are added by the spec tasks.
// The Firebase provider is a separate entry (`@motionpop/ai/firebase`) so server code that
// imports this one doesn't pull in the Firebase client SDK.
export * from './slots/index';
export * from './router';
export * from './tasks/slots-detect';
export * from './tasks/edit-patch';
export * from './tasks/transcribe-cloud';
export * from './tasks/component-fill';
export * from './tasks/direct-plan';
export * from './tasks/video-direct';
export * from './tasks/media-index';
export * from './direct/enforce';
export * from './direct/fallback';
export * from './direct/plan-video';
export * from './edit/edit-doc';
export * from './tasks/note-fix';
export * from './tasks/prompt-prefill';
export * from './tasks/recipe-resolve';
export * from './tasks/pip-plan';
export * from './tasks/pip-quick';
export * from './tasks/custom-compose';
export * from './tasks/film';
export * from './tasks/film-vision-critic';
export * from './film/make-film';
export { FILM_DIRECT_SYSTEM_V1 } from './prompts/film-direct.v1';
export { REEL_DIRECT_SYSTEM_V2 } from './prompts/reel-v2';
export * from './speech';
export * from './image';
export * from './cache';
export * from './slots/chunk-detect';
export * from './reel/director';
export * from './reel/auto';
export * from './reel/edit';
export { applyEditChoices, ctaParts, MOOD_BRIEFS, type EditChoices } from './reel/edit-choices';
export {
  ReelDirectBriefSchema,
  briefFromEdit,
  recipeBlock,
  styleCraftDirection,
  type ReelDirectBrief,
} from './reel/brief';
export { REEL_DIRECT_SYSTEM_V3, reelDirectPromptV3 } from './reel/prompt';
export * from './reel/note';
export * from './reel/note-local';
export * from './reel/draft-local';
export * from './reel/compose';
export * from './reel/graphic';
export * from './skills/recipes';
export * from './skills/registry';
export * from './skills/slot-sequences';
export * from './skills/user-skill';
export * from './skills/community-skills';
export {
  ByokModelModeSchema,
  byokModelFor,
  chromeOnDeviceProvider,
  GEMINI_API_BASE,
  GeminiApiKeySchema,
  geminiByokProvider,
  generateImageWithGeminiByok,
  listGeminiModels,
  redactApiKey,
  speakWithGeminiByok,
  testGeminiApiKey,
  type ByokModelMode,
  type GeminiByokProviderOptions,
  type GeminiModelInfo,
  type KeyTestResult,
  type ListModelsResult,
} from './providers/gemini-byok';
