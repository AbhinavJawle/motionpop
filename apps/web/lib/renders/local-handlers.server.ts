import 'server-only';
import { createHash } from 'node:crypto';
import {
  RenderDocSchema,
  RenderRequestSchema,
  exportAvailability,
  isSafeId,
  mediaClipPathFor,
  renderPaths,
  stockAudioPathFor,
  stockOverlayPathFor,
  toRenderStatus,
  videoPathFor,
  voicePathFor,
  type AppConfig,
  type CreateRenderResponse,
  type Format,
  type RenderDoc,
  type Slot,
} from '@motionpop/schemas';
import { MAX_BODY_BYTES, MAX_VOICE_BYTES, apiError, type HandlerResult } from './handlers.server';

// The development-only routes of offline mode (spec 08 R7.3): one multipart request with the
// snapshot and the voice, rendered in-process into the OS temp directory, no accounts and no
// credits. The routes answer 404 outside offline mode before any of this runs.

/** The owner of every offline render. Satisfies `isSafeId`, so the usual path helpers apply. */
export const LOCAL_USER = 'local-user';

/** The request without a voice path: the voice travels in the same multipart body. */
const LocalRequestSchema = RenderRequestSchema.omit({ voicePath: true });

export interface LocalVoice {
  /** The browser's MIME type of the file. */
  type: string;
  size: number;
  bytes: Buffer;
}

export interface LocalDeps {
  config: () => Promise<AppConfig>;
  now: () => Date;
  isRenderable: (slot: Slot, format: Format) => boolean;
  putBlob: (path: string, data: Buffer | string) => Promise<void>;
  createDoc: (renderId: string, doc: RenderDoc) => void;
  getRender: (renderId: string) => Promise<RenderDoc | null>;
  launch: (renderId: string) => Promise<unknown>;
  newRenderId: () => string;
  log: (fields: Record<string, unknown>) => void;
}

/** Browser MIME types to the extensions `voicePathFor` accepts. */
const VOICE_EXT: Readonly<Record<string, 'wav' | 'mp3' | 'm4a' | 'webm' | 'ogg'>> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/vnd.wave': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'm4a',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
};

const LOCAL_VIDEO_EXT: Readonly<Record<string, 'mp4' | 'mov' | 'webm'>> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

const LOCAL_STOCK_OV_EXT: Readonly<
  Record<string, 'mp4' | 'mov' | 'webm' | 'png' | 'jpg' | 'webp'>
> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export interface LocalStockMediaFiles {
  clips?: Readonly<Record<string, LocalVoice>>;
  overlays?: Readonly<Record<string, LocalVoice>>;
  audio?: Readonly<Record<string, LocalVoice>>;
}

export async function createLocalRender(
  deps: LocalDeps,
  requestText: string,
  voice: LocalVoice | null,
  video: LocalVoice | null = null,
  stockFiles: LocalStockMediaFiles = {},
): Promise<HandlerResult> {
  if (Buffer.byteLength(requestText, 'utf8') > MAX_BODY_BYTES) return apiError('too-large');
  let raw: unknown;
  try {
    raw = JSON.parse(requestText);
  } catch {
    return apiError('invalid');
  }
  const parsed = LocalRequestSchema.safeParse(raw);
  if (!parsed.success) return apiError('invalid');
  const { requestId, options, project } = parsed.data;
  if (!isSafeId(project.id)) return apiError('invalid');

  if (!voice || voice.size <= 0 || voice.bytes.length <= 0) return apiError('voice-missing');
  if (voice.size > MAX_VOICE_BYTES || voice.bytes.length > MAX_VOICE_BYTES) {
    return apiError('too-large');
  }
  const ext = VOICE_EXT[voice.type.split(';')[0]?.trim().toLowerCase() ?? ''];
  if (!ext) return apiError('voice-missing');

  const config = await deps.config();
  const available = exportAvailability(project, options, {
    isRenderable: deps.isRenderable,
    maxMs: config.exportMaxMs,
  });
  if (available.reasons.includes('too-long')) return apiError('too-long');
  if (available.reasons.includes('nothing-to-render')) return apiError('nothing-to-render');

  const renderId = deps.newRenderId();
  const hash = createHash('sha256').update(voice.bytes).digest('hex').slice(0, 16);
  const voicePath = `users/${LOCAL_USER}/audio/${project.id}/voice-${hash}.${ext}`;
  if (!voicePathFor(LOCAL_USER, project.id).test(voicePath)) return apiError('invalid');
  let videoPath: string | undefined;
  if (video && video.size > 0 && video.bytes.length > 0) {
    const vExt = LOCAL_VIDEO_EXT[video.type.split(';')[0]?.trim().toLowerCase() ?? ''] ?? 'mp4';
    const vHash = createHash('sha256').update(video.bytes).digest('hex').slice(0, 16);
    const candidate = `users/${LOCAL_USER}/video/${project.id}/source-${vHash}.${vExt}`;
    if (videoPathFor(LOCAL_USER, project.id).test(candidate)) videoPath = candidate;
  }

  const clipPaths: Record<string, string> = {};
  const stockOverlayPaths: Record<string, string> = {};
  const stockBlobsToWrite = new Map<string, Buffer>();
  if (stockFiles.clips) {
    const clipRe = mediaClipPathFor(LOCAL_USER, project.id);
    for (const [clipId, file] of Object.entries(stockFiles.clips).slice(0, 64)) {
      if (!isSafeId(clipId) || file.size <= 0 || file.bytes.length <= 0) continue;
      const mime = file.type.split(';')[0]?.trim().toLowerCase() ?? '';
      const clipExt = LOCAL_STOCK_OV_EXT[mime] ?? (mime.startsWith('image/') ? 'jpg' : 'mp4');
      const clipHash = createHash('sha256').update(file.bytes).digest('hex').slice(0, 16);
      const path = `users/${LOCAL_USER}/video/${project.id}/clip-${clipHash}.${clipExt}`;
      if (!clipRe.test(path)) continue;
      clipPaths[clipId] = path;
      stockBlobsToWrite.set(path, file.bytes);
    }
  }
  if (stockFiles.overlays) {
    const ovRe = stockOverlayPathFor(LOCAL_USER, project.id);
    for (const [clipId, file] of Object.entries(stockFiles.overlays).slice(0, 64)) {
      if (!isSafeId(clipId) || file.size <= 0 || file.bytes.length <= 0) continue;
      const mime = file.type.split(';')[0]?.trim().toLowerCase() ?? '';
      const ovExt = LOCAL_STOCK_OV_EXT[mime] ?? (mime.startsWith('image/') ? 'jpg' : 'mp4');
      const ovHash = createHash('sha256').update(file.bytes).digest('hex').slice(0, 16);
      const path = `users/${LOCAL_USER}/video/${project.id}/stock-ov-${ovHash}.${ovExt}`;
      if (!ovRe.test(path)) continue;
      stockOverlayPaths[clipId] = path;
      stockBlobsToWrite.set(path, file.bytes);
    }
  }

  const stockAudioPaths: Record<string, string> = {};
  if (stockFiles.audio) {
    const auRe = stockAudioPathFor(LOCAL_USER, project.id);
    for (const [clipId, file] of Object.entries(stockFiles.audio).slice(0, 96)) {
      if (
        !isSafeId(clipId) ||
        file.size <= 0 ||
        file.bytes.length <= 0 ||
        file.bytes.length > MAX_VOICE_BYTES
      ) {
        continue;
      }
      const mime = file.type.split(';')[0]?.trim().toLowerCase() ?? '';
      const auExt = VOICE_EXT[mime] ?? 'mp3';
      const auHash = createHash('sha256').update(file.bytes).digest('hex').slice(0, 16);
      const path = `users/${LOCAL_USER}/audio/${project.id}/stock-au-${auHash}.${auExt}`;
      if (!auRe.test(path)) continue;
      stockAudioPaths[clipId] = path;
      stockBlobsToWrite.set(path, file.bytes);
    }
  }

  let inputPath: string;
  try {
    inputPath = renderPaths(LOCAL_USER, project.id, renderId).input;
  } catch {
    return apiError('invalid');
  }

  const isReel = Boolean(project.reel && project.video);
  const transparent = Boolean(options.transparent) && !isReel;
  const doc = RenderDocSchema.parse({
    schemaVersion: 1,
    ownerId: LOCAL_USER,
    projectId: project.id,
    requestId,
    title: project.title.slice(0, 120),
    format: options.format,
    resolution: options.resolution,
    captions: options.captions,
    music: options.music,
    ...(transparent ? { transparent: true } : {}),
    durationMs: project.durationMs,
    slotCount: available.renderable,
    status: 'queued',
    progress: 0,
    costCredits: 0,
    mode: 'offline',
    inputPath,
    voicePath,
    ...(videoPath ? { videoPath } : {}),
    ...(Object.keys(clipPaths).length > 0 ? { clipPaths } : {}),
    ...(Object.keys(stockOverlayPaths).length > 0 ? { stockOverlayPaths } : {}),
    ...(Object.keys(stockAudioPaths).length > 0 ? { stockAudioPaths } : {}),
    createdAt: deps.now(),
  });
  try {
    await deps.putBlob(voicePath, voice.bytes);
    if (videoPath && video) await deps.putBlob(videoPath, video.bytes);
    for (const [path, bytes] of stockBlobsToWrite) {
      await deps.putBlob(path, bytes);
    }
    await deps.putBlob(inputPath, JSON.stringify(project));
    deps.createDoc(renderId, doc);
    await deps.launch(renderId);
  } catch (e) {
    deps.log({ event: 'offline-start-failed', renderId, error: String(e).slice(0, 300) });
    return apiError('start-failed');
  }
  const body: CreateRenderResponse = { renderId, costCredits: 0, balanceAfter: 0 };
  return { status: 201, body };
}

export async function localStatus(deps: LocalDeps, renderId: string): Promise<HandlerResult> {
  if (!isSafeId(renderId)) return { status: 404, body: { error: 'not-found' } };
  const doc = await deps.getRender(renderId);
  if (!doc) return { status: 404, body: { error: 'not-found' } };
  return { status: 200, body: toRenderStatus(renderId, doc) };
}

/** The finished file of an offline render: its object path, or null when there isn't one (yet). */
export async function localFile(deps: LocalDeps, renderId: string): Promise<RenderDoc | null> {
  if (!isSafeId(renderId)) return null;
  const doc = await deps.getRender(renderId);
  return doc && doc.status === 'done' && doc.outputPath ? doc : null;
}
