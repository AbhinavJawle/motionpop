import type { SlotTiming, Version } from '@motionpop/schemas';

let counter = 0;

/**
 * A new version record for `applyVersion`. The id is unique per call even inside one millisecond
 * (a counter), and readable in the autosave file (`v-slot-2-mi3k9x-1`).
 */
export function newVersion(input: {
  slotId: string;
  componentId: string;
  params: Record<string, unknown>;
  timing?: SlotTiming | undefined;
  source: Version['source'];
  label: string;
  model?: string | undefined;
  costCredits?: number;
  now: number;
}): Version {
  counter += 1;
  return {
    id: `v-${input.slotId}-${input.now.toString(36)}-${counter}`,
    slotId: input.slotId,
    componentId: input.componentId,
    params: structuredClone(input.params),
    source: input.source,
    costCredits: input.costCredits ?? 0,
    createdAt: input.now,
    label: input.label.slice(0, 80),
    ...(input.model ? { model: input.model } : {}),
    ...(input.timing && Object.keys(input.timing).length > 0
      ? { timing: { ...input.timing } }
      : {}),
  };
}
