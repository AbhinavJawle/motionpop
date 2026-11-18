import {
  applyEditorCommand,
  emptyEditorDocumentV2,
  validateEditorDocumentV2,
  type AudioTimelineClip,
  type EditorCommand,
  type EditorDocumentV2,
  type EditorMediaAsset,
  type GraphicTimelineClip,
  type NarrativeTimelineClip,
} from '@pireel/studio-engine/editor-document';
import type { TranscriptSegment } from '@pireel/studio-engine/project-dto';
import { durableFileSig } from '@pireel/studio-ui/media';
import { saveLocalVideo } from '@pireel/studio-ui/local-media';
import { projectCompileInput } from '@motionpop/motion/compiler';
import {
  SFX_SAMPLE_RATE,
  bedKeyMoment,
  encodeWav16,
  placeSfx,
  sfxSpec,
  synthBed,
  synthSfx,
  type SfxKind,
} from '@motionpop/motion/sfx';
import type { RuntimeProject } from '@motionpop/motion/compiler';
import { FORMATS, audioOf, type EditorProject, type Format, type Word } from '@motionpop/schemas';
import { buildEdl, keptWordIndexes, normalizeCuts, unmapTime, type CutRange } from '../audio/edl';

/**
 * Motionpop project + its talking-head video → a fully edited studio document (spec 17 R3, R4).
 * Everything comes from the processing pipeline's own output, so nothing here calls a model:
 * - the footage, cut non-destructively where cleanup cut fillers and pauses (ripple, frame-exact);
 * - punch-ins on alternate jump cuts, so the cuts read as deliberate;
 * - word-synced captions from the original transcript;
 * - every ready slot as a full-frame graphic from our engine, anchored to its first spoken word;
 * - our synthesized sound effects where `placeSfx` lands them, and a quiet synthesized music bed.
 */

const FPS = 30;
const ASSET_VIDEO = 'asset_talking_head';
const TRACK_GRAPHICS = 'track_motionpop_graphics';
const TRACK_SFX = 'track_motionpop_sfx';
const TRACK_MUSIC = 'track_motionpop_music';
const PUNCH_SCALE = 1.16;
const MUSIC_DB = -22;
/** A sentence breaks after this long a pause, or this many words, so captions stay short. */
const SEGMENT_GAP_MS = 700;
const SEGMENT_MAX_WORDS = 14;

const msToFrame = (ms: number) => Math.round((ms * FPS) / 1000);

export interface VideoProbe {
  width: number;
  height: number;
  durationSec: number;
}

/** Reads a video's size and length with a media element (browser only). */
export function probeVideo(file: Blob): Promise<VideoProbe> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () => {
      const out = { width: v.videoWidth, height: v.videoHeight, durationSec: v.duration };
      URL.revokeObjectURL(url);
      resolve(out);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read the video'));
    };
    v.src = url;
  });
}

/** The output format that fits the recording best. */
export function formatFor(width: number, height: number): Format {
  if (height > width * 1.2) return '9:16';
  if (width > height * 1.2) return '16:9';
  return '1:1';
}

function run(doc: EditorDocumentV2, command: EditorCommand): EditorDocumentV2 {
  const r = applyEditorCommand(doc, command);
  if (!r.ok) throw new Error(`${command.type}: ${r.error.message}`);
  return r.document;
}

/** Original words grouped into caption-sized sentences, with each word's segment address. */
function segmentWords(words: readonly Word[]): {
  segments: TranscriptSegment[];
  address: { segment: number; word: number }[];
} {
  const segments: TranscriptSegment[] = [];
  const address: { segment: number; word: number }[] = [];
  let current: Word[] = [];
  const flush = () => {
    if (!current.length) return;
    segments.push({
      start: current[0]!.startMs / 1000,
      end: current[current.length - 1]!.endMs / 1000,
      text: current.map((w) => w.text).join(' '),
      words: current.map((w) => ({ text: w.text, start: w.startMs / 1000, end: w.endMs / 1000 })),
    });
    current = [];
  };
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (
      current.length &&
      (current.length >= SEGMENT_MAX_WORDS ||
        (prev && w.startMs - prev.endMs > SEGMENT_GAP_MS) ||
        (prev && /[.?!]["')\]]*$/.test(prev.text)))
    )
      flush();
    address.push({ segment: segments.length, word: current.length });
    current.push(w);
  });
  flush();
  return { segments, address };
}

async function storeBytes(file: File): Promise<string> {
  const sig = await durableFileSig(file);
  if (!(await saveLocalVideo(file, sig))) throw new Error('Could not keep the media in this browser');
  return sig;
}

function wavFile(samples: Float32Array, name: string): File {
  return new File([encodeWav16(samples, SFX_SAMPLE_RATE)], name, { type: 'audio/wav' });
}

export async function buildStudioDocument(project: EditorProject, video: File): Promise<EditorDocumentV2> {
  const probe = await probeVideo(video);
  const format = formatFor(probe.width, probe.height);
  const { width, height } = FORMATS[format];
  const originalWords = project.originalTranscript?.words ?? project.transcript.words;
  const sourceMs = project.voiceover.originalDurationMs ?? Math.round(probe.durationSec * 1000);
  const cuts: CutRange[] =
    project.voiceover.cleanup?.enabled === false ? [] : normalizeCuts(buildEdl(originalWords, sourceMs).cuts);
  const kept = keptWordIndexes(originalWords, cuts);
  const cleanedWords = project.transcript.words;

  // Frame-exact source → timeline mapping: cuts are removed whole, in source frames.
  const cutFrames = cuts.map((c) => ({ start: msToFrame(c.startMs), end: msToFrame(c.endMs) }));
  const timelineFrame = (srcMs: number) => {
    const f = msToFrame(srcMs);
    let removed = 0;
    for (const c of cutFrames) {
      if (c.end <= f) removed += c.end - c.start;
      else if (c.start < f) removed += f - c.start;
    }
    return f - removed;
  };
  const cleanedToFrame = (cleanedMs: number) => timelineFrame(unmapTime(cleanedMs, cuts));

  // 1. Footage.
  const videoSig = await storeBytes(video);
  let doc = emptyEditorDocumentV2({ width, height, fps: FPS, theme: 'general' });
  doc = { ...doc, canvas: { ...doc.canvas, configured: true } };
  const asset: EditorMediaAsset = {
    id: ASSET_VIDEO,
    kind: 'video',
    label: project.title,
    locator: { localSig: videoSig },
    metadata: { durationSec: probe.durationSec, width: probe.width, height: probe.height, hasAudio: true },
  };
  const whole: Omit<NarrativeTimelineClip, 'startFrame'> = {
    id: 'shot_take',
    kind: 'narrative',
    assetId: ASSET_VIDEO,
    durationFrames: msToFrame(probe.durationSec * 1000),
    enabled: true,
    sourceInSec: 0,
    sourceOutSec: probe.durationSec,
    properties: { treatment: 'full' },
  };
  doc = run(doc, { type: 'narrative.insert', atFrame: 0, clip: whole, asset });

  // 2. Transcript (source seconds), so captions and word anchors follow every later edit.
  const { segments, address } = segmentWords(originalWords);
  doc = { ...doc, semantics: { ...doc.semantics, transcripts: { [ASSET_VIDEO]: segments } } };

  // 3. The clean cut: last to first, so earlier source frames stay where they are.
  const primary = doc.semantics.primaryNarrativeTrackId;
  for (const c of [...cutFrames].reverse()) {
    if (c.end - c.start < 1) continue;
    doc = run(doc, { type: 'range.remove', trackId: primary, startFrame: c.start, endFrame: c.end, mode: 'ripple' });
  }

  // 4. Punch-ins on every other jump cut.
  doc = {
    ...doc,
    timeline: {
      ...doc.timeline,
      tracks: doc.timeline.tracks.map((t) =>
        t.id !== primary
          ? t
          : {
              ...t,
              clips: [...t.clips]
                .sort((a, b) => a.startFrame - b.startFrame)
                .map((clip, i) =>
                  clip.kind === 'narrative' && i % 2 === 1 && clip.durationFrames > FPS
                    ? { ...clip, properties: { ...clip.properties, zoom: { preset: 'instant' as const, atSec: 0, scale: PUNCH_SCALE } } }
                    : clip,
                ),
            },
      ),
    },
  };

  // 5. Captions from the transcript.
  doc = run(doc, {
    type: 'captions.style',
    patch: { on: true, preset: 'kw-yellow', yPct: format === '9:16' ? 74 : 88, scale: 1 },
  });
  doc = run(doc, { type: 'captions.relay' });

  // 6. Our graphics, one full-frame block per ready slot.
  const compileProject: EditorProject = { ...project, format };
  const input = projectCompileInput(compileProject, { mode: 'preview' });
  const compiled = new Map(input.slots.map((s) => [s.id, s]));
  const ready = project.slots.filter((s) => s.status === 'ready' && compiled.has(s.id));
  if (ready.length) {
    doc = run(doc, {
      type: 'track.insert',
      track: { id: TRACK_GRAPHICS, type: 'graphics', role: 'graphics', name: 'Motionpop graphics' },
    });
    for (const slot of ready) {
      const cs = compiled.get(slot.id)!;
      const firstCleaned = cleanedWords[slot.wordStart];
      const origIndex = kept[slot.wordStart];
      const at = origIndex !== undefined ? address[origIndex] : undefined;
      const startFrame = cleanedToFrame(slot.startMs);
      const endFrame = Math.max(startFrame + 1, cleanedToFrame(slot.endMs));
      const durationMs = Math.round(((endFrame - startFrame) * 1000) / FPS);
      const runtime: RuntimeProject = {
        width,
        height,
        format,
        durationMs,
        style: input.style,
        ...(input.energy ? { energy: input.energy } : {}),
        mode: 'preview',
        slots: [{ ...cs, startMs: 0, endMs: durationMs }],
      };
      const anchorFrame = firstCleaned ? cleanedToFrame(firstCleaned.startMs) : startFrame;
      const clip: GraphicTimelineClip = {
        id: `mg_${slot.id}`,
        kind: 'graphic',
        startFrame,
        durationFrames: endFrame - startFrame,
        enabled: true,
        anchor: at
          ? { type: 'word', assetId: ASSET_VIDEO, segmentIndex: at.segment, wordIndex: at.word, offsetFrames: startFrame - anchorFrame }
          : { type: 'timeline' },
        block: {
          templateId: 'custom',
          label: slot.reason?.slice(0, 60) || slot.componentId,
          autoFit: false,
          slots: { innerHtml: blockHtml(slot.id), timelineBody: blockTimeline(slot.id, durationMs, runtime), authoredDurationSec: durationMs / 1000 },
        },
      };
      doc = run(doc, { type: 'overlay.insert', trackId: TRACK_GRAPHICS, clip });
    }
  }

  // 7. Sound: effects where the graphics land, and a quiet bed under the voice.
  const placements = placeSfx(project, (s) => bedKeyMoment(s, project), audioOf(project).sfxSeed);
  if (placements.length) {
    doc = run(doc, { type: 'track.insert', track: { id: TRACK_SFX, type: 'audio', role: 'sfx', name: 'Sound effects' } });
    const sfxAssets = new Map<string, { id: string; durationSec: number; peakMs: number }>();
    for (const p of placements) {
      const key = `${p.kind}-${p.take}`;
      let a = sfxAssets.get(key);
      if (!a) {
        const samples = synthSfx(p.kind as SfxKind, p.take);
        const file = wavFile(samples, `${key}.wav`);
        const sig = await storeBytes(file);
        a = { id: `asset_sfx_${key}`, durationSec: samples.length / SFX_SAMPLE_RATE, peakMs: sfxSpec(p.kind as SfxKind, p.take).peakMs };
        sfxAssets.set(key, a);
        doc = { ...doc, assets: { ...doc.assets, [a.id]: { id: a.id, kind: 'audio', label: `${p.kind} (synthesized)`, locator: { localSig: sig }, metadata: { durationSec: a.durationSec, hasAudio: true } } } };
      }
      const startFrame = Math.max(0, cleanedToFrame(Math.max(0, p.atMs - a.peakMs)));
      const clip: AudioTimelineClip = {
        id: `sfx_${p.slotId}_${p.kind}_${p.atMs}`,
        kind: 'audio',
        assetId: a.id,
        startFrame,
        durationFrames: Math.max(1, msToFrame(a.durationSec * 1000)),
        enabled: true,
        sourceInSec: 0,
        sourceOutSec: a.durationSec,
        properties: { label: p.kind, volumeDb: p.gainDb },
        anchor: { type: 'timeline' },
      };
      doc = run(doc, { type: 'audio.insert', trackId: TRACK_SFX, clip });
    }
  }
  const totalFrames = timelineFrame(sourceMs);
  const bedMs = Math.round((totalFrames * 1000) / FPS);
  if (bedMs > 3000) {
    const samples = synthBed('steady-pulse', bedMs, audioOf(project).sfxSeed);
    const sig = await storeBytes(wavFile(samples, 'music-bed.wav'));
    const durationSec = samples.length / SFX_SAMPLE_RATE;
    doc = run(doc, { type: 'track.insert', track: { id: TRACK_MUSIC, type: 'audio', role: 'music', name: 'Music' } });
    doc = run(doc, {
      type: 'audio.insert',
      trackId: TRACK_MUSIC,
      asset: { id: 'asset_music_bed', kind: 'audio', label: 'Steady pulse (synthesized)', locator: { localSig: sig }, metadata: { durationSec, hasAudio: true } },
      clip: {
        id: 'music_bed',
        kind: 'audio',
        assetId: 'asset_music_bed',
        startFrame: 0,
        durationFrames: Math.min(totalFrames, msToFrame(durationSec * 1000)),
        enabled: true,
        sourceInSec: 0,
        sourceOutSec: durationSec,
        properties: { label: 'Music', volumeDb: MUSIC_DB },
        anchor: { type: 'timeline' },
      },
    });
  }

  const issues = validateEditorDocumentV2(doc).filter((i) => i.severity === 'error');
  if (issues.length) throw new Error(`Studio document is invalid: ${issues.map((i) => `${i.path} ${i.message}`).join('; ')}`);
  return doc;
}

function blockHtml(slotId: string): string {
  return `<div data-mp-slot="${slotId}" style="position:absolute;inset:0"></div>`;
}

/** The block's GSAP timeline drives our engine's pure seek(t) through one proxy tween. */
function blockTimeline(slotId: string, durationMs: number, project: RuntimeProject): string {
  const sel = JSON.stringify(`[data-mp-slot="${slotId}"]`);
  return [
    `var D=${durationMs};var data=${JSON.stringify({ project })};var h=null;var p={t:0};`,
    `function at(ms){if(!h){var M=globalThis.__mpBlocks;var el=document.querySelector(${sel});if(!M||!el)return;h=M.mount(el,data);}h.seek(ms);}`,
    `tl.to(p,{t:D,duration:D/1000,ease:'none',onUpdate:function(){at(p.t);}},0);`,
  ].join('');
}
