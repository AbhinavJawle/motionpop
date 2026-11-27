import { detectLocal, directVideo, planVideo } from '@motionpop/ai';
import type { CreditsClient } from '../credits/client';
import {
  directGraphicPaid,
  directReelPaid,
  resolveReelMedia,
  resolveReelMediaList,
  resolveReelMusic,
  reviewReelCuts,
} from '../reel/media';
import { composeGraphicScenes, composeReelHeroScenes } from '../reel/compose-graphic';
import { requestPlanAllowance } from '../ai/plan-allowance';
import { getLocalLlmConfig } from '../ai/local-llm';
import { getRouter } from '../ai/router-client';
import { appAudioStore } from '../audio/app-audio-store';
import { decodeForPipeline } from '../audio/decode';
import { renderCleaned } from '../audio/render-cleaned';
import { encodeWav } from '../audio/wav';
import { projectLibrary } from '../projects/use-project-list';
import { validateParams } from '../slots/validate-params';
import { transcribeOnDevice } from '../transcribe/whisper-client';
import { probeAndSampleVideo } from '../video/frames';
import { indexUnindexedMediaClips, ingestMediaClipBlob } from '../video/media-bin';
import type { PipelineDeps } from './run';

/** Default style for new projects until the Styles page lands (spec 14). */
export const DEFAULT_STYLE_ID = 'editorial-explainer';

/** `p-` + 10 base-36 characters from the crypto RNG. */
export function newProjectId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return `p-${Array.from(bytes, (b) => (b % 36).toString(36)).join('')}`;
}

/**
 * The real pipeline dependencies in the browser: Whisper worker, Web Audio, IndexedDB. With a
 * credits client, reels use the cloud director and generate illustrations (charged, spec 26);
 * without one they use the free director and free pictures only (logos, screenshots).
 */
export function browserPipelineDeps(opts: { credits?: CreditsClient | null } = {}): PipelineDeps {
  const credits = opts.credits ?? null;
  return {
    decode: decodeForPipeline,
    transcribe: async (pcm16k, durationMs, onProgress) => {
      // A copy: the worker takes ownership of the buffer it is sent.
      const r = await transcribeOnDevice(pcm16k.slice(), durationMs, {
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
    audioStore: appAudioStore(),
    repo: projectLibrary(),
    now: () => Date.now(),
    newId: newProjectId,
    styleId: DEFAULT_STYLE_ID,
    aiRoute: () => {
      const local = getLocalLlmConfig();
      if (local) return { route: 'local-llm', label: local.model };
      return { route: 'cloud' };
    },
    // Deterministic for now: AI detection (`detectSlots` through the router) waits for an
    // on-device availability check, so processing never spends cloud credits unasked (R2.3).
    detect: (words, spans) => Promise.resolve(detectLocal(words, spans)),
    validateParams,
    // Device first (free, unlimited), then one of the day's free cloud plans when the server
    // allows it, else the built-in rules (spec 07 R6.1). Processing never spends credits.
    direct: async (req) =>
      planVideo(await getRouter().catch(() => null), req.input, {
        cloudAllowed: requestPlanAllowance,
        seed: req.seed,
      }),
    probeVideo: (file) => probeAndSampleVideo(file),
    directVideo: async (params) =>
      directVideo(await getRouter().catch(() => null), {
        ...params,
        model: 'gemini-3.8-flash',
      }),
    directReel: ({ signal, ...params }) =>
      directReelPaid({ ...params, refId: 'reel' }, { credits }, signal),
    directGraphic: ({ signal, ...params }) =>
      directGraphicPaid({ ...params, refId: 'graphic' }, { credits }, signal),
    reviewEdit: ({ phrases }) => reviewReelCuts(phrases, { credits }),
    resolveReelMedia: ({ plan, look, projectId, onProgress, maxIllustrations, styleHint, signal }) =>
      resolveReelMedia(
        plan,
        look,
        projectId,
        {
          credits,
          ...(maxIllustrations !== undefined ? { maxIllustrations } : {}),
          ...(styleHint ? { styleHint } : {}),
        },
        onProgress,
        signal,
      ),
    resolveReelMediaList: ({ items, look, projectId, onProgress, maxIllustrations, styleHint, signal }) =>
      resolveReelMediaList(
        items,
        look,
        projectId,
        {
          credits,
          ...(maxIllustrations !== undefined ? { maxIllustrations } : {}),
          ...(styleHint ? { styleHint } : {}),
        },
        onProgress,
        signal,
      ),
    composeGraphicScenes: (params) =>
      composeGraphicScenes(params, {
        getRouter: () => getRouter().catch(() => null),
      }),
    composeReelHeroScenes: (params) =>
      composeReelHeroScenes(params, {
        getRouter: () => getRouter().catch(() => null),
      }),
    resolveReelMusic: ({ plan, durationMs, projectId, signal }) =>
      resolveReelMusic(plan, durationMs, projectId, { audioStore: appAudioStore() }, signal),
    ingestExtraClip: async (clip, projectId) => {
      const store = appAudioStore();
      const blob = await store.get(clip.ref);
      if (!blob) return null;
      const probed = await ingestMediaClipBlob(
        blob,
        {
          name: clip.name,
          mimeType: clip.mimeType,
          projectId,
          ...(clip.kindHint ? { kindHint: clip.kindHint } : {}),
          ...(!store.syncs?.() ? { existingRef: clip.ref } : {}),
        },
        store,
      );
      return probed.clip;
    },
    indexMediaClips: async (clips, lockedKinds) => {
      const router = await getRouter().catch(() => null);
      const res = await indexUnindexedMediaClips(clips, router, {
        store: appAudioStore(),
        ...(lockedKinds?.size ? { lockedKinds } : {}),
      });
      return res.clips;
    },
  };
}
