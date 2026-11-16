'use client';

import type { Slot } from '@motionpop/schemas';
import { ContentSection } from './content-section';
import { InspectorHeader } from './header';
import { PromptBox } from './prompt-box';
import { QuickEditRow } from './quick-edit-row';
import { StyleRow } from './style-row';
import { TimingSection } from './timing-section';
import { VersionsStrip } from './versions-strip';
import { YouSaid } from './you-said';

/**
 * The graphic inspector's sections in the order of editor.png (spec 09 R1.1): header, You said,
 * prompt box, quick edit, CONTENT, STYLE, TIMING, VERSIONS. Vertical rhythm follows the
 * "Graphic inspector" frame in design/figma-export.css at 1440×900.
 */
export function InspectorBody({ slot }: { slot: Slot }) {
  return (
    <>
      <InspectorHeader slot={slot} />
      <YouSaid slot={slot} />
      <PromptBox key={`${slot.id}:${slot.prompt}`} slot={slot} />
      <QuickEditRow key={slot.id} slot={slot} />
      <ContentSection slot={slot} />
      <StyleRow />
      <TimingSection slot={slot} />
      <VersionsStrip slot={slot} />
    </>
  );
}
