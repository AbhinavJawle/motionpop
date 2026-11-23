'use client';

import type { Slot } from '@motionpop/schemas';
import { Check, ChevronDown, Copy, LayoutTemplate, MoreHorizontal, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/lib/cn';
import { componentName, formatClock } from '@/lib/editor/slot-display';
import {
  applyTemplateAction,
  deleteSlotAction,
  duplicateSlotAction,
} from '@/lib/inspector/slot-actions';
import { popIn } from '@/lib/motion/presets';
import { GRAPHIC_TYPES } from '@/lib/slots/graphic-types';
import { switchGraphic } from '@/lib/slots/switch-graphic';
import { looseReason } from '@/lib/slots/loose';
import { editorStore, useEditor } from '@/lib/stores/editor';

/**
 * Inspector header (spec 33): "Graphic 2 · 0:04.2 – 0:07.8 · 3.6s" as a quiet eyebrow, the
 * graphic type as the title (a menu), and the ⋯ menu.
 */
export function InspectorHeader({ slot }: { slot: Slot }) {
  const slotNumber = useEditor(
    (s) => s.project?.slots.filter((x) => x.startMs <= slot.startMs).length ?? 0,
  );
  const seconds = ((slot.endMs - slot.startMs) / 1000).toFixed(1);
  return (
    <div className="relative pt-4 pb-1">
      <p className="flex h-6 items-center gap-1.5 pr-9 text-[11px] leading-[14px] text-text-3">
        <span className="font-medium text-text-2">Graphic {slotNumber}</span>
        <span aria-hidden>·</span>
        <span className="tabular font-mono">
          {formatClock(slot.startMs)} – {formatClock(slot.endMs)}
        </span>
        <span aria-hidden>·</span>
        <span className="tabular font-mono">{seconds}s</span>
      </p>
      <h2 className="mt-1 flex h-7 items-center text-[17px] leading-[22px] font-semibold tracking-[-0.01em] whitespace-nowrap">
        <TypePicker slot={slot} />
      </h2>
      <SlotMenu slotId={slot.id} />
    </div>
  );
}

function SlotMenu({ slotId }: { slotId: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={rootRef} className="absolute top-4 right-0">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Slot actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex size-7 items-center justify-center rounded-md text-text-2 transition-colors hover:bg-white/6 hover:text-text"
      >
        <MoreHorizontal className="size-4" strokeWidth={1.5} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            {...popIn}
            role="menu"
            aria-label="Slot actions"
            className="absolute top-full right-0 z-50 mt-1 w-[188px] origin-top-right rounded-card bg-card-2 p-1 shadow-pop"
          >
            <MenuItem
              icon={<Copy className="size-3.5" strokeWidth={1.5} />}
              shortcut="⌘D"
              onSelect={run(() => {
                if (!duplicateSlotAction(editorStore, slotId)) return;
                toast('Duplicated');
              })}
            >
              Duplicate
            </MenuItem>
            <MenuItem
              icon={<LayoutTemplate className="size-3.5" strokeWidth={1.5} />}
              onSelect={run(() => {
                const outcome = applyTemplateAction(editorStore, slotId, document);
                if (outcome === 'unavailable') toast('This graphic has no template yet.');
              })}
            >
              Use a template
            </MenuItem>
            <MenuItem
              danger
              icon={<Trash2 className="size-3.5" strokeWidth={1.5} />}
              shortcut="⌫"
              onSelect={run(() => void deleteSlotAction(editorStore, slotId))}
            >
              Delete
            </MenuItem>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({
  icon,
  shortcut,
  danger,
  onSelect,
  children,
}: {
  icon: ReactNode;
  shortcut?: string;
  danger?: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] leading-4 transition-colors hover:bg-white/6',
        danger ? 'text-error' : 'text-text-body hover:text-text',
      )}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {shortcut && <Kbd className="h-4 bg-white/10">{shortcut}</Kbd>}
    </button>
  );
}

/**
 * The graphic's type as a menu: pick another and the slot becomes it, drafted from its own words
 * (free, one undo step). Generate then fills it properly.
 */
function TypePicker({ slot }: { slot: Slot }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  const pick = (id: string) => {
    setOpen(false);
    if (id === slot.componentId) return;
    if (!switchGraphic(editorStore, slot.id, id, document)) {
      toast(looseReason(id));
    }
  };
  return (
    <span ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Graphic type"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="-ml-1.5 inline-flex h-7 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-white/6"
      >
        {componentName(slot.componentId)}
        <ChevronDown className="size-4 text-text-3" strokeWidth={1.5} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            {...popIn}
            role="menu"
            aria-label="Graphic type"
            className="absolute top-full left-0 z-50 mt-1 w-[248px] origin-top-left rounded-card bg-card-2 p-1 shadow-pop"
          >
            {GRAPHIC_TYPES.map((t) => {
              const current = t.id === slot.componentId;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={current}
                  onClick={() => pick(t.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/6"
                >
                  <span className="flex-1">
                    <span className="block text-[12px] leading-[16px] font-medium text-text">
                      {t.name}
                    </span>
                    <span className="block text-[11px] leading-[14px] font-normal text-text-3">
                      {t.about}
                    </span>
                  </span>
                  {current && <Check className="size-3.5 text-violet" strokeWidth={2} />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}
