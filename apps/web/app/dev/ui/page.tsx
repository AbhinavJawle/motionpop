'use client';

import { ChevronDown, Upload } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { BrandKitChip } from '@/components/ui/brand-kit-chip';
import { Button } from '@/components/ui/button';
import { Chip, CostChip, SyncedChip } from '@/components/ui/chip';
import { CreditsChip } from '@/components/ui/credits-chip';
import { Kbd } from '@/components/ui/kbd';
import { NumberRoll } from '@/components/ui/number-roll';
import { SegmentedPills } from '@/components/ui/segmented-pills';
import { StatusDot } from '@/components/ui/status-dot';
import { Toggle } from '@/components/ui/toggle';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="label-caps">{title}</h2>
      <div className="flex flex-wrap items-center gap-4">{children}</div>
    </section>
  );
}

/** Design-system gallery (spec 02). Dev only. */
export default function UiGallery() {
  const [format, setFormat] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [captions, setCaptions] = useState(true);
  const [fade, setFade] = useState(false);
  const [credits, setCredits] = useState(120);
  const [timer, setTimer] = useState(4.2);

  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-10 px-10 py-10">
      <header className="flex flex-col gap-1">
        <span className="label-caps text-ember">Design system</span>
        <h1 className="text-[32px] leading-10 font-semibold tracking-tight">motionpop UI</h1>
      </header>

      <Section title="Top bar">
        <SegmentedPills
          label="Format"
          value={format}
          onChange={setFormat}
          options={[
            { value: '16:9', label: '16:9' },
            { value: '9:16', label: '9:16' },
            { value: '1:1', label: '1:1' },
          ]}
        />
        <BrandKitChip />
        <CreditsChip credits={credits} onClick={() => setCredits((c) => c - 3)} />
        <Button variant="primary" size="lg" className="w-[114px] justify-between">
          <Upload strokeWidth={1.5} aria-hidden />
          Export
          <ChevronDown strokeWidth={1.5} className="!size-3" aria-hidden />
        </Button>
      </Section>

      <Section title="Buttons">
        <Button variant="primary" size="lg">
          Export video
        </Button>
        <Button variant="ai" size="sm" className="w-[122px] justify-between pr-1">
          ✦ Generate
          <CostChip route="cloud" credits={3} />
        </Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="secondary" disabled>
          Disabled
        </Button>
      </Section>

      <Section title="Chips">
        <CostChip route="device" />
        <CostChip route="cloud" credits={3} />
        <SyncedChip />
        <Chip tone="violet">Suggested</Chip>
        <Chip tone="ember">Selected</Chip>
        <Chip>Neutral</Chip>
      </Section>

      <Section title="Toggles, status, keys">
        <label className="flex items-center gap-2 text-xs">
          Captions <Toggle checked={captions} onCheckedChange={setCaptions} label="Captions" />
        </label>
        <label className="flex items-center gap-2 text-xs">
          Fade <Toggle checked={fade} onCheckedChange={setFade} label="Fade" />
        </label>
        <span className="flex items-center gap-2 font-mono text-xs">
          <StatusDot tone="mint" pulse /> Ready in{' '}
          <NumberRoll value={timer} decimals={1} suffix="s" />
        </span>
        <span className="flex items-center gap-2 text-xs text-text-2">
          <StatusDot tone="mint" /> All changes saved
        </span>
        <span className="flex items-center gap-1 text-[11px] text-text-3">
          <Kbd>Space</Kbd> play · <Kbd>⌘G</Kbd> generate
        </span>
      </Section>

      <Section title="Number roll">
        <NumberRoll value={credits} className="text-[40px]" />
        <Button onClick={() => setCredits((c) => c + 97)}>+97</Button>
        <Button onClick={() => setTimer(Math.round(Math.random() * 99) / 10)}>Random time</Button>
      </Section>
    </main>
  );
}
