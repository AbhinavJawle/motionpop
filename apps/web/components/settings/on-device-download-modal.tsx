'use client';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

/**
 * The warning before the on-device model download (founder, 2026-11-16: the download is large and
 * fully optional, so nothing starts without this confirmation). The "Download model" click is the
 * user gesture the Prompt API needs.
 */
export const DOWNLOAD_FACTS = [
  'You are about to download Google’s Gemini Nano model (~4 GB) directly into Chrome. Chrome requires about 22 GB of free disk space before it starts the download.',
  'Desktop Chrome only: requires Desktop Chrome (138+) on a computer with more than 4 GB of GPU memory (VRAM) or 16 GB+ of RAM. Other browsers automatically use cloud AI.',
  'It’s completely optional. Without it, edits run in the cloud and every feature works the same.',
  'Chrome stores one shared copy across all sites and removes it automatically if your disk runs low.',
] as const;

export function OnDeviceDownloadModal({
  open,
  onClose,
  onConfirm,
  title = 'Download Gemini Nano (~4 GB)?',
  description = 'You are about to enable on-device AI and download a large model to your computer.',
  confirmLabel = 'Download model',
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      className="w-[500px]"
    >
      <ul className="flex flex-col gap-2.5 text-[13px] leading-[18px] text-text-2">
        {DOWNLOAD_FACTS.map((fact) => (
          <li key={fact} className="flex gap-2">
            <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-text-3" />
            <span>{fact}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" size="md" onClick={onClose}>
          Not now
        </Button>
        <Button
          variant="ai"
          size="md"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
