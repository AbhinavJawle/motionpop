'use client';

import {
  SFX_SAMPLE_RATE,
  dbToGain,
  encodeWav16,
  sfxSamples,
  synthSfx,
  type SfxKind,
} from '@motionpop/motion/sfx';

let sharedSfxCtx: AudioContext | null = null;
let activeSfxSource: AudioBufferSourceNode | null = null;

function getSfxContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedSfxCtx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    sharedSfxCtx = new Ctor();
  }
  return sharedSfxCtx;
}

/**
 * Plays one built-in synthesized SFX immediately via Web Audio API (0 ms decode latency),
 * used when clicking SFX pills on the Sound track or auditioning sounds in the Audio panel.
 */
export async function auditionSynthSfx(
  kind: SfxKind,
  take = 0,
  gainDb = 0,
): Promise<void> {
  const ctx = getSfxContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    await ctx.resume().catch(() => undefined);
  }
  try {
    activeSfxSource?.stop();
  } catch {
    // Already stopped.
  }
  activeSfxSource = null;

  const samples = sfxSamples(kind, take, SFX_SAMPLE_RATE);
  const buffer = ctx.createBuffer(1, samples.length, SFX_SAMPLE_RATE);
  buffer.getChannelData(0).set(samples);

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = Math.min(1.2, Math.max(0.15, dbToGain(gainDb) * 0.85));
  source.connect(gain);
  gain.connect(ctx.destination);
  activeSfxSource = source;
  source.onended = () => {
    if (activeSfxSource === source) activeSfxSource = null;
  };
  source.start(0);
}

/** Encodes one built-in SFX take as a 16-bit mono WAV Blob for Stock Audio placement. */
export function synthSfxWavBlob(kind: SfxKind, take = 0): Blob {
  const samples = synthSfx(kind, take, SFX_SAMPLE_RATE);
  const bytes = encodeWav16(samples, SFX_SAMPLE_RATE);
  return new Blob([bytes.slice()], { type: 'audio/wav' });
}

/** Maps a free-text SFX query/description to the best matching built-in SFX kind. */
export function fallbackSfxKindForQuery(query: string): SfxKind {
  const q = query.toLowerCase();
  if (/cash|coin|money|dollar|price|revenue|cha.?ching|register|check|\$/.test(q)) return 'cash';
  if (/camera|shutter|photo|snap|screenshot|flash/.test(q)) return 'shutter';
  if (/type|keyboard|keystroke|typing|clack|terminal|code/.test(q)) return 'type';
  if (/boom|sub.?drop|bass.?drop|explosion|thunder|billion|million|massive|cinematic/.test(q))
    return 'boom';
  if (/slam|gavel|door|reject|bang|stomp|punch|quit|stop/.test(q)) return 'slam';
  if (/whip|swish|fast|cut|pivot|zip/.test(q)) return 'whip';
  if (/rewind|tape|flashback|reverse|back|200\d|19\d\d/.test(q)) return 'rewind';
  if (/scratch|record|vinyl|halt|crazy|twist|awkward/.test(q)) return 'scratch';
  if (/glitch|static|error|buzz|cyber|tech|hack|zap/.test(q)) return 'glitch';
  if (/tension|suspense|ominous|dark|drone|debt|crisis|risk|danger|brink/.test(q))
    return 'tension';
  if (/sparkle|magic|shimmer|breakthrough|ai|celebrat|wow/.test(q)) return 'sparkle';
  if (/chime|logo|brand|win|success|positive|warm|reveal/.test(q)) return 'chime';
  if (/ding|bell|notify|idea|tip|check|correct|bright/.test(q)) return 'ding';
  if (/rise|riser|build|swell|crescendo/.test(q)) return 'rise';
  if (/tick|clock|list|step|click/.test(q)) return 'tick';
  if (/pop|bubble|badge/.test(q)) return 'pop';
  if (/whoosh|swoosh|slide|transition/.test(q)) return 'whoosh';
  return 'impact';
}
