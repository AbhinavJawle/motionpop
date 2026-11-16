import {
  exportAvailability,
  exportCost,
  type AppConfig,
  type EditorProject,
  type Format,
  type Slot,
  type RenderErrorCode,
  type RenderOptions,
  type RenderStatus,
  type Resolution,
} from '@motionpop/schemas';
import type { RenderView, StartFailure } from './render-client';

// The pure rules of the export modal (spec 08 design §13, §15): which view shows, what it costs,
// why the button is disabled, and the copy of every error. No React here, so each is a unit test.

export type ExportView = 'options' | 'starting' | 'progress' | 'ready' | 'error';

/** Which of the modal's views the state calls for. */
export function viewOf(starting: boolean, view: RenderView | null): ExportView {
  if (view) {
    if (view.status === 'done') return 'ready';
    if (view.status === 'error') return 'error';
    return 'progress';
  }
  return starting ? 'starting' : 'options';
}

export const isActive = (s: RenderStatus | undefined): boolean =>
  s === 'queued' || s === 'rendering' || s === 'encoding';

/** The stage line of the progress state (design §13.2). */
export function stageLine(status: RenderStatus | undefined): string {
  if (status === 'rendering') return 'Rendering frames…';
  if (status === 'encoding') return 'Encoding…';
  return 'Warming up…';
}

// ---------------------------------------------------------------------------------------------
// Copy

/** Error copy per render error code (design §15). */
export const RENDER_ERROR_COPY: Readonly<Record<RenderErrorCode, string>> = {
  'start-failed': "Pip couldn't start the render. Your credits are back.",
  stalled: 'That render took too long. Your credits are back.',
  timeout: 'That render took too long. Your credits are back.',
  'input-missing': 'Pip lost the voiceover on the way. Your credits are back.',
  'compile-failed': "One graphic wouldn't render. Your credits are back.",
  'slot-failed': "One graphic wouldn't render. Your credits are back.",
  'render-failed': 'Pip dropped a frame. Your credits are back.',
  'upload-failed': 'Pip dropped a frame. Your credits are back.',
  internal: 'Pip dropped a frame. Your credits are back.',
};

/** Offline renders are free, so there is nothing to give back. */
export function renderErrorMessage(code: RenderErrorCode | undefined, free: boolean): string {
  const text = RENDER_ERROR_COPY[code ?? 'internal'];
  return free ? text.replace(' Your credits are back.', '') : text;
}

/** What the modal says when the request itself is refused (design §15, "API" rows). */
export function startFailureMessage(f: StartFailure, costNow?: number): string {
  switch (f.error) {
    case 'insufficient-credits':
      return 'Not enough credits. Small edits stay free.';
    case 'cost-changed':
      return `Prices just changed. Check the new cost${costNow !== undefined ? ` (${costNow} credits)` : ''}.`;
    case 'daily-limit':
      return "That's today's exports. More tomorrow.";
    case 'disabled':
      return 'Exports are paused for a moment. Try again soon.';
    case 'too-long':
      return 'Exports are up to 3 min for now.';
    case 'nothing-to-render':
      return 'Add a graphic first.';
    case 'voice-missing':
      return 'Pip lost the voiceover. Re-add it and try again.';
    case 'too-large':
      return 'The voiceover is too big to export (50 MB at most).';
    case 'network':
    case 'offline':
      return 'Needs connection';
    case 'unauthorized':
      return 'Sign in again to export.';
    default:
      return "Pip couldn't start the render. Nothing was charged.";
  }
}

// ---------------------------------------------------------------------------------------------
// Options view

export interface ExportOptionsInput {
  project: EditorProject;
  options: RenderOptions;
  config: AppConfig;
  /** `offline`: local render, free, no balance. */
  mode: 'cloud' | 'offline';
  /** The live balance; null while unknown (and always in offline mode). */
  balance: number | null;
  online: boolean;
  /** The server's price after `cost-changed`: replaces the table's until the options change. */
  costOverride?: number | null;
  isRenderable: (slot: Slot, format: Format) => boolean;
}

export interface ExportOptionsState {
  /** Null in offline mode ("Local render · free"). */
  cost: number | null;
  /** Slots that will render, and slots left out. */
  renderable: number;
  leftOut: number;
  canExport: boolean;
  /** Text that replaces "N available" in the cost row, with its colour. */
  rightText: { tone: 'muted' | 'error' | 'mint'; text: string };
  /** Why the button is disabled, when it is not the balance. */
  blockNote: string | null;
  /** "2 slots aren't ready and will be left out." */
  leftOutNote: string | null;
}

export function leftOutNote(leftOut: number): string | null {
  if (leftOut <= 0) return null;
  return leftOut === 1
    ? "1 slot isn't ready and will be left out."
    : `${leftOut} slots aren't ready and will be left out.`;
}

export function exportOptionsState(i: ExportOptionsInput): ExportOptionsState {
  const free = i.mode === 'offline';
  const avail = exportAvailability(i.project, i.options, {
    isRenderable: i.isRenderable,
    maxMs: i.config.exportMaxMs,
  });
  const cost = free
    ? null
    : (i.costOverride ??
      exportCost(i.options.resolution, i.project.durationMs, i.config.exportCredits));

  let blockNote: string | null = null;
  if (!i.config.exportsEnabled) blockNote = 'Exports are paused for a moment. Try again soon.';
  else if (avail.reasons.includes('nothing-to-render')) blockNote = 'Add a graphic first.';
  else if (avail.reasons.includes('too-long')) {
    const minutes = Math.round(i.config.exportMaxMs / 60_000);
    blockNote = `Exports are up to ${minutes} min for now.`;
  }

  let rightText: ExportOptionsState['rightText'];
  let broke = false;
  if (free) rightText = { tone: 'mint', text: 'Local render · free' };
  else if (!i.online) {
    rightText = { tone: 'muted', text: 'Needs connection' };
    blockNote ??= 'Needs connection';
  } else if (i.balance !== null && cost !== null && i.balance < cost) {
    broke = true;
    rightText = { tone: 'error', text: 'Not enough credits. Small edits stay free.' };
  } else {
    rightText = { tone: 'muted', text: i.balance === null ? '' : `${i.balance} available` };
  }

  return {
    cost,
    renderable: avail.renderable,
    leftOut: avail.leftOut,
    canExport: blockNote === null && !broke,
    rightText,
    blockNote: blockNote === 'Needs connection' ? null : blockNote,
    leftOutNote: leftOutNote(avail.leftOut),
  };
}

export const FORMAT_CHOICES: readonly Format[] = ['16:9', '9:16', '1:1'];
export const RESOLUTION_CHOICES: readonly Resolution[] = ['720p', '1080p'];

/** "18 sec" for the card and the file meta (rounded up, never "0 sec"). */
export function secondsText(durationMs: number): string {
  return `${Math.max(1, Math.round(durationMs / 1000))} sec`;
}
