'use client';

import type { FrameNote } from '@motionpop/schemas';
import { AnimatePresence } from 'motion/react';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { toast } from 'sonner';
import type { Route } from '@/lib/ai/route';
import {
  bubbleAnchor,
  bubbleSize,
  ellipseAround,
  fitStroke,
  regionOf,
  type FittedStroke,
  type Pt,
  type Region,
} from '@/lib/notes/geometry';
import { editorStore, useEditor } from '@/lib/stores/editor';
import { NOTE_STROKE, NoteInput, NoteView, type NoteNotice } from './note-bubble';

/** A fixed note stays on screen with "Fixed" and "Still there?" for this long (R8.6). */
export const FIXED_SHOWN_MS = 4000;
/** Longer when the fix says what it changed (a reel note), so it can be read. */
export const FIXED_SHOWN_WITH_MESSAGE_MS = 6500;

let noteCounter = 0;
export const newNoteId = () => `note-${Date.now().toString(36)}-${(noteCounter++).toString(36)}`;

/** What a fix run reports back to the overlay (the slot and reel outcomes both fit). */
export type NoteRunOutcome =
  | { kind: 'applied'; message?: string }
  | { kind: 'escalate'; message: string }
  | { kind: 'device-failed' }
  | { kind: 'cloud-failed'; localLlm?: boolean; reason?: string }
  | { kind: 'changed' | 'blocked' | 'no-credits' };

export interface NotesOverlayProps {
  /** The slot or scene the notes belong to; null hides the overlay. */
  targetId: string | null;
  notes: readonly FrameNote[];
  /** The frame's width over its height. */
  aspect: number;
  route: Route;
  cloudRoute: Route;
  /** Optional explicit routes when both Gemini Nano and Local AI (Ollama/LM Studio) are connected. */
  nanoRoute?: Route;
  localLlmRoute?: Route;
  bothLocalConnected?: boolean;
  localModel?: string | null;
  /** A cost range for the draft's chip, when a note may cost more than its route. */
  cost?: { label: string; hint: string };
  /** The note's time from the playhead (relative to the target's start). */
  noteTime: (playheadMs: number) => number;
  /** Executes the add; false when it was rejected. */
  add: (note: FrameNote) => boolean;
  remove: (noteId: string) => void;
  reopen: (noteId: string) => void;
  run: (noteId: string, route: Route) => Promise<NoteRunOutcome>;
  /** The focal element for the keyboard path (Enter with the pen on). */
  focal: () => Region | null;
  /** The target the AI is working on right now (from the activity store). */
  working: string | null;
}

/**
 * Frame notes over a preview (spec 09 R8, shared by reels in spec 29): the pen's draw layer, the
 * open notes of the target under the playhead while paused (hidden while playing), the numbered
 * bubble with its leader line, and the input where a new note's text goes. Place inside the
 * frame card (`relative`). The layer ignores the pointer except while the pen is on.
 */
export function NotesOverlay(p: NotesOverlayProps) {
  const playing = useEditor((s) => s.playing);
  const drawMode = useEditor((s) => s.drawMode);
  const setDrawMode = useEditor((s) => s.setDrawMode);
  const noteEngine = useEditor((s) => s.noteEngine);
  const setNoteEngine = useEditor((s) => s.setNoteEngine);
  const overlay = useRef<HTMLDivElement | null>(null);
  const [stroke, setStroke] = useState<Pt[] | null>(null);
  const [pending, setPending] = useState<(FittedStroke & { targetId: string }) | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const [shownFixed, setShownFixed] = useState<readonly string[]>([]);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [notices, setNotices] = useState<Record<string, NoteNotice>>({});
  const timers = useRef<number[]>([]);
  const { targetId, focal } = p;

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // The pen is off while the video plays.
  useEffect(() => {
    if (playing && drawMode) setDrawMode(false);
  }, [playing, drawMode, setDrawMode]);

  // A draft belongs to the target it was drawn on and to the pen being on: derived, not reset.
  const draft = drawMode && pending && pending.targetId === targetId ? pending : null;
  const setDraft = (d: FittedStroke | null) =>
    setPending(d && targetId ? { ...d, targetId } : null);

  // Keyboard path: with the pen on, Enter circles the focal element (R8.2).
  useEffect(() => {
    if (!drawMode) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (e.key !== 'Enter' || draft || e.metaKey || e.ctrlKey) return;
      if (
        t instanceof HTMLElement &&
        (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
      ) {
        return;
      }
      // With the pen on, Enter belongs to the pen: it must not also press a focused button
      // (the pen itself would toggle off when there is nothing to circle).
      e.preventDefault();
      const f = focal();
      if (!f) {
        toast('Nothing to circle on this frame. Draw around it instead.');
        return;
      }
      if (targetId) setPending({ ...ellipseAround(f), targetId });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawMode, draft, focal, targetId]);

  if (!targetId) return null;
  const notes = p.notes;
  const visible = playing
    ? []
    : notes.filter((n) => n.status === 'open' || shownFixed.includes(n.id));

  const point = (e: PointerEvent): Pt => {
    const r = overlay.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraft(null);
    setStroke([point(e)]);
  };
  const onMove = (e: PointerEvent) => {
    if (stroke && e.currentTarget.hasPointerCapture(e.pointerId)) setStroke([...stroke, point(e)]);
  };
  const onUp = (e: PointerEvent) => {
    if (!stroke) return;
    const done = [...stroke, point(e)];
    setStroke(null);
    setDraft(fitStroke(done));
  };

  const wideFor = (n: FrameNote) => n.status === 'fixed' || fixing === n.id;

  const fix = async (noteId: string, r = p.route) => {
    setFixing(noteId);
    setNotices((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => k !== noteId)));
    const outcome = await p.run(noteId, r);
    setFixing(null);
    if (outcome.kind === 'applied') {
      const message = outcome.message?.trim();
      if (message) setMessages((cur) => ({ ...cur, [noteId]: message }));
      setShownFixed((cur) => [...cur, noteId]);
      timers.current.push(
        window.setTimeout(
          () => setShownFixed((cur) => cur.filter((id) => id !== noteId)),
          message ? FIXED_SHOWN_WITH_MESSAGE_MS : FIXED_SHOWN_MS,
        ),
      );
    } else if (outcome.kind === 'escalate') {
      const ranOnLocalLlm = r.kind === 'cloud' && Boolean(r.localLlm);
      const offerAltLocal =
        r.kind === 'device' && p.localLlmRoute?.kind === 'cloud'
          ? ('local-llm' as const)
          : ranOnLocalLlm && p.nanoRoute?.kind === 'device'
            ? ('nano' as const)
            : undefined;
      setNotices((cur) => ({
        ...cur,
        [noteId]: {
          kind: 'escalate',
          message: outcome.message,
          offerCloud: r.kind === 'device' || ranOnLocalLlm,
          ...(offerAltLocal ? { offerAltLocal } : {}),
        },
      }));
    } else if (outcome.kind === 'device-failed') {
      const offerAltLocal =
        p.localLlmRoute?.kind === 'cloud' ? ('local-llm' as const) : undefined;
      setNotices((cur) => ({
        ...cur,
        [noteId]: { kind: 'device-failed', ...(offerAltLocal ? { offerAltLocal } : {}) },
      }));
    } else if (outcome.kind === 'cloud-failed') {
      const ranOnLocalLlm = Boolean(outcome.localLlm) || (r.kind === 'cloud' && Boolean(r.localLlm));
      const offerAltLocal =
        ranOnLocalLlm && p.nanoRoute?.kind === 'device' ? ('nano' as const) : undefined;
      setNotices((cur) => ({
        ...cur,
        [noteId]: {
          kind: 'failed',
          ...(ranOnLocalLlm
            ? {
                message: outcome.reason
                  ? `Local AI failed: ${outcome.reason}`
                  : 'Local AI couldn’t fix that note.',
                offerCloud: true,
              }
            : {}),
          ...(offerAltLocal ? { offerAltLocal } : {}),
        },
      }));
    }
  };

  const save = (text: string) => {
    if (!draft) return;
    const note: FrameNote = {
      id: newNoteId(),
      tMs: p.noteTime(editorStore.getState().playheadMs),
      shape: draft.shape,
      text: text.slice(0, 300),
      status: 'open',
    };
    // One undo step for the note; the fix is another (a composite) when it lands.
    if (!p.add(note)) return;
    setDraft(null);
    void fix(note.id);
  };

  const aspect = p.aspect;
  const place = (region: ReturnType<typeof regionOf>, wide = false) =>
    bubbleAnchor(region, bubbleSize(aspect, wide));
  const draftN = notes.length + 1;
  const draftPlacement = draft ? place(draft.region, true) : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[6]" data-frame-notes>
      <svg
        aria-hidden
        className="absolute inset-0 size-full"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
      >
        {visible.map((n) => (
          <ShapeMark
            key={n.id}
            shape={n.shape}
            aspect={aspect}
            leader={place(regionOf(n.shape, aspect), wideFor(n))}
          />
        ))}
        {draft && draftPlacement && (
          <ShapeMark shape={draft.shape} aspect={aspect} leader={draftPlacement} />
        )}
        {drawMode && stroke && stroke.length > 1 && (
          <polyline
            points={stroke.map((q) => `${q.x},${q.y}`).join(' ')}
            fill="none"
            stroke={NOTE_STROKE}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      <AnimatePresence>
        {visible.map((n) => (
          <NoteView
            key={n.id}
            note={n}
            n={notes.indexOf(n) + 1}
            placement={place(regionOf(n.shape, aspect), wideFor(n))}
            fixed={n.status === 'fixed'}
            {...(n.status === 'fixed' && messages[n.id] ? { fixedMessage: messages[n.id] } : {})}
            busy={fixing === n.id || (p.working === targetId && fixing === n.id)}
            notice={notices[n.id] ?? null}
            canTryCloud={p.cloudRoute.kind === 'cloud'}
            cloudLabel={
              p.cloudRoute.kind === 'cloud' && p.cloudRoute.byok
                ? 'BYOK · 0'
                : (p.cost?.label ?? (p.cloudRoute.kind === 'cloud' ? String(p.cloudRoute.credits) : '1'))
            }
            {...(p.localModel ? { localModel: p.localModel } : {})}
            onDelete={() => p.remove(n.id)}
            onReopen={() => {
              p.reopen(n.id);
              setShownFixed((cur) => cur.filter((id) => id !== n.id));
            }}
            onFixAgain={() => void fix(n.id)}
            onTryCloud={() => void fix(n.id, p.cloudRoute)}
            onTryAltLocal={(target) => {
              const next = target === 'nano' ? p.nanoRoute : p.localLlmRoute;
              if (next) void fix(n.id, next);
            }}
          />
        ))}
        {draft && draftPlacement && (
          <NoteInput
            key="draft"
            n={draftN}
            placement={draftPlacement}
            route={p.route}
            {...(p.cost ? { cost: p.cost } : {})}
            {...(p.bothLocalConnected && p.localModel
              ? {
                  enginePicker: {
                    active: noteEngine === 'nano' ? 'nano' : 'local-llm',
                    localModel: p.localModel,
                    onChange: (next) => setNoteEngine(next),
                  },
                }
              : {})}
            onSave={save}
            onCancel={() => setDraft(null)}
          />
        )}
      </AnimatePresence>

      {drawMode && (
        <div
          ref={overlay}
          data-draw-layer
          aria-label="Draw a note on the frame"
          className="pointer-events-auto absolute inset-0 z-20 cursor-crosshair touch-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => setStroke(null)}
        />
      )}
    </div>
  );
}

/** A note's drawn shape and the leader line from its bubble, in frame units (0..1). */
function ShapeMark({
  shape,
  aspect,
  leader,
}: {
  shape: FrameNote['shape'];
  /** The frame's width over its height (a 3-value circle is round on screen). */
  aspect: number;
  leader: ReturnType<typeof bubbleAnchor>;
}) {
  const common = {
    fill: 'none',
    stroke: NOTE_STROKE,
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    vectorEffect: 'non-scaling-stroke' as const,
  };
  const pt = shape.points;
  return (
    <g>
      {shape.kind === 'circle' ? (
        <ellipse
          cx={pt[0]}
          cy={pt[1]}
          rx={pt[2]}
          ry={pt.length >= 4 ? pt[3] : Math.min(1, (pt[2] ?? 0) * aspect)}
          {...common}
        />
      ) : (
        <polyline
          points={Array.from(
            { length: Math.floor(pt.length / 2) },
            (_, i) => `${pt[2 * i]},${pt[2 * i + 1]}`,
          ).join(' ')}
          {...common}
        />
      )}
      <line x1={leader.from.x} y1={leader.from.y} x2={leader.to.x} y2={leader.to.y} {...common} />
    </g>
  );
}
