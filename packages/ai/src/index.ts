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
export * from './direct/enforce';
export * from './direct/fallback';
export * from './direct/plan-video';
export * from './edit/edit-doc';
export * from './tasks/note-fix';
