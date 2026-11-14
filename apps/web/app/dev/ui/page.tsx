'use client';

import {
  ChevronDown,
  Frame,
  Pencil,
  RectangleHorizontal,
  RectangleVertical,
  Square,
  Upload,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Pip } from '@/components/pip/pip';
import { PipAvatar } from '@/components/pip/pip-avatar';
import { PIP_PROPS, PIP_STATES, type PipState } from '@/components/pip/states';
import { BrandKitChip } from '@/components/ui/brand-kit-chip';
import { Button } from '@/components/ui/button';
import { Chip, CostChip, SyncedChip } from '@/components/ui/chip';
import { CreditsChip } from '@/components/ui/credits-chip';
import { Dropdown } from '@/components/ui/dropdown';
import { Input, Textarea } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Tabs } from '@/components/ui/tabs';
import { Card, OptionCard } from '@/components/ui/card';
import { GlassToolbar, ToolbarDivider } from '@/components/ui/glass-toolbar';
import { Modal } from '@/components/ui/modal';
import { Shimmer } from '@/components/ui/shimmer';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
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
  const [pipState, setPipState] = useState<PipState>('idle');
  const [timing, setTiming] = useState(3.6);
  const [zoom, setZoom] = useState(54);
  const [style, setStyle] = useState<'editorial' | 'dark-money' | 'clean'>('editorial');
  const [tab, setTab] = useState<'transcript' | 'captions'>('transcript');
  const [modalOpen, setModalOpen] = useState(false);
  const [res, setRes] = useState<'720p' | '1080p' | '4K'>('1080p');

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

      <Section title="Fields (inspector, 320 wide)">
        <div className="flex w-[320px] flex-col gap-3">
          <Textarea
            defaultValue="A clean, animated bar chart with warm orange bars and an editorial feel."
            footer={
              <Button variant="ai" size="sm" className="w-[122px] justify-between pr-1">
                ✦ Generate
                <CostChip route="cloud" credits={3} />
              </Button>
            }
          />
          <Input
            density="roomy"
            placeholder="Quick edit… e.g. make it slower"
            trailing={<CostChip route="device" />}
          />
          <Input defaultValue="Revenue grew 40%" aria-label="Title" />
          <div className="flex items-center gap-3">
            <span className="label-caps w-14 text-[10px]">Style</span>
            <Dropdown
              label="Style"
              value={style}
              onChange={setStyle}
              className="flex-1"
              options={[
                { value: 'editorial', label: 'Editorial Explainer' },
                { value: 'dark-money', label: 'Dark Money' },
                { value: 'clean', label: 'Clean Minimal' },
              ]}
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="label-caps w-14 text-[10px]">Timing</span>
            <Slider
              label="Timing"
              value={timing}
              min={0.5}
              max={6}
              step={0.1}
              onChange={setTiming}
              format={(v) => `${v.toFixed(1)} seconds`}
              className="flex-1"
            />
            <span className="w-8 text-right font-mono text-[11px]">{timing.toFixed(1)}s</span>
          </div>
        </div>
        <div className="flex w-[320px] flex-col gap-6 self-start">
          <Tabs
            label="Bottom panel"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'transcript', label: 'Transcript' },
              { value: 'captions', label: 'Captions' },
            ]}
          />
          <div className="w-[98px]">
            <Slider label="Timeline zoom" tone="neutral" value={zoom} onChange={setZoom} />
          </div>
        </div>
      </Section>

      <Section title="Surfaces, toolbar, overlays">
        <GlassToolbar label="Preview tools">
          <Tooltip content="Draw a note" shortcut="N">
            <Button variant="ghost" size="icon" aria-label="Draw a note">
              <Pencil strokeWidth={1.5} aria-hidden />
            </Button>
          </Tooltip>
          <ToolbarDivider />
          <span className="font-mono text-[11px] text-text-2">CC</span> Captions
          <Toggle checked={captions} onCheckedChange={setCaptions} label="Captions" />
          <ToolbarDivider />
          <Frame className="size-[18px] text-text-2" strokeWidth={1.5} aria-hidden /> Safe zone
          <ToolbarDivider />
          75%
          <ChevronDown className="size-3.5 text-text-2" strokeWidth={1.5} aria-hidden />
        </GlassToolbar>
        <Card className="relative h-[56px] w-[240px] overflow-hidden px-4 py-2.5">
          <p className="text-[12px] font-medium">Finding the bigger picture…</p>
          <p className="text-[10px] text-text-3">Generating map</p>
          <Shimmer />
        </Card>
        <Card variant="frame" className="flex h-[90px] w-[160px] items-end p-3">
          <span className="label-caps text-[9px]">Frame card</span>
        </Card>
        <Button variant="primary" size="lg" onClick={() => setModalOpen(true)}>
          Open export dialog
        </Button>
        <Button onClick={() => toast.device('On-device AI ready')}>Device toast</Button>
        <Button onClick={() => toast.cloud('Using cloud AI', "On-device AI isn't available in this browser.")}>
          Cloud toast
        </Button>
        <Button
          onClick={() =>
            toast.error("Couldn't generate", { action: { label: 'Retry', onClick: () => {} } })
          }
        >
          Error toast
        </Button>
      </Section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Export video"
        description="A little voice. Ready for the world."
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <span className="text-[13px] leading-[17px] font-medium">Format</span>
            <div role="radiogroup" aria-label="Format" className="grid grid-cols-3 gap-3">
              <OptionCard
                selected={format === '16:9'}
                onClick={() => setFormat('16:9')}
                icon={<RectangleHorizontal strokeWidth={1.5} aria-hidden />}
              >
                16:9
              </OptionCard>
              <OptionCard
                selected={format === '9:16'}
                onClick={() => setFormat('9:16')}
                icon={<RectangleVertical strokeWidth={1.5} aria-hidden />}
              >
                9:16
              </OptionCard>
              <OptionCard
                selected={format === '1:1'}
                onClick={() => setFormat('1:1')}
                icon={<Square strokeWidth={1.5} aria-hidden />}
              >
                1:1
              </OptionCard>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-[13px] leading-[17px] font-medium">Resolution</span>
            <div role="radiogroup" aria-label="Resolution" className="grid grid-cols-3 gap-3">
              {(['720p', '1080p', '4K'] as const).map((r) => (
                <OptionCard key={r} selected={res === r} onClick={() => setRes(r)}>
                  {r}
                </OptionCard>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between text-[15px]">
            Captions{' '}
            <Toggle checked={captions} onCheckedChange={setCaptions} label="Captions" size="lg" />
          </label>
          <div className="h-px bg-white/6" />
          <div className="flex justify-between font-mono text-[12px]">
            <span className="text-ember">Cost: 5 credits</span>
            <span className="text-text-2">{credits} available</span>
          </div>
          <Button
            variant="primary"
            size="lg"
            className="h-12 w-full justify-start gap-3 px-5 text-[14px]"
          >
            <Upload strokeWidth={1.5} aria-hidden /> Export video
          </Button>
          <p className="text-center font-mono text-[12px] text-text-2">MP4 · H.264 · 30 fps</p>
        </div>
      </Modal>

      <Section title="Pip · states">
        {PIP_STATES.map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setPipState(st)}
            className="flex w-[120px] flex-col items-center gap-2 rounded-card bg-panel py-3 shadow-quiet hover:bg-card"
          >
            <Pip state={st} size={72} seed={st.length} />
            <span className="font-mono text-[10px] text-text-3">{st}</span>
          </button>
        ))}
      </Section>

      <Section title="Pip · hero (click a state above, cursor follow)">
        <div className="flex h-[220px] w-[320px] items-center justify-center rounded-card bg-panel shadow-glass">
          <Pip state={pipState} size={140} glow look="cursor" />
        </div>
        <div className="flex h-[220px] w-[320px] items-center justify-center rounded-card bg-panel shadow-glass">
          <Pip state="sleeping" size={130} glow props={['nightcap', 'cloud']} />
        </div>
        <div className="flex h-[220px] w-[220px] items-center justify-center rounded-card bg-panel shadow-glass">
          <Pip state="idle" size={110} props={['nightcap']} look="cursor" glow />
        </div>
      </Section>

      <Section title="Pip · props">
        {PIP_PROPS.map((p) => (
          <div
            key={p}
            className="flex w-[110px] flex-col items-center gap-2 rounded-card bg-panel py-3"
          >
            <Pip size={64} props={[p]} decorative />
            <span className="font-mono text-[10px] text-text-3">{p}</span>
          </div>
        ))}
        <div className="flex flex-col items-center gap-2">
          <PipAvatar />
          <span className="font-mono text-[10px] text-text-3">avatar</span>
        </div>
        <div className="flex items-center gap-2">
          <PipAvatar ring={false} size={29} />
          <span className="text-[19px] font-semibold tracking-tight">motionpop</span>
        </div>
      </Section>

      <Section title="Number roll">
        <NumberRoll value={credits} className="text-[40px]" />
        <Button onClick={() => setCredits((c) => c + 97)}>+97</Button>
        <Button onClick={() => setTimer(Math.round(Math.random() * 99) / 10)}>Random time</Button>
      </Section>
    </main>
  );
}
