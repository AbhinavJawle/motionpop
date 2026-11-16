'use client';

import { Zap } from 'lucide-react';
import { Kbd } from '@/components/ui/kbd';
import { Modal } from '@/components/ui/modal';

const SHORTCUTS: ReadonlyArray<[string, string]> = [
  ['⌘K', 'Focus the capture bar'],
  ['Hold mic', 'Record right from the dashboard'],
  ['Space', 'Play or pause (editor), pause a recording'],
  ['Enter', 'Stop a recording'],
  ['⌘Z / ⇧⌘Z', 'Undo and redo'],
  ['⌘G', 'Generate the selected graphic'],
  ['Esc', 'Deselect, or ask to discard a take'],
];

/** "Help & shortcuts" (spec 11 R2.6), shared by the dashboard and Start. */
export function HelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Help & shortcuts"
      description="A few keys that make Pip quicker."
    >
      <ul className="flex flex-col divide-y divide-line-soft">
        {SHORTCUTS.map(([key, what]) => (
          <li key={key} className="flex items-center justify-between py-2.5 text-xs leading-4">
            <span className="text-text-2">{what}</span>
            <Kbd className="h-6 px-2">{key}</Kbd>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex gap-3 rounded-card bg-mint-tint px-4 py-3">
        <Zap className="mt-0.5 size-4 shrink-0 text-mint" strokeWidth={1.5} aria-hidden />
        <p className="text-xs leading-[18px] text-mint-ink">
          Small edits run on your device when your browser supports on-device AI: instant, free and
          private. Everything else uses cloud AI and shows its cost first.
        </p>
      </div>
    </Modal>
  );
}
