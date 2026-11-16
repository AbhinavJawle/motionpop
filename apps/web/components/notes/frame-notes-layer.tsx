'use client';

import { FORMATS, type FrameNote } from '@motionpop/schemas';
import { AnimatePresence } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { toast } from 'sonner';
import { addNote, deleteNote, setNoteStatus } from '@/lib/commands';
import { noteTimeFor, slotAt } from '@/lib/notes/active-slot';
import {
  bubbleAnchor,
  bubbleSize,
  ellipseAround,
  fitStroke,
  regionOf,
  type FittedStroke,
  type Pt,
} from '@/lib/notes/geometry';
import { focalRegion } from '@/lib/notes/region-text';
import { useNoteFix } from '@/lib/notes/use-note-fix';
import { useAIActivity } from '@/lib/stores/ai-activity';
import { editorStore, useEditor } from '@/lib/stores/editor';
import { NOTE_STROKE, NoteInput, NoteView, type NoteNotice } from './note-bubble';

/** A fixed note stays on screen with "Fixed" and "Still there?" for this long (R8.6). */
export const FIXED_SHOWN_MS = 4000;

let noteCounter = 0;
const newNoteId = () => `note-${Date.now().toString(36)}-${(noteCounter++).toString(36)}`;

/**
 * Frame notes over the preview (spec 09 R8): the pen's draw layer, the open notes of the slot
 * under the playhead while paused (hidden while playing), the numbered bubble with its leader
 * line, and the input where a new note's text goes. Place inside the frame card (`relative`).
 * The layer itself ignores the pointer, except while the pen is on, so the player is never
 * blocked; the player's own iframe never receives these strokes.
 */
export function FrameNotesLayer() {
  const slots = useEditor((s) => s.project?.slots);
  const format = useEditor((s) => s.project?.format ?? '16:9');
  const playheadMs = useEditor((s) => s.playheadMs);
  const playing = useEditor((s) => s.playing);
  const drawMode = useEditor((s) => s.drawMode);
  const setDrawMode = useEditor((s) => s.setDrawMode);
  const { route, cloudRoute, run } = useNoteFix();
  const working = useAIActivity((s) => (s.busy?.kind === 'note' ? s.busy.slotId : null));

  const slot = useMemo(() => (slots ? slotAt(slots, playheadMs) : null), [slots, playheadMs]);
  const overlay = useRef<HTMLDivElement | null>(null);
  const [stroke, setStroke] = useState<Pt[] | null>(null);
  const [pending, setPending] = useState<(FittedStroke & { slotId: string }) | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const [shownFixed, setShownFixed] = useState<readonly string[]>([]);
  const [notices, setNotices] = useState<Record<string, NoteNotice>>({});
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // The pen is off while the video plays, and a draft belongs to one slot.
  useEffect(() => {
    if (playing && drawMode) setDrawMode(false);
  }, [playing, drawMode, setDrawMode]);
  const frame = FORMATS[format];
  const slotId = slot?.id;
  // A draft belongs to the slot it was drawn on and to the pen being on: derived, not reset.
  const draft = drawMode && pending && pending.slotId === slot?.id ? pending : null;
  const setDraft = (d: FittedStroke | null) =>
    setPending(d && slot ? { ...d, slotId: slot.id } : null);

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
      const player = document.querySelector<HTMLElement & { iframeElement?: HTMLIFrameElement }>(
        'hyperframes-player',
      );
      let doc: Document | null = null;
      try {
        doc = player?.iframeElement?.contentDocument ?? null;
      } catch {
        doc = null;
      }
      const focal = focalRegion(doc, frame);
      if (!focal) {
        toast('Nothing to circle on this frame. Draw around it instead.');
        return;
      }
      e.preventDefault();
      if (slotId) setPending({ ...ellipseAround(focal), slotId });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawMode, draft, frame, slotId]);

  if (!slot) return null;
  const notes = slot.notes;
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

  const fix = async (noteId: string, r = route) => {
    setFixing(noteId);
    setNotices((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => k !== noteId)));
    const outcome = await run(slot.id, noteId, r);
    setFixing(null);
    if (outcome.kind === 'applied') {
      setShownFixed((cur) => [...cur, noteId]);
      timers.current.push(
        window.setTimeout(
          () => setShownFixed((cur) => cur.filter((id) => id !== noteId)),
          FIXED_SHOWN_MS,
        ),
      );
    } else if (outcome.kind === 'escalate') {
      setNotices((cur) => ({ ...cur, [noteId]: { kind: 'escalate', message: outcome.message } }));
    } else if (outcome.kind === 'device-failed') {
      setNotices((cur) => ({ ...cur, [noteId]: { kind: 'device-failed' } }));
    } else if (outcome.kind === 'cloud-failed') {
      setNotices((cur) => ({ ...cur, [noteId]: { kind: 'failed' } }));
    }
  };

  const save = (text: string) => {
    if (!draft) return;
    const note: FrameNote = {
      id: newNoteId(),
      tMs: noteTimeFor(slot, editorStore.getState().playheadMs),
      shape: draft.shape,
      text: text.slice(0, 300),
      status: 'open',
    };
    // One undo step for the note; the fix is another (a composite) when it lands.
    if (!editorStore.getState().exec(addNote(slot.id, note))) return;
    editorStore.getState().select(slot.id);
    setDraft(null);
    void fix(note.id);
  };

  const aspect = frame.width / frame.height;
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
            points={stroke.map((p) => `${p.x},${p.y}`).join(' ')}
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
            busy={fixing === n.id || (working === slot.id && fixing === n.id)}
            notice={notices[n.id] ?? null}
            onDelete={() => editorStore.getState().exec(deleteNote(slot.id, n.id))}
            onReopen={() => {
              editorStore.getState().exec(setNoteStatus(slot.id, n.id, 'open'));
              setShownFixed((cur) => cur.filter((id) => id !== n.id));
            }}
            onFixAgain={() => void fix(n.id)}
            onTryCloud={() => void fix(n.id, cloudRoute)}
          />
        ))}
        {draft && draftPlacement && (
          <NoteInput
            key="draft"
            n={draftN}
            placement={draftPlacement}
            route={route}
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
  const p = shape.points;
  return (
    <g>
      {shape.kind === 'circle' ? (
        <ellipse
          cx={p[0]}
          cy={p[1]}
          rx={p[2]}
          ry={p.length >= 4 ? p[3] : Math.min(1, (p[2] ?? 0) * aspect)}
          {...common}
        />
      ) : (
        <polyline
          points={Array.from(
            { length: Math.floor(p.length / 2) },
            (_, i) => `${p[2 * i]},${p[2 * i + 1]}`,
          ).join(' ')}
          {...common}
        />
      )}
      <line x1={leader.from.x} y1={leader.from.y} x2={leader.to.x} y2={leader.to.y} {...common} />
    </g>
  );
}
