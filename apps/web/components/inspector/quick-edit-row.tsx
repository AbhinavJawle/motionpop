'use client';

import type { Slot } from '@motionpop/schemas';
import { Chip, CostChip } from '@/components/ui/chip';
import { chipFor } from '@/lib/ai/route';
import { useRoute } from '@/lib/ai/use-route';
import { schemaFor } from '@/lib/motion/registry';

/** The attribute the out-of-credits "Keep editing" button uses to find the input (spec 13). */
export const QUICK_EDIT_ATTR = 'data-quick-edit-input';

/**
 * "Quick edit · free on-device": 320×32, r8, 10 px placeholder, the route chip on the right
 * (110×19, 10 px from the edge). The chip is computed before the action by `chooseRoute`
 * (R7.1, R9.3): mint `⚡ free · on-device`, violet `☁ 1`, or the reason it is off.
 */
export function QuickEditRow({ slot }: { slot: Slot }) {
  const route = useRoute('edit.patch');
  const planned = schemaFor(slot.componentId) === undefined;
  const chip = chipFor(route);
  const reason = planned ? 'Coming soon' : route.kind === 'disabled' ? route.reason : null;
  return (
    <div className="mt-2 flex h-8 items-center rounded-lg bg-card pr-2.5 pl-2.5 shadow-glass focus-within:shadow-violet-glow">
      <input
        {...{ [QUICK_EDIT_ATTR]: '' }}
        aria-label="Quick edit"
        type="text"
        maxLength={500}
        disabled={reason !== null}
        placeholder="Quick edit… e.g. make it slower"
        className="h-full min-w-0 flex-1 bg-transparent text-[10px] leading-[13px] text-text outline-none placeholder:text-placeholder disabled:opacity-60"
      />
      {reason ? (
        <Chip tone="neutral">{reason}</Chip>
      ) : chip ? (
        <CostChip
          route={chip.route}
          credits={chip.route === 'cloud' ? chip.credits : 0}
          className={chip.route === 'device' ? 'w-[110px] justify-start pl-2' : undefined}
        />
      ) : null}
    </div>
  );
}
