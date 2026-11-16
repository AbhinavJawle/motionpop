'use client';

import type { Slot } from '@motionpop/schemas';
import { Copy, LayoutTemplate, MoreHorizontal, Trash2 } from 'lucide-react';
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
import { editorStore, useEditor } from '@/lib/stores/editor';

/**
 * "GRAPHIC", "Slot 2 · Bar chart", the time range and the ⋯ menu (design/figma-export.css,
 * "Graphic inspector": label y12, title y28 17/22 semibold, time y52 mono 11).
 */
export function InspectorHeader({ slot }: { slot: Slot }) {
  const slotNumber = useEditor(
    (s) => s.project?.slots.filter((x) => x.startMs <= slot.startMs).length ?? 0,
  );
  return (
    <div className="relative -mx-5 px-5">
      <p className="pt-3 text-[10px] leading-[13px] font-medium tracking-[1.4px] text-eyebrow">
        GRAPHIC
      </p>
      <h2 className="mt-[3px] h-[22px] pr-10 text-[17px] leading-[22px] font-semibold whitespace-nowrap">
        Slot {slotNumber} · {componentName(slot.componentId)}
      </h2>
      <p className="mt-0.5 h-[14px] font-mono text-[11px] leading-[14px] text-text-2">
        {formatClock(slot.startMs)} – {formatClock(slot.endMs)}
      </p>
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
    <div ref={rootRef} className="absolute top-[26px] right-[28px]">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Slot actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex size-6 items-center justify-center rounded-md text-text-2 transition-colors hover:bg-card hover:text-text"
      >
        <MoreHorizontal className="size-4" strokeWidth={1.5} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            {...popIn}
            role="menu"
            aria-label="Slot actions"
            className="absolute top-full right-0 z-50 mt-1 w-[168px] origin-top-right rounded-card bg-card-2 p-1 shadow-glass"
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
        'flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[11px] leading-[14px] transition-colors hover:bg-card-3',
        danger ? 'text-error' : 'text-text-body hover:text-text',
      )}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {shortcut && <Kbd className="h-4 bg-white/10">{shortcut}</Kbd>}
    </button>
  );
}
