import type { Format, RenderOptions } from '@motionpop/schemas';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { viewOf, type ExportView } from './export-flow';
import type { RenderView } from './render-client';

/**
 * UI state of the export flow (spec 08 design §13): whether the modal is open, which render it
 * follows and the options picked. The editor's top bar, the modal and the controller (which owns
 * the watching and the toasts) all read it.
 */
export interface ExportUiState {
  open: boolean;
  /** The request is on its way (voice upload, POST). */
  starting: boolean;
  renderId: string | null;
  view: RenderView | null;
  /** The options last picked; null until the modal opens (it then uses the project's format). */
  options: RenderOptions | null;
  /** Why the last request was refused (shown in the options view). */
  startError: string | null;
  /** The price the server named when it refused ours (`cost-changed`); shown until options change. */
  costOverride: number | null;

  /** The Export button: opens the options, or progress when a render is running. */
  openFromButton(): void;
  /** The "Open" toast: opens whatever the render ended as. */
  openAsIs(): void;
  close(): void;
  setOptions(options: RenderOptions): void;
  beginStart(): void;
  failStart(message: string, costOverride?: number): void;
  follow(renderId: string, view?: RenderView | null): void;
  applyView(view: RenderView): void;
  /** Forget the current render (back to the options). */
  reset(): void;
}

export const defaultOptions = (format: Format): RenderOptions => ({
  format,
  resolution: '1080p',
  captions: false,
  music: false,
});

const finished = (v: RenderView | null): boolean =>
  v !== null && (v.status === 'done' || v.status === 'error');

export function createExportStore() {
  return createStore<ExportUiState>()((set, get) => ({
    open: false,
    starting: false,
    renderId: null,
    view: null,
    options: null,
    startError: null,
    costOverride: null,

    openFromButton() {
      // A finished render was already shown (or toasted): the button starts a new export.
      if (finished(get().view)) set({ renderId: null, view: null, startError: null });
      set({ open: true });
    },
    openAsIs() {
      set({ open: true });
    },
    close() {
      if (finished(get().view)) set({ open: false, renderId: null, view: null });
      else set({ open: false });
    },
    setOptions(options) {
      set({ options, startError: null, costOverride: null });
    },
    beginStart() {
      set({ starting: true, startError: null });
    },
    failStart(message, costOverride) {
      set({ starting: false, startError: message, costOverride: costOverride ?? null });
    },
    follow(renderId, view = null) {
      set({ starting: false, renderId, view, startError: null });
    },
    applyView(view) {
      if (get().renderId !== view.renderId) return;
      set({ view });
    },
    reset() {
      set({ renderId: null, view: null, starting: false, startError: null });
    },
  }));
}

export const exportStore = createExportStore();

export function useExportUi<T>(selector: (s: ExportUiState) => T): T {
  return useStore(exportStore, selector);
}

export const selectExportView = (s: ExportUiState): ExportView => viewOf(s.starting, s.view);
