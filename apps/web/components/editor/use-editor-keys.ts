'use client';

import { useEffect } from 'react';
import {
  deleteSlot,
  duplicateSlot,
  moveSlot,
  removeStockAudio,
  removeStockOverlay,
} from '@/lib/commands';
import type { PlaybackClock } from '@/lib/editor/playback';
import { editorStore } from '@/lib/stores/editor';
import { cutVideoSegment, splitAtPlayhead } from '@/lib/timeline/edit-actions';

const FRAME_MS = 1000 / 30;

function typingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * A focused button, switch or menu item takes Space itself (it is how a keyboard user presses
 * it), so Space must not also start playback. A slot card keeps Space as play/pause.
 */
export function takesSpace(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('[data-slot-id]')) return false;
  if (target.tagName === 'BUTTON') return true;
  const role = target.getAttribute('role');
  return (
    role !== null && ['button', 'switch', 'checkbox', 'menuitem', 'option', 'tab'].includes(role)
  );
}

/**
 * Editor keyboard map (spec 04 R6.4, R7.1 + spec 45 R3.3–R3.4).
 * Space play/pause · S split at playhead · J/K/L shuttle · ←/→ one frame · ⇧←/→ one second
 * · ⌘Z / ⇧⌘Z · Delete/Backspace delete slot/clip/video segment · ⌘D duplicate · Esc deselect.
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
        e.target instanceof HTMLElement
          ? e.target.closest<HTMLElement>('[data-slot-id]')?.dataset.slotId
          : undefined;

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
          if (takesSpace(e.target)) return;
          e.preventDefault();
          shuttle = 0;
          clock.toggle();
          return;
        case 's':
        case 'S':
          if (e.altKey) return;
          e.preventDefault();
          splitAtPlayhead(clock.currentMs);
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
          } else if (s.selectedItem?.kind === 'stockOverlay') {
            e.preventDefault();
            s.exec(removeStockOverlay(s.selectedItem.id));
          } else if (s.selectedItem?.kind === 'stockAudio') {
            e.preventDefault();
            s.exec(removeStockAudio(s.selectedItem.id));
          } else if (s.selectedItem?.kind === 'videoSegment') {
            e.preventDefault();
            void cutVideoSegment(s.selectedItem, clock);
          }
          return;
        case 'Escape':
          // Leave draw mode first; the next Esc deselects (spec 09 R8.1). The note layer handles
          // its own draft (a bubble being typed in) before this runs.
          if (s.drawMode) s.setDrawMode(false);
          else {
            s.select(null);
            s.selectItem(null);
          }
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clock]);
}
