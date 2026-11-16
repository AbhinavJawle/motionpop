// Synthesized sound (spec 12b): effects, placement, music beds, ducking and the bed mix. Pure DSP.
// The filters in ./dsp stay internal; only the unit helpers are public.
export { SFX_SAMPLE_RATE, dbToGain, gainToDb, msToSamples, peakOf } from './dsp';
export * from './synth';
export * from './wav';
