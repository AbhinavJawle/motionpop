// Render and export (spec 08): schemas and the pure helpers around them. Everything here is
// browser-safe (no Node APIs). Id generation that needs `crypto` lives in services/render.
import { z } from 'zod';
import { FormatSchema, type Format } from './format';
import { EditorProjectSchema, IntMsSchema, type EditorProject, type Slot } from './project';
import { TimestampLikeSchema } from './user';

// 4K and transparent WebM are "Later" (spec 08 review F7). Adding '4k' here and a container
// field on the options and the doc is the whole schema change.
export const ResolutionSchema = z.enum(['720p', '1080p']);
export type Resolution = z.infer<typeof ResolutionSchema>;

export const RenderStatusSchema = z.enum(['queued', 'rendering', 'encoding', 'done', 'error']);
export type RenderStatus = z.infer<typeof RenderStatusSchema>;

export const RenderModeSchema = z.enum(['cloud', 'emulator', 'offline']);
export type RenderMode = z.infer<typeof RenderModeSchema>;

export const RenderErrorCodeSchema = z.enum([
  /** The job could not be launched. */
  'start-failed',
  /** No heartbeat (R4.6). */
  'stalled',
  /** Snapshot or voice missing, unreadable or not the owner's. */
  'input-missing',
  /** `compileProject` threw. */
  'compile-failed',
  /** The runtime reported a slot error in render mode. */
  'slot-failed',
  /** The producer failed. */
  'render-failed',
  /** `maxRenderMs` or the task timeout. */
  'timeout',
  'upload-failed',
  'internal',
]);
export type RenderErrorCode = z.infer<typeof RenderErrorCodeSchema>;

/** Statuses of a render that is still running. */
export const ACTIVE_RENDER_STATUSES = ['queued', 'rendering', 'encoding'] as const;
export const isActiveStatus = (s: RenderStatus): boolean =>
  (ACTIVE_RENDER_STATUSES as readonly string[]).includes(s);
export const isFinalStatus = (s: RenderStatus): boolean => s === 'done' || s === 'error';

// ---------------------------------------------------------------------------------------------
// Options, request, doc

/**
 * What the creator picked in the export modal. `captions` burns in the project's caption preset
 * (spec 12a); `music` mixes the project's sound bed (effects and music, spec 12b) under the voice.
 */
export const RenderOptionsSchema = z
  .object({
    format: FormatSchema,
    resolution: ResolutionSchema,
    captions: z.boolean(),
    music: z.boolean(),
  })
  .strict();
export type RenderOptions = z.infer<typeof RenderOptionsSchema>;

/** Ids that may appear in a Storage path: also the shape of render, project and user ids. */
export const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const isSafeId = (id: string): boolean => SAFE_ID.test(id);

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** The only Storage paths a caller's voice upload may have (cloud and emulator modes). */
export function voicePathFor(uid: string, projectId: string): RegExp {
  return new RegExp(
    `^users/${escapeRegExp(uid)}/audio/${escapeRegExp(projectId)}/voice-[0-9a-f]{16}\\.(wav|mp3|m4a|webm|ogg)$`,
  );
}

/** The only Storage paths a caller's source video upload may have (spec 19 R5.1). */
export function videoPathFor(uid: string, projectId: string): RegExp {
  return new RegExp(
    `^users/${escapeRegExp(uid)}/video/${escapeRegExp(projectId)}/source-[0-9a-f]{16}\\.(mp4|mov|webm)$`,
  );
}

export const RenderRequestSchema = z
  .object({
    requestId: z.uuid(),
    options: RenderOptionsSchema,
    expectedCost: z.number().int().nonnegative(),
    project: EditorProjectSchema,
    /** Checked against `voicePathFor(uid, project.id)` in the route. */
    voicePath: z.string().min(1).max(300),
    /** Optional uploaded source video path (`videoPathFor(uid, project.id)`, spec 19 R5.1). */
    videoPath: z.string().min(1).max(300).optional(),
  })
  .strict();
export type RenderRequest = z.infer<typeof RenderRequestSchema>;

type RenderDocShape = {
  status: RenderStatus;
  progress: number;
  outputPath?: string | undefined;
  error?: RenderErrorCode | undefined;
};

/**
 * Invariants the state machine keeps (design §6, P4): `queued` has progress 0, only `done` has
 * progress 100 and an output, and an error code exists exactly when the status is `error`.
 */
export function renderDocIssues(d: RenderDocShape): string[] {
  const issues: string[] = [];
  if (d.status === 'queued' && d.progress !== 0) issues.push('queued implies progress 0');
  if (d.status === 'done') {
    if (d.progress !== 100) issues.push('done implies progress 100');
    if (!d.outputPath) issues.push('done implies outputPath');
  } else if (d.progress === 100) {
    issues.push('only done has progress 100');
  }
  if (d.status === 'error' && !d.error) issues.push('error implies an error code');
  if (d.status !== 'error' && d.error) issues.push('an error code implies status error');
  return issues;
}

export const RenderDocSchema = z
  .object({
    schemaVersion: z.literal(1),
    ownerId: z.string().min(1),
    projectId: z.string().min(1),
    requestId: z.uuid(),
    title: z.string().max(120),
    format: FormatSchema,
    resolution: ResolutionSchema,
    captions: z.boolean(),
    music: z.boolean(),
    durationMs: IntMsSchema,
    /** Slots that render. */
    slotCount: z.number().int().nonnegative(),
    status: RenderStatusSchema,
    progress: z.number().int().min(0).max(100),
    costCredits: z.number().int().nonnegative(),
    mode: RenderModeSchema,
    inputPath: z.string(),
    voicePath: z.string(),
    videoPath: z.string().optional(),
    outputPath: z.string().optional(),
    thumbPath: z.string().optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
    /** sha256 of the export's identity (spec 13b R2); absent on renders made before it existed. */
    key: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    executionName: z.string().optional(),
    error: RenderErrorCodeSchema.optional(),
    /** Server-safe and shown nowhere verbatim. */
    errorMessage: z.string().max(200).optional(),
    shareId: z.string().optional(),
    createdAt: TimestampLikeSchema,
    startedAt: TimestampLikeSchema.optional(),
    heartbeatAt: TimestampLikeSchema.optional(),
    finishedAt: TimestampLikeSchema.optional(),
  })
  .superRefine((d, ctx) => {
    for (const message of renderDocIssues(d)) ctx.addIssue({ code: 'custom', message });
  });
export type RenderDoc = z.infer<typeof RenderDocSchema>;

export const ShareDocSchema = z.object({
  schemaVersion: z.literal(1),
  ownerId: z.string().min(1),
  projectId: z.string().min(1),
  renderId: z.string().min(1),
  revoked: z.boolean(),
  createdAt: TimestampLikeSchema,
});
export type ShareDoc = z.infer<typeof ShareDocSchema>;

export const CreateRenderResponseSchema = z.object({
  renderId: z.string().min(1),
  costCredits: z.number().int().nonnegative(),
  balanceAfter: z.number().int().nonnegative(),
  /** True when an identical ready render was returned and nothing was started (spec 13b R2). */
  reused: z.boolean().optional(),
});
export type CreateRenderResponse = z.infer<typeof CreateRenderResponseSchema>;

/**
 * What the status and check routes answer: the render doc without paths or timestamps (the
 * client reads the doc itself through Firestore in cloud and emulator modes; offline mode polls).
 */
export const RenderStatusResponseSchema = z.object({
  renderId: z.string().min(1),
  status: RenderStatusSchema,
  progress: z.number().int().min(0).max(100),
  error: RenderErrorCodeSchema.optional(),
  costCredits: z.number().int().nonnegative(),
  title: z.string().max(120),
  format: FormatSchema,
  resolution: ResolutionSchema,
  durationMs: IntMsSchema,
  sizeBytes: z.number().int().nonnegative().optional(),
});
export type RenderStatusResponse = z.infer<typeof RenderStatusResponseSchema>;

/** The public view of a render doc. */
export function toRenderStatus(renderId: string, d: RenderDoc): RenderStatusResponse {
  return {
    renderId,
    status: d.status,
    progress: d.progress,
    ...(d.error ? { error: d.error } : {}),
    costCredits: d.costCredits,
    title: d.title,
    format: d.format,
    resolution: d.resolution,
    durationMs: d.durationMs,
    ...(d.sizeBytes !== undefined ? { sizeBytes: d.sizeBytes } : {}),
  };
}

/** `GET /api/renders/{id}/download`: a short-lived URL (or, in emulator mode, a route to stream from). */
export const DownloadResponseSchema = z.object({ url: z.string().min(1) });
export type DownloadResponse = z.infer<typeof DownloadResponseSchema>;

export const CreateShareRequestSchema = z.object({ renderId: z.string().min(1).max(128) }).strict();
export type CreateShareRequest = z.infer<typeof CreateShareRequestSchema>;
export const CreateShareResponseSchema = z.object({
  shareId: z.string().min(1),
  url: z.string().min(1),
});
export type CreateShareResponse = z.infer<typeof CreateShareResponseSchema>;

export const RenderApiErrorCodeSchema = z.enum([
  'invalid',
  'too-large',
  'too-long',
  'nothing-to-render',
  'voice-missing',
  'cost-changed',
  'insufficient-credits',
  'render-active',
  'daily-limit',
  'disabled',
  'start-failed',
  'unauthorized',
]);
export type RenderApiErrorCode = z.infer<typeof RenderApiErrorCodeSchema>;

export const RenderApiErrorSchema = z.object({
  error: RenderApiErrorCodeSchema,
  /** `cost-changed`: the cost the server computed. */
  cost: z.number().int().nonnegative().optional(),
  /** `render-active`: the render to show instead. */
  renderId: z.string().optional(),
  /** `insufficient-credits`: the current balance. */
  balance: z.number().int().nonnegative().optional(),
});
export type RenderApiError = z.infer<typeof RenderApiErrorSchema>;

/** HTTP status of each API error (design §10). */
export const RENDER_API_ERROR_STATUS: Readonly<Record<RenderApiErrorCode, number>> = {
  invalid: 400,
  unauthorized: 401,
  'insufficient-credits': 402,
  'render-active': 409,
  'cost-changed': 409,
  'too-large': 413,
  'too-long': 422,
  'nothing-to-render': 422,
  'voice-missing': 422,
  'daily-limit': 429,
  'start-failed': 502,
  disabled: 503,
};

// ---------------------------------------------------------------------------------------------
// Cost

/** Credits per started minute at each resolution (`ai-tasks.md`, D-014: 1080p = 5). */
export const ExportCreditsSchema = z.object({
  '720p': z.number().int().nonnegative(),
  '1080p': z.number().int().nonnegative(),
});
export type ExportCredits = z.infer<typeof ExportCreditsSchema>;
export const DEFAULT_EXPORT_CREDITS: ExportCredits = { '720p': 0, '1080p': 0 };

/** The price of an export: the resolution's base cost times the number of started minutes. */
export function exportCost(
  resolution: Resolution,
  durationMs: number,
  table: ExportCredits = DEFAULT_EXPORT_CREDITS,
): number {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new RangeError(`durationMs must be a non-negative number, got ${durationMs}`);
  }
  return table[resolution] * Math.max(1, Math.ceil(durationMs / 60_000));
}

// ---------------------------------------------------------------------------------------------
// Paths and filenames

export interface RenderPaths {
  /** `users/{uid}/projects/{pid}/renders/{rid}/`, with the trailing slash. */
  dir: string;
  /** The folder holding the snapshot, deleted when the render ends. */
  inputDir: string;
  input: string;
  output: string;
  thumb: string;
}

/** Storage paths of one render. Throws when an id could change the path (`..`, `/`, spaces). */
export function renderPaths(uid: string, projectId: string, renderId: string): RenderPaths {
  for (const [name, id] of [
    ['uid', uid],
    ['projectId', projectId],
    ['renderId', renderId],
  ] as const) {
    if (!isSafeId(id)) throw new Error(`${name} is not a safe id`);
  }
  const dir = `users/${uid}/projects/${projectId}/renders/${renderId}/`;
  return {
    dir,
    inputDir: `${dir}input/`,
    input: `${dir}input/project.json`,
    output: `${dir}video.mp4`,
    thumb: `${dir}thumb.jpg`,
  };
}

const FILENAME_FALLBACK = 'motionpop video';
const FILENAME_MAX = 80;
// Windows device names: "CON.mp4" still opens the console there.
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function filenamePass(input: string): string {
  let s = input
    // Control, line and paragraph separators, invisible format characters (bidi overrides can
    // spoof an extension) and lone surrogates (they make `encodeURIComponent` throw when the
    // download header is built). The zero width joiner stays so emoji sequences survive.
    .replace(/(?!\u200d)[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/gu, '')
    // Reserved on common file systems or special in a Content-Disposition value.
    .replace(/[/\\:*?"<>|]/g, '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.\u200d]+|[\s.\u200d]+$/g, '');
  if (s.length > FILENAME_MAX) {
    s = s.slice(0, FILENAME_MAX);
    // Never end on half a surrogate pair.
    if (/[\ud800-\udbff]$/.test(s)) s = s.slice(0, -1);
    s = s.replace(/[\s.\u200d]+$/g, '');
  }
  return s.length === 0 || RESERVED_NAME.test(s) ? FILENAME_FALLBACK : s;
}

/**
 * The file name (without extension) a download gets: the project title made safe. 1 to 80
 * characters, no path separators, reserved characters or control characters, and idempotent.
 */
export function sanitizeFilenameBase(title: string): string {
  let cur = title;
  // One pass settles almost every input; the loop makes idempotence hold by construction when a
  // removal exposes something the next pass would still change (for example a normalisation).
  for (let i = 0; i < 4; i++) {
    const next = filenamePass(cur);
    if (next === cur) return cur;
    cur = next;
  }
  return cur;
}

/** `sanitizeFilename("Untitled Project", "mp4")` is "Untitled Project.mp4". */
export function sanitizeFilename(title: string, ext: string): string {
  if (!/^[a-z0-9]{1,8}$/.test(ext)) throw new Error(`bad file extension "${ext}"`);
  return `${sanitizeFilenameBase(title)}.${ext}`;
}

// ---------------------------------------------------------------------------------------------
// State machine and progress

const TRANSITIONS: Readonly<Record<RenderStatus, readonly RenderStatus[]>> = {
  queued: ['rendering', 'error'],
  rendering: ['encoding', 'error'],
  encoding: ['done', 'error'],
  done: [],
  error: [],
};

/** True when a render may move from `from` to `to`. `done` and `error` are final. */
export function canTransition(from: RenderStatus, to: RenderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Progress never decreases and stays an integer in 0..100. A non-number keeps the old value. */
export function nextProgress(prev: number, candidate: number): number {
  if (!Number.isFinite(candidate)) return prev;
  return Math.max(prev, Math.min(100, Math.max(0, Math.round(candidate))));
}

// ---------------------------------------------------------------------------------------------
// Output size

export type OutputResolutionPreset = 'landscape-720p' | 'portrait-720p' | 'square-720p';

const PRESET_720: Readonly<Record<Format, OutputResolutionPreset>> = {
  '16:9': 'landscape-720p',
  '9:16': 'portrait-720p',
  '1:1': 'square-720p',
};

/**
 * The producer's `outputResolution` preset: none for 1080p (the compositions are authored at
 * 1080p), the 720p preset of the format otherwise (verified on 0.9.46, spec 08 task 1).
 */
export function outputResolutionFor(
  format: Format,
  resolution: Resolution,
): OutputResolutionPreset | undefined {
  return resolution === '1080p' ? undefined : PRESET_720[format];
}

// ---------------------------------------------------------------------------------------------
// Availability (shared by the modal and the route, so "left out" always agrees)

export type ExportBlock = 'nothing-to-render' | 'too-long';

export interface ExportAvailabilityContext {
  /** Whether the slot would render in this format (ready, known component, valid params). */
  isRenderable: (slot: Slot, format: Format) => boolean;
  /** The longest video that may be exported (`exportMaxMs`). */
  maxMs: number;
}

export interface ExportAvailability {
  /** Ids of the slots that will render, in project order. */
  renderableIds: string[];
  renderable: number;
  /** Slots that will be left out: not ready, unsupported in the format, or image slots. */
  leftOut: number;
  /** Reasons the export is blocked; empty when it can start. */
  reasons: ExportBlock[];
}

/** An image slot: a scene with at least one image (it renders its image-free form until the image is ready). */
export function isImageSlot(slot: Pick<Slot, 'params'>): boolean {
  const images = slot.params['images'];
  return Array.isArray(images) && images.length > 0;
}

export function exportAvailability(
  project: Pick<EditorProject, 'slots' | 'durationMs'>,
  options: Pick<RenderOptions, 'format'>,
  ctx: ExportAvailabilityContext,
): ExportAvailability {
  const renderableIds = project.slots
    .filter((s) => ctx.isRenderable(s, options.format))
    .map((s) => s.id);
  const reasons: ExportBlock[] = [];
  if (renderableIds.length === 0) reasons.push('nothing-to-render');
  if (project.durationMs > ctx.maxMs) reasons.push('too-long');
  return {
    renderableIds,
    renderable: renderableIds.length,
    leftOut: project.slots.length - renderableIds.length,
    reasons,
  };
}
