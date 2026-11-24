'use client';

import { useId } from 'react';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/cn';
import { Tooltip } from '@/components/ui/tooltip';
import { SoonPill } from './soon-pill';

/**
 * A labelled switch of the export dialog (export.png): 14/18 label left, 40×22 switch right.
 * A "Soon" row is off and disabled, with the reason as the switch's description and a tooltip.
 */
export function SwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
  soon,
  disabledReason,
  className,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  /** Why it is not available yet; makes the row disabled with a "Soon" pill. */
  soon?: string;
  /** Why it is disabled for the current project (no "Soon" pill). */
  disabledReason?: string;
  className?: string;
}) {
  const id = useId();
  const descId = `${id}-desc`;
  const reason = soon ?? disabledReason;
  const disabled = Boolean(reason);
  return (
    <div className={cn('flex items-start justify-between', className)}>
      <div>
        <div
          className={cn(
            'text-[13px] leading-[18px] font-medium',
            disabled ? 'text-text-4' : 'text-text',
          )}
        >
          {label}
          {soon && <SoonPill />}
        </div>
        {hint && <div className="mt-[3px] text-[12px] leading-4 text-text-3">{hint}</div>}
      </div>
      <div className="-mt-[2px]">
        {reason ? (
          <Tooltip content={reason} side="top">
            <span id={descId} className="sr-only">
              {reason}
            </span>
            <span className="inline-flex opacity-50">
              <Toggle
                size="lg"
                checked={false}
                onCheckedChange={() => {}}
                disabled
                label={label}
                describedBy={descId}
              />
            </span>
          </Tooltip>
        ) : (
          <Toggle size="lg" checked={checked} onCheckedChange={onCheckedChange} label={label} />
        )}
      </div>
    </div>
  );
}
