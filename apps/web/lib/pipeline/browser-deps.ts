import { detectLocal } from '@motionpop/ai';
import { audioStore } from '../audio/audio-store';
import { decodeForPipeline } from '../audio/decode';
import { renderCleaned } from '../audio/render-cleaned';
import { encodeWav } from '../audio/wav';
import { IdbProjectRepository } from '../projects/idb-repository';
import { validateParams } from '../slots/validate-params';
import { transcribeOnDevice } from '../transcribe/whisper-client';
import type { PipelineDeps } from './run';

/** Default style for new projects until the Styles page lands (spec 14). */
export const DEFAULT_STYLE_ID = 'editorial-explainer';

/** `p-` + 10 base-36 characters from the crypto RNG. */
export function newProjectId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return `p-${Array.from(bytes, (b) => (b % 36).toString(36)).join('')}`;
}

/** The real pipeline dependencies in the browser: Whisper worker, Web Audio, IndexedDB. */
export function browserPipelineDeps(): PipelineDeps {
  return {
    decode: decodeForPipeline,
    transcribe: async (pcm16k, durationMs, onProgress) => {
      const r = await transcribeOnDevice(pcm16k, durationMs, {
        onProgress: (p) => onProgress({ stage: p.stage, percent: p.percent }),
      });
      return {
        words: r.transcript.words,
        ranOn: 'device',
        timingQuality: r.transcript.timingQuality,
      };
    },
    renderCleaned,
    encodeWav,
    audioStore: audioStore(),
    repo: new IdbProjectRepository(),
    now: () => Date.now(),
    newId: newProjectId,
    styleId: DEFAULT_STYLE_ID,
    // Deterministic for now: AI detection (`detectSlots` through the router) waits for an
    // on-device availability check, so processing never spends cloud credits unasked (R2.3).
    detect: (words, spans) => Promise.resolve(detectLocal(words, spans)),
    validateParams,
  };
}
