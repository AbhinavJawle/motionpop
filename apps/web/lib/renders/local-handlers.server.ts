import 'server-only';
import { createHash } from 'node:crypto';
import {
  RenderDocSchema,
  RenderRequestSchema,
  exportAvailability,
  isSafeId,
  renderPaths,
  toRenderStatus,
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

export async function createLocalRender(
  deps: LocalDeps,
  requestText: string,
  voice: LocalVoice | null,
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
  if (options.captions || options.music) return apiError('invalid');
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
  let inputPath: string;
  try {
    inputPath = renderPaths(LOCAL_USER, project.id, renderId).input;
  } catch {
    return apiError('invalid');
  }

  const doc = RenderDocSchema.parse({
    schemaVersion: 1,
    ownerId: LOCAL_USER,
    projectId: project.id,
    requestId,
    title: project.title.slice(0, 120),
    format: options.format,
    resolution: options.resolution,
    captions: false,
    music: false,
    durationMs: project.durationMs,
    slotCount: available.renderable,
    status: 'queued',
    progress: 0,
    costCredits: 0,
    mode: 'offline',
    inputPath,
    voicePath,
    createdAt: deps.now(),
  });
  try {
    await deps.putBlob(voicePath, voice.bytes);
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
