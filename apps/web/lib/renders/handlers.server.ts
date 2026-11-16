import 'server-only';
import type { NewRender, StartExportResult, ExportConfig } from '@motionpop/render/store';
import { renderIdFor } from '@motionpop/render/store';
import {
  RENDER_API_ERROR_STATUS,
  RenderApiErrorSchema,
  RenderRequestSchema,
  exportAvailability,
  exportCost,
  isSafeId,
  renderPaths,
  toRenderStatus,
  voicePathFor,
  type AppConfig,
  type CreateRenderResponse,
  type DownloadResponse,
  type Format,
  type RenderApiError,
  type RenderApiErrorCode,
  type RenderDoc,
  type RenderErrorCode,
  type Slot,
} from '@motionpop/schemas';
import type { RenderMode } from './mode';

// The logic of the render routes (spec 08 design §3, §10), separated from Next and Firebase so each
// answer can be tested with fakes. The routes in `app/api/**` verify the caller, build the real
// dependencies (`deps.server.ts`) and turn a `HandlerResult` into a response.

export interface HandlerResult {
  status: number;
  body: unknown;
}

/** An error answer with the status of design §10. The body is parsed, so it can't carry extras. */
export function apiError(
  code: RenderApiErrorCode,
  extra: Omit<RenderApiError, 'error'> = {},
): HandlerResult {
  return {
    status: RENDER_API_ERROR_STATUS[code],
    body: RenderApiErrorSchema.parse({ error: code, ...extra }),
  };
}

/** The snapshot of a long project is the biggest part of a request: 2 MB is generous. */
export const MAX_BODY_BYTES = 2_000_000;
/** The same limit as the Storage rule for `users/{uid}/audio/**`. */
export const MAX_VOICE_BYTES = 50_000_000;
export const DOWNLOAD_TTL_MS = 10 * 60_000;

// ---------------------------------------------------------------------------------------------
// POST /api/renders

export interface VoiceObject {
  size: number;
  contentType: string | undefined;
}

export interface CreateDeps {
  mode: Exclude<RenderMode, 'offline'>;
  config: () => Promise<AppConfig>;
  now: () => number;
  /** Metadata of a Storage object, or null when it does not exist. */
  voiceObject: (path: string) => Promise<VoiceObject | null>;
  /** The component check of the shared compile input (`isRenderable`). */
  isRenderable: (slot: Slot, format: Format) => boolean;
  /** Fails the caller's stalled renders first, so one doesn't block a new export (R4.6). */
  sweepStalled: (uid: string, nowMs: number) => Promise<void>;
  startExport: (
    renderId: string,
    render: NewRender,
    cost: number,
    cfg: ExportConfig,
    nowMs: number,
  ) => Promise<StartExportResult>;
  balanceOf: (uid: string) => Promise<number>;
  writeSnapshot: (path: string, json: string) => Promise<void>;
  launch: (renderId: string) => Promise<{ executionName?: string }>;
  recordExecution: (renderId: string, executionName: string) => Promise<void>;
  failRender: (renderId: string, code: RenderErrorCode, message: string) => Promise<unknown>;
  log: (fields: Record<string, unknown>) => void;
}

const exportConfigOf = (c: AppConfig): ExportConfig => ({
  exportsEnabled: c.exportsEnabled,
  killSwitch: c.killSwitch,
  rendersPerUserPerDay: c.rendersPerUserPerDay,
  judgeCredits: c.judgeCredits,
});

/**
 * Validates the request, charges once and starts the job (design §3 step 3). Nothing is written
 * anywhere for a rejected request. A job that can't be started is failed and refunded before the
 * answer (R6.3). A `LedgerError` (no user doc yet) propagates, and the route answers 409.
 */
export async function createRender(
  deps: CreateDeps,
  uid: string,
  bodyText: string,
): Promise<HandlerResult> {
  if (Buffer.byteLength(bodyText, 'utf8') > MAX_BODY_BYTES) return apiError('too-large');
  let raw: unknown;
  try {
    raw = JSON.parse(bodyText);
  } catch {
    return apiError('invalid');
  }
  const parsed = RenderRequestSchema.safeParse(raw);
  if (!parsed.success) return apiError('invalid');
  const { requestId, options, expectedCost, project, voicePath } = parsed.data;
  // Music is not rendered yet (spec 12b): never accept a request that asks for it.
  if (options.music) return apiError('invalid');
  if (!isSafeId(uid) || !isSafeId(project.id)) return apiError('invalid');
  if (!voicePathFor(uid, project.id).test(voicePath)) return apiError('invalid');

  let renderId: string;
  let paths: ReturnType<typeof renderPaths>;
  try {
    renderId = renderIdFor(uid, requestId);
    paths = renderPaths(uid, project.id, renderId);
  } catch {
    return apiError('invalid');
  }

  const config = await deps.config();
  if (!config.exportsEnabled || config.killSwitch) return apiError('disabled');

  const available = exportAvailability(project, options, {
    isRenderable: deps.isRenderable,
    maxMs: config.exportMaxMs,
  });
  if (available.reasons.includes('too-long')) return apiError('too-long');
  if (available.reasons.includes('nothing-to-render')) return apiError('nothing-to-render');

  const cost = exportCost(options.resolution, project.durationMs, config.exportCredits);
  if (cost !== expectedCost) return apiError('cost-changed', { cost });

  const voice = await deps.voiceObject(voicePath);
  if (!voice || voice.size <= 0 || !voice.contentType?.startsWith('audio/')) {
    return apiError('voice-missing');
  }
  if (voice.size > MAX_VOICE_BYTES) return apiError('too-large');

  const nowMs = deps.now();
  await deps.sweepStalled(uid, nowMs);
  const render: NewRender = {
    ownerId: uid,
    projectId: project.id,
    requestId,
    title: project.title.slice(0, 120),
    format: options.format,
    resolution: options.resolution,
    captions: options.captions,
    music: false,
    durationMs: project.durationMs,
    slotCount: available.renderable,
    mode: deps.mode,
    inputPath: paths.input,
    voicePath,
  };
  const started = await deps.startExport(renderId, render, cost, exportConfigOf(config), nowMs);

  if (started.kind === 'reject') {
    switch (started.reason) {
      case 'insufficient-credits':
        return apiError('insufficient-credits', { balance: started.balance });
      case 'render-active':
        return apiError('render-active', {
          ...(started.renderId ? { renderId: started.renderId } : {}),
        });
      case 'daily-limit':
        return apiError('daily-limit');
      case 'disabled':
        return apiError('disabled');
    }
  }
  if (started.kind === 'existing') {
    // A repeated request: the same render, nothing charged, no second snapshot or launch.
    const response: CreateRenderResponse = {
      renderId: started.renderId,
      costCredits: started.doc.costCredits,
      balanceAfter: await deps.balanceOf(uid),
    };
    return { status: 200, body: response };
  }

  // Created and charged. A failure from here on fails the render and refunds it (R6.3).
  try {
    await deps.writeSnapshot(paths.input, JSON.stringify(project));
    const launched = await deps.launch(renderId);
    if (launched.executionName) {
      // The name is for debugging only: a failure to store it must not fail the render.
      await deps
        .recordExecution(renderId, launched.executionName)
        .catch((e: unknown) =>
          deps.log({ event: 'record-execution-failed', renderId, error: errorText(e) }),
        );
    }
  } catch (e) {
    deps.log({ event: 'start-failed', renderId, error: errorText(e) });
    await deps
      .failRender(renderId, 'start-failed', 'The render could not be started.')
      .catch((fe: unknown) =>
        deps.log({ event: 'start-failed-not-recorded', renderId, error: errorText(fe) }),
      );
    return apiError('start-failed');
  }
  const response: CreateRenderResponse = {
    renderId,
    costCredits: started.costCredits,
    balanceAfter: started.balanceAfter,
  };
  return { status: 201, body: response };
}

/** Error text for the server log: the name and message only, never a stack, a URL or a token. */
function errorText(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 300) : String(e).slice(0, 300);
}

// ---------------------------------------------------------------------------------------------
// POST /api/renders/{id}/check, GET /api/renders/{id}/download

export interface OwnedRenderDeps {
  getRender: (renderId: string) => Promise<RenderDoc | null>;
}

const NOT_FOUND: HandlerResult = { status: 404, body: { error: 'not-found' } };

/** The caller's render, or a 404 for a missing one and for someone else's alike. */
async function ownedRender(
  deps: OwnedRenderDeps,
  uid: string,
  renderId: string,
): Promise<RenderDoc | null> {
  if (!isSafeId(renderId)) return null;
  const doc = await deps.getRender(renderId);
  return doc && doc.ownerId === uid ? doc : null;
}

export interface CheckDeps extends OwnedRenderDeps {
  now: () => number;
  /** `sweepIfStalled`: fails the render when it is stalled and returns it as it is afterwards. */
  sweep: (renderId: string, nowMs: number) => Promise<RenderDoc | null>;
}

/** The client saw no change for 45 s and asks: fail it if stalled, answer its current state. */
export async function checkRender(
  deps: CheckDeps,
  uid: string,
  renderId: string,
): Promise<HandlerResult> {
  if (!(await ownedRender(deps, uid, renderId))) return NOT_FOUND;
  const after = await deps.sweep(renderId, deps.now());
  if (!after) return NOT_FOUND;
  return { status: 200, body: toRenderStatus(renderId, after) };
}

export interface DownloadDeps extends OwnedRenderDeps {
  mode: RenderMode;
  /** A V4 signed read URL that downloads under `disposition`. */
  signedUrl: (path: string, disposition: string, ttlMs: number) => Promise<string>;
  disposition: (title: string) => string;
}

export type DownloadResult =
  | HandlerResult
  /** Emulator mode: the route reads the object itself and streams it. */
  | { status: 200; stream: { path: string; disposition: string } };

export async function downloadRender(
  deps: DownloadDeps,
  uid: string,
  renderId: string,
  opts: { stream: boolean },
): Promise<DownloadResult> {
  const doc = await ownedRender(deps, uid, renderId);
  if (!doc) return NOT_FOUND;
  if (doc.status !== 'done' || !doc.outputPath) {
    return { status: 409, body: { error: 'not-done' } };
  }
  const disposition = deps.disposition(doc.title);
  if (deps.mode === 'emulator') {
    // The Storage emulator can't check signed URLs: the route streams the bytes itself.
    if (opts.stream) return { status: 200, stream: { path: doc.outputPath, disposition } };
    const body: DownloadResponse = { url: `/api/renders/${renderId}/download?stream=1` };
    return { status: 200, body };
  }
  const url = await deps.signedUrl(doc.outputPath, disposition, DOWNLOAD_TTL_MS);
  const body: DownloadResponse = { url };
  return { status: 200, body };
}

// ---------------------------------------------------------------------------------------------
// POST /api/shares

export interface ShareDeps {
  createShare: (
    renderId: string,
    uid: string,
  ) => Promise<
    { kind: 'ok'; shareId: string; created: boolean } | { kind: 'not-found' } | { kind: 'not-done' }
  >;
}

export async function createShareLink(
  deps: ShareDeps,
  uid: string,
  renderId: string,
  origin: string,
): Promise<HandlerResult> {
  if (!isSafeId(renderId)) return NOT_FOUND;
  const r = await deps.createShare(renderId, uid);
  if (r.kind === 'not-found') return NOT_FOUND;
  if (r.kind === 'not-done') return { status: 409, body: { error: 'not-done' } };
  return {
    status: r.created ? 201 : 200,
    body: { shareId: r.shareId, url: `${origin}/share/${r.shareId}` },
  };
}
