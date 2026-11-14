'use client';

import { useEffect } from 'react';
import { deleteSlot, duplicateSlot, moveSlot } from '@/lib/commands';
import type { PlaybackClock } from '@/lib/editor/playback';
import { editorStore } from '@/lib/stores/editor';

const FRAME_MS = 1000 / 30;

function typingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Editor keyboard map (spec 04 R6.4, R7.1). Space play/pause · J/K/L shuttle · ←/→ one frame
 * · ⇧←/→ one second · ⌘Z / ⇧⌘Z · Delete/Backspace delete slot · ⌘D duplicate · Esc deselect.
 * With a slot focused, arrows nudge the slot instead of the playhead.
 */
export function useEditorKeys(clock: PlaybackClock): void {
  useEffect(() => {
    let shuttle = 0;
    const onKey = (e: KeyboardEvent) => {
      if (typingInField(e.target)) return;
      const s = editorStore.getState();
      if (!s.project) return;
      const mod = e.metaKey || e.ctrlKey;
      const focusedSlot =
        e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('[data-slot-id]')?.dataset.slotId : undefined;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (s.selectedSlotId) {
          const newId = `slot-${Date.now().toString(36)}`;
          if (s.exec(duplicateSlot(s.selectedSlotId, newId))) s.select(newId);
        }
        return;
      }
      if (mod) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          shuttle = 0;
          clock.toggle();
          return;
        case 'k':
        case 'K':
          shuttle = 0;
          clock.pause();
          return;
        case 'l':
        case 'L':
          shuttle = Math.min(4, Math.max(1, shuttle * 2 || 1));
          void clock.play(shuttle);
          return;
        case 'j':
        case 'J':
          // Reverse playback isn't possible on an <audio> element; J steps back a second.
          shuttle = 0;
          clock.pause();
          clock.seek(clock.currentMs - 1000);
          return;
        case 'ArrowLeft':
        case 'ArrowRight': {
          e.preventDefault();
          const step = (e.shiftKey ? 1000 : FRAME_MS) * (e.key === 'ArrowLeft' ? -1 : 1);
          const slot = focusedSlot ? s.project.slots.find((x) => x.id === focusedSlot) : undefined;
          if (slot) s.exec(moveSlot(slot.id, Math.round(slot.startMs + step)));
          else clock.seek(clock.currentMs + step);
          return;
        }
        case 'Delete':
        case 'Backspace':
          if (s.selectedSlotId) {
            e.preventDefault();
            s.exec(deleteSlot(s.selectedSlotId));
          }
          return;
        case 'Escape':
          s.select(null);
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clock]);
}
