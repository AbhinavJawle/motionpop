'use client';

import type { Slot } from '@motionpop/schemas';
import { Divider, SectionLabel } from './parts';

/** VERSIONS: hairline at y499, label 9 px at y517, tiles 58×32 from x105 (task 15). */
export function VersionsStrip({ slot }: { slot: Slot }) {
  void slot;
  return (
    <section aria-label="Versions" data-inspector-versions>
      <Divider soft className="mt-2" />
      <div className="mt-[6px] flex h-8 items-center">
        <SectionLabel className="text-[9px] leading-[12px]">Versions</SectionLabel>
      </div>
    </section>
  );
}
