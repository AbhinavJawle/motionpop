'use client';

import type { Slot } from '@motionpop/schemas';
import { ContentSection } from './content-section';
import { FailedNotice } from './failed-notice';
import { PictureSection } from './picture-section';
import { PlacementSection } from './placement-section';
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
      {slot.status === 'failed' && <FailedNotice slot={slot} />}
      <PromptBox key={`${slot.id}:${slot.prompt}`} slot={slot} />
      <QuickEditRow key={`quick:${slot.id}`} slot={slot} />
      <ContentSection key={`content:${slot.id}`} slot={slot} />
      <PlacementSection key={`placement:${slot.id}`} slot={slot} />
      <PictureSection
        key={`picture:${slot.id}:${(slot.params as { images?: { assetId?: string }[] }).images?.[0]?.assetId ?? ''}`}
        slot={slot}
      />
      <StyleRow />
      <TimingSection slot={slot} />
      <VersionsStrip slot={slot} />
    </>
  );
}
