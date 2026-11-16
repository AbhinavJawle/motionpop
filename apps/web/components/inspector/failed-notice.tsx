'use client';

import type { Slot } from '@motionpop/schemas';
import { Button } from '@/components/ui/button';
import { CostChip } from '@/components/ui/chip';
import { applyTemplate } from '@/lib/slots/apply-template';
import { useGenerate } from '@/lib/slots/use-generate';
import { editorStore } from '@/lib/stores/editor';

/**
 * A slot whose Generate failed (spec 09 R6.6): "Couldn't generate" with Retry (a new attempt, a
 * new credit key, the cost shown) and "Use a template" (free, from the spoken words or the
 * component's defaults). The credits of the failed attempt were already returned.
 */
export function FailedNotice({ slot }: { slot: Slot }) {
  const gen = useGenerate(slot);
  const cost = gen.route.kind === 'cloud' ? gen.route.credits : 3;
  return (
    <div
      role="alert"
      className="mt-2 rounded-chip bg-card px-3 py-2.5 shadow-[inset_0_0_0_1px_rgb(255_90_95/0.45)]"
    >
      <p className="text-[11px] leading-4 font-medium text-error">
        {slot.error ?? 'Couldn’t generate'}
      </p>
      <p className="mt-0.5 text-[10px] leading-[13px] text-text-3">
        Your credits are back. Try again, or start from a template.
      </p>
      <div className="mt-2 flex items-center gap-3">
        <Button
          variant="ai"
          size="sm"
          disabled={gen.disabledReason !== null}
          title={gen.disabledReason ?? undefined}
          onClick={gen.run}
          className="h-[26px] gap-1.5 pr-1.5 pl-3"
        >
          Retry
          <CostChip route="cloud" credits={cost} />
        </Button>
        <button
          type="button"
          onClick={() => applyTemplate(editorStore, slot.id, document)}
          className="text-[11px] leading-[14px] text-text-2 underline-offset-2 transition-colors hover:text-text hover:underline"
        >
          Use a template
        </button>
      </div>
    </div>
  );
}
