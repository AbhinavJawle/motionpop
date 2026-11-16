import type { EditorProject } from '@motionpop/schemas';
import { useStore } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  CommandRejected,
  emptyHistory,
  exec as execCommand,
  redo as redoHistory,
  undo as undoHistory,
  type Command,
  type History,
} from '../commands';
import type { View } from '../timeline/geometry';

/**
 * The editor store (spec 04 R1.2). The project only changes through commands, so every
 * change is one undo step and keeps the timeline invariants (R2). Per-frame playback state
 * (the live playhead while playing) is not here: the playback loop writes CSS variables and
 * refs directly (R5.1); `playheadMs` updates on pause, seek and scrub end.
 */

export type RailItem =
  'voice' | 'ai' | 'styles' | 'media' | 'audio' | 'fonts' | 'brand' | 'projects';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface DragPreview {
  slotId: string;
  startMs: number;
  endMs: number;
  /** The dragged edge landed on a word boundary: the card eases onto it (magnetic settle). */
  snapped: boolean;
}

export type GeneratePhase = 'preparing' | 'animating';
export interface Generating {
  slotId: string;
  phase: GeneratePhase;
  startedAt: number;
}

export interface EditorState {
  project: EditorProject | null;
  /** Increments on every `load`, so autosave can tell a load from an edit. */
  loadCount: number;
  history: History;
  selectedSlotId: string | null;
  playheadMs: number;
  playing: boolean;
  view: View & { fit: boolean };
  rail: RailItem;
  captions: boolean;
  safeZone: boolean;
  dragPreview: DragPreview | null;
  saveStatus: SaveStatus;
  /** The last rejected command's reason, for a toast. */
  rejection: { label: string; reason: string; at: number } | null;
  /**
   * The slot auto-fill is working on (spec 06 R5.1). UI-only: the card shows `generating`, but
   * the project keeps `suggested`, so a reload or an autosave mid-fill never strands a slot.
   */
  autoFilling: string | null;
  /**
   * The slot a Generate is working on (spec 09 R6.4, R6.8). UI-only like `autoFilling`: the stored
   * status stays as it was, so a reload mid-generate never strands a slot. At most one per project.
   */
  generating: Generating | null;
  /** The pen is on: the preview takes strokes for a frame note (spec 09 R8.1). */
  drawMode: boolean;

  load(project: EditorProject): void;
  /** Runs a command. Returns false (and records `rejection`) if the command was rejected. */
  exec(cmd: Command): boolean;
  /** Records a refused action that never became a command (e.g. no room for a new slot). */
  reject(label: string, reason: string): void;
  undo(): void;
  redo(): void;
  select(slotId: string | null): void;
  setPlayhead(ms: number): void;
  setPlaying(playing: boolean): void;
  setView(view: Partial<EditorState['view']>): void;
  setRail(item: RailItem): void;
  toggleCaptions(): void;
  toggleSafeZone(): void;
  setDragPreview(preview: DragPreview | null): void;
  setSaveStatus(status: SaveStatus): void;
  setAutoFilling(slotId: string | null): void;
  setGenerating(generating: Generating | null): void;
  setDrawMode(on: boolean): void;
}

export type EditorStore = StoreApi<EditorState>;

function clampPlayhead(ms: number, project: EditorProject | null): number {
  const max = project?.durationMs ?? 0;
  return Math.max(0, Math.min(max, Math.round(ms)));
}

export function createEditorStore(now: () => number = Date.now): EditorStore {
  return createStore<EditorState>()(
    immer((set, get) => {
      const commit = (project: EditorProject, history: History) =>
        set((s) => {
          s.project = { ...project, updatedAt: now() };
          s.history = history;
          if (s.selectedSlotId && !project.slots.some((x) => x.id === s.selectedSlotId)) {
            s.selectedSlotId = null;
          }
        });

      return {
        project: null,
        loadCount: 0,
        history: emptyHistory,
        selectedSlotId: null,
        playheadMs: 0,
        playing: false,
        view: { pxPerMs: 0.1, scrollMs: 0, fit: true },
        rail: 'ai',
        captions: true,
        safeZone: false,
        dragPreview: null,
        saveStatus: 'idle',
        rejection: null,
        autoFilling: null,
        generating: null,
        drawMode: false,

        load: (project) =>
          set((s) => {
            s.project = project;
            s.loadCount += 1;
            s.history = emptyHistory;
            s.selectedSlotId = null;
            s.playheadMs = 0;
            s.playing = false;
            s.dragPreview = null;
            s.saveStatus = 'saved';
            s.rejection = null;
            s.autoFilling = null;
            s.generating = null;
            s.drawMode = false;
          }),

        exec: (cmd) => {
          const { project, history } = get();
          if (!project) return false;
          try {
            const r = execCommand(history, project, cmd);
            commit(r.project, r.history);
            return true;
          } catch (e) {
            if (!(e instanceof CommandRejected)) throw e;
            set((s) => {
              s.rejection = { label: cmd.label, reason: e.reason, at: now() };
            });
            return false;
          }
        },

        reject: (label, reason) =>
          set((s) => {
            s.rejection = { label, reason, at: now() };
          }),

        undo: () => {
          const { project, history } = get();
          if (!project || history.past.length === 0) return;
          const r = undoHistory(history, project);
          commit(r.project, r.history);
        },

        redo: () => {
          const { project, history } = get();
          if (!project || history.future.length === 0) return;
          const r = redoHistory(history, project);
          commit(r.project, r.history);
        },

        select: (slotId) =>
          set((s) => {
            s.selectedSlotId = slotId;
          }),
        setPlayhead: (ms) =>
          set((s) => {
            s.playheadMs = clampPlayhead(ms, get().project);
          }),
        setPlaying: (playing) =>
          set((s) => {
            s.playing = playing;
          }),
        setView: (view) =>
          set((s) => {
            Object.assign(s.view, view);
          }),
        setRail: (item) =>
          set((s) => {
            s.rail = item;
          }),
        toggleCaptions: () =>
          set((s) => {
            s.captions = !s.captions;
          }),
        toggleSafeZone: () =>
          set((s) => {
            s.safeZone = !s.safeZone;
          }),
        setDragPreview: (preview) =>
          set((s) => {
            s.dragPreview = preview;
          }),
        setSaveStatus: (status) =>
          set((s) => {
            s.saveStatus = status;
          }),
        setAutoFilling: (slotId) =>
          set((s) => {
            s.autoFilling = slotId;
          }),
        setGenerating: (generating) =>
          set((s) => {
            s.generating = generating;
          }),
        setDrawMode: (on) =>
          set((s) => {
            s.drawMode = on;
          }),
      };
    }),
  );
}

/** The app's editor store. Tests create their own with `createEditorStore()`. */
export const editorStore = createEditorStore();

export function useEditor<T>(selector: (s: EditorState) => T): T {
  return useStore(editorStore, selector);
}

// Selectors: components subscribe to the smallest slice they need.
export const selectSlots = (s: EditorState) => s.project?.slots ?? EMPTY;
export const selectWords = (s: EditorState) => s.project?.transcript.words ?? EMPTY;
export const selectSelectedSlot = (s: EditorState) =>
  s.project?.slots.find((x) => x.id === s.selectedSlotId) ?? null;
export const selectCanUndo = (s: EditorState) => s.history.past.length > 0;
export const selectCanRedo = (s: EditorState) => s.history.future.length > 0;
const EMPTY: never[] = [];
