'use client';

import type { ClientCreditAction } from '@motionpop/schemas';
import { Coins } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { Pip } from '@/components/pip/pip';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import {
  closeOutOfCredits,
  openOutOfCredits,
  useCreditsUi,
  type OutOfCreditsInfo,
} from '@/lib/credits/credits-ui';

/** The action in words for "Generate costs 3". */
export const ACTION_LABEL: Record<ClientCreditAction, string> = {
  generate: 'Generate',
  edit: 'A cloud quick edit',
  'pip-plan': 'A Pip plan',
  custom: 'A custom graphic',
  film: 'A film',
  reel: 'A directed reel',
  music: 'A soundtrack',
  'slots-detect': 'Finding moments',
  tts: 'Voice generation',
  transcribe: 'Transcription',
  image: 'An image',
};

/** "0 available · Generate costs 3": the reason the modal opened, in mono. */
export function costLine(info: OutOfCreditsInfo): string {
  const available = info.balance === null ? '0' : String(info.balance);
  return `${available} available · ${ACTION_LABEL[info.action]} costs ${info.cost}`;
}

/** Put the cursor back in the quick edit row when a slot is selected (spec 09 marks the input). */
function focusQuickEdit(): void {
  document.querySelector<HTMLElement>('[data-quick-edit-input]')?.focus();
}

/**
 * Out of credits (not designed; screens.md): the export dialog's backdrop and glass, Pip with
 * empty pockets in the ember bloom, one primary button. On-device edits stay free, which is the
 * point of the copy. Reduced motion gives Pip's static pose (handled by `Pip`).
 */
export function OutOfCreditsModal({
  info,
  onClose,
}: {
  info: OutOfCreditsInfo | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={info !== null}
      onClose={onClose}
      title="Pip needs a recharge"
      description="You can still make small edits on your device for free."
      hideHeading
      className="w-[440px] px-8 pt-9 pb-8"
      contentClassName="mt-0"
    >
      <div className="flex flex-col items-center text-center">
        <div className="relative flex h-[172px] w-full items-center justify-center">
          <div aria-hidden className="absolute inset-x-0 -top-3 bottom-0 bg-ember-bloom" />
          <div className="relative">
            <Pip state="empty-pockets" size={120} glow decorative />
          </div>
        </div>
        <p className="mt-2 text-[26px] leading-8 font-semibold tracking-[-0.4px]">
          Pip needs a recharge
        </p>
        <p className="mt-2 text-[13px] leading-[18px] text-text-2">
          You can still make small edits on your device for free.
        </p>
        {info && (
          <p
            data-testid="out-of-credits-cost"
            className="tabular mt-4 font-mono text-[11px] leading-[14px] text-text-3"
          >
            {costLine(info)}
          </p>
        )}
        <div className="mt-6 flex w-full flex-col gap-2.5">
          <Link
            href="/pricing"
            onClick={onClose}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-chip bg-ember px-4 text-[13px] font-medium text-white transition hover:brightness-110"
          >
            <Coins className="size-4" strokeWidth={2} aria-hidden />
            Buy credits
          </Link>
          <Button
            variant="secondary"
            size="lg"
            className="h-10 w-full"
            onClick={() => {
              onClose();
              // After the modal's own focus restore has run.
              setTimeout(focusQuickEdit, 50);
            }}
          >
            Keep editing
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Mounted once in the app layout: opens from `openOutOfCredits` anywhere. */
export function OutOfCreditsHost() {
  const info = useCreditsUi((s) => s.outOfCredits);
  useEffect(() => {
    // Dev and test builds only: lets the design-check e2e open the modal without a balance of 0.
    if (process.env.NODE_ENV === 'production') return;
    (window as unknown as Record<string, unknown>)['__openOutOfCredits'] = openOutOfCredits;
  }, []);
  return <OutOfCreditsModal info={info} onClose={closeOutOfCredits} />;
}
