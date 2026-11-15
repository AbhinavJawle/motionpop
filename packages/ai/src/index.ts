// @motionpop/ai: public entry point. Exports are added by the spec tasks.
// The Firebase provider is a separate entry (`@motionpop/ai/firebase`) so server code that
// imports this one doesn't pull in the Firebase client SDK.
export * from './slots/index';
export * from './router';
export * from './tasks/slots-detect';
export * from './tasks/edit-patch';
export * from './tasks/transcribe-cloud';
