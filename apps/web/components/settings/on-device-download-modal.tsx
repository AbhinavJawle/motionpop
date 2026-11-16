'use client';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

/**
 * The warning before the on-device model download (founder, 2026-11-16: the download is large and
 * fully optional, so nothing starts without this confirmation). The "Download model" click is the
 * user gesture the Prompt API needs.
 */
export const DOWNLOAD_FACTS = [
  'Chrome downloads Google’s Gemini Nano model to this computer. The model is several gigabytes, and Chrome only starts when about 22 GB of disk space is free.',
  'It needs desktop Chrome on a computer with a graphics card with more than 4 GB of memory, or 16 GB of RAM.',
  'It’s optional. Without it, edits run in the cloud and everything works the same.',
  'Chrome keeps one copy for every site and deletes it by itself if your disk runs low.',
] as const;

export function OnDeviceDownloadModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Download the on-device model?"
      description="Free, private edits that run on your computer."
      className="w-[480px]"
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
          Download model
        </Button>
      </div>
    </Modal>
  );
}
