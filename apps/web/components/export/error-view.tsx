'use client';

import { Pip } from '@/components/pip/pip';
import { Button } from '@/components/ui/button';
import { renderErrorMessage } from '@/lib/renders/export-flow';
import type { RenderView } from '@/lib/renders/render-client';

/**
 * A failed render (design §13.2, §15): Pip, the message for the code, "Try again" (a new request
 * with the same options) and "Close". Credits are back already (the server refunds first).
 */
export function ErrorView({
  view,
  free,
  onRetry,
  onClose,
}: {
  view: RenderView | null;
  free: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex min-h-[485px] flex-col items-center justify-center pb-6 text-center">
      <Pip state="idle" size={120} glow />
      <h3 className="mt-5 text-2xl leading-[31px] font-semibold">That one didn&apos;t make it</h3>
      <p role="alert" className="mt-2 max-w-[360px] text-[13px] leading-[17px] text-text-2">
        {renderErrorMessage(view?.error, free)}
      </p>
      <div className="mt-8 flex w-full gap-2">
        <Button
          variant="primary"
          className="h-12 flex-1 rounded-chip text-xs leading-4"
          onClick={onRetry}
        >
          Try again
        </Button>
        <Button
          variant="secondary"
          className="h-12 flex-1 rounded-chip text-xs leading-4"
          onClick={onClose}
        >
          Close
        </Button>
      </div>
    </div>
  );
}
