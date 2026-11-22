'use client';

import { FORMATS } from '@motionpop/schemas';
import { useCallback, useMemo } from 'react';
import { addNote, deleteNote, setNoteStatus } from '@/lib/commands';
import { noteTimeFor, slotAt } from '@/lib/notes/active-slot';
import { focalRegion } from '@/lib/notes/region-text';
import { useNoteFix } from '@/lib/notes/use-note-fix';
import { useAIActivity } from '@/lib/stores/ai-activity';
import { editorStore, useEditor } from '@/lib/stores/editor';
import { NotesOverlay } from './notes-overlay';

export { FIXED_SHOWN_MS } from './notes-overlay';

/**
 * Frame notes on graphic slots (spec 09 R8): the shared overlay over the HyperFrames player,
 * for the slot under the playhead. Fixes run `note.fix` on the slot's params.
 */
export function FrameNotesLayer() {
  const slots = useEditor((s) => s.project?.slots);
  const format = useEditor((s) => s.project?.format ?? '16:9');
  const playheadMs = useEditor((s) => s.playheadMs);
  const { route, cloudRoute, run } = useNoteFix();
  const working = useAIActivity((s) => (s.busy?.kind === 'note' ? s.busy.slotId : null));
  const slot = useMemo(() => (slots ? slotAt(slots, playheadMs) : null), [slots, playheadMs]);
  const frame = FORMATS[format];

  const focal = useCallback(() => {
    const player = document.querySelector<HTMLElement & { iframeElement?: HTMLIFrameElement }>(
      'hyperframes-player',
    );
    let doc: Document | null = null;
    try {
      doc = player?.iframeElement?.contentDocument ?? null;
    } catch {
      doc = null;
    }
    return focalRegion(doc, frame);
  }, [frame]);

  if (!slot) return null;
  return (
    <NotesOverlay
      targetId={slot.id}
      notes={slot.notes}
      aspect={frame.width / frame.height}
      route={route}
      cloudRoute={cloudRoute}
      noteTime={(ms) => noteTimeFor(slot, ms)}
      add={(note) => {
        if (!editorStore.getState().exec(addNote(slot.id, note))) return false;
        editorStore.getState().select(slot.id);
        return true;
      }}
      remove={(id) => editorStore.getState().exec(deleteNote(slot.id, id))}
      reopen={(id) => editorStore.getState().exec(setNoteStatus(slot.id, id, 'open'))}
      run={(id, r) => run(slot.id, id, r)}
      focal={focal}
      working={working}
    />
  );
}
