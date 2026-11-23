'use client';

import type { Slot } from '@motionpop/schemas';
import { useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Chip, CostChip } from '@/components/ui/chip';
import { Shimmer } from '@/components/ui/shimmer';
import { chipFor, type Route } from '@/lib/ai/route';
import { getRouter } from '@/lib/ai/router-client';
import { useRoute } from '@/lib/ai/use-route';
import { useCreditsClient } from '@/lib/credits/use-credits-client';
import { useAppConfig } from '@/lib/renders/hooks';
import { schemaFor } from '@/lib/motion/registry';
import { runQuickEdit, type QuickEditOutcome } from '@/lib/slots/quick-edit';
import { beginActivity, endActivity, useAIActivity } from '@/lib/stores/ai-activity';
import { editorStore } from '@/lib/stores/editor';
import { INSPECTOR_PROMPT_ID } from './prompt-box';

/** The attribute the out-of-credits "Keep editing" button uses to find the input (spec 13). */
export const QUICK_EDIT_ATTR = 'data-quick-edit-input';

export const DEVICE_FAILED = 'Couldn’t do that on your device.';

/** What is shown under the row after an answer that applied nothing. */
type Notice =
  { kind: 'escalate'; message: string } | { kind: 'device-failed'; instruction: string };

/**
 * "Quick edit · free on-device": 320×32, r8, 10 px placeholder, the route chip on the right
 * (110×19, 10 px from the edge). The chip is computed before the action by `chooseRoute`
 * (R7.1, R9.3): mint `⚡ free · on-device`, violet `☁ 1`, or the reason it is off. Enter runs the
 * edit; the row shimmers while it works (R7.6). An answer the device could not give is never
 * sent to the cloud by itself: the row says so and offers "Try in the cloud ☁ 1" (R7.4), and an
 * `escalate` answer offers "Generate ☁ 3" (R7.5).
 */
export function QuickEditRow({ slot }: { slot: Slot }) {
  const route = useRoute('edit.patch');
  const cloudRoute = useRoute('edit.patch', { forceCloud: true });
  const generateRoute = useRoute('generate');
  const { client: credits } = useCreditsClient();
  const config = useAppConfig();
  const [text, setText] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const busy = useAIActivity((s) => s.busy?.slotId === slot.id && s.busy.kind === 'edit');

  const planned = schemaFor(slot.componentId) === undefined;
  const chip = chipFor(route);
  const reason = planned ? 'Coming soon' : route.kind === 'disabled' ? route.reason : null;

  const run = async (r: Route, instruction: string) => {
    if (useAIActivity.getState().busy) return;
    setNotice(null);
    beginActivity('edit', slot.id);
    let outcome: QuickEditOutcome;
    try {
      outcome = await runQuickEdit(
        { store: editorStore, credits, getRouter, config, doc: document },
        slot.id,
        instruction,
        r,
      );
    } catch {
      outcome = r.kind === 'cloud' ? { kind: 'cloud-failed' } : { kind: 'device-failed' };
    }
    if (outcome.kind === 'applied') {
      setText('');
      endActivity({ slotId: slot.id, ms: outcome.ms });
      return;
    }
    endActivity();
    switch (outcome.kind) {
      case 'escalate':
        setNotice({ kind: 'escalate', message: outcome.message });
        break;
      case 'device-failed':
        setNotice({ kind: 'device-failed', instruction });
        break;
      case 'cloud-failed':
        toast('Couldn’t make that edit', {
          action: { label: 'Retry', onClick: () => void run(r, instruction) },
        });
        break;
      case 'changed':
        toast('The graphic changed. Try again.');
        break;
      case 'blocked':
        toast(outcome.reason);
        break;
      case 'no-credits':
        break; // the out-of-credits modal is open
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (text.trim() !== '') void run(route, text);
  };

  return (
    <div className="mt-2">
      <div
        aria-busy={busy}
        className="relative flex h-9 items-center overflow-hidden rounded-[10px] bg-card pr-2 pl-3 shadow-glass transition-shadow focus-within:shadow-violet-glow"
      >
        <input
          {...{ [QUICK_EDIT_ATTR]: '' }}
          aria-label="Quick edit"
          type="text"
          maxLength={500}
          value={text}
          readOnly={busy}
          disabled={reason !== null}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Quick edit… e.g. make it slower"
          className="relative z-10 h-full min-w-0 flex-1 bg-transparent text-[12px] leading-4 text-text outline-none placeholder:text-text-3 disabled:opacity-60"
        />
        <span className="relative z-10">
          {reason ? (
            <Chip tone="neutral">{reason}</Chip>
          ) : chip ? (
            <CostChip
              route={chip.route}
              credits={chip.route === 'cloud' ? chip.credits : 0}
              className={undefined}
            />
          ) : null}
        </span>
        {busy && <Shimmer tone="violet" />}
      </div>

      {notice?.kind === 'escalate' && (
        <Notice message={notice.message} onDismiss={() => setNotice(null)}>
          <Button
            variant="ai"
            size="sm"
            disabled={generateRoute.kind === 'disabled'}
            title={generateRoute.kind === 'disabled' ? generateRoute.reason : undefined}
            onClick={() => document.getElementById(INSPECTOR_PROMPT_ID)?.focus()}
            className="h-[26px] gap-1.5 pr-1.5 pl-3"
          >
            Generate
            <CostChip
              route="cloud"
              credits={generateRoute.kind === 'cloud' ? generateRoute.credits : 3}
            />
          </Button>
        </Notice>
      )}
      {notice?.kind === 'device-failed' && (
        <Notice message={DEVICE_FAILED} onDismiss={() => setNotice(null)}>
          <Button
            variant="ai"
            size="sm"
            disabled={cloudRoute.kind !== 'cloud'}
            title={cloudRoute.kind === 'disabled' ? cloudRoute.reason : undefined}
            onClick={() => void run(cloudRoute, notice.instruction)}
            className="h-[26px] gap-1.5 pr-1.5 pl-3"
          >
            Try in the cloud
            <CostChip
              route="cloud"
              credits={cloudRoute.kind === 'cloud' ? cloudRoute.credits : 1}
            />
          </Button>
        </Notice>
      )}
    </div>
  );
}

function Notice({
  message,
  onDismiss,
  children,
}: {
  message: string;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  return (
    <div role="status" className="mt-2 rounded-[10px] bg-card px-3 py-2.5 shadow-glass">
      <p className="text-[12px] leading-[17px] text-text-body">{message}</p>
      <div className="mt-2 flex items-center gap-3">
        {children}
        <button
          type="button"
          onClick={onDismiss}
          className="text-[11px] leading-[14px] text-text-3 transition-colors hover:text-text"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
