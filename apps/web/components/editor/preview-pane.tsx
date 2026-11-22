'use client';

import {
  APP_CONFIG_DEFAULTS,
  DEFAULT_CAPTIONS,
  costOf,
  type CaptionsSetting,
  type Format,
} from '@motionpop/schemas';
import { ChevronDown, PenLine, RefreshCw, Scan } from 'lucide-react';
import { toast } from 'sonner';
import { GlassToolbar, ToolbarDivider } from '@/components/ui/glass-toolbar';
import { StatusDot } from '@/components/ui/status-dot';
import { Toggle } from '@/components/ui/toggle';
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown';
import { setCaptions, setReelCaptions, setReelLook } from '@/lib/commands';
import { regenerateReel } from '@/lib/reel/regenerate';
import { useCreditsClient } from '@/lib/credits/use-credits-client';
import { Tooltip } from '@/components/ui/tooltip';
import { slotAt } from '@/lib/notes/active-slot';
import { styleFor } from '@/lib/composition/project-to-compile';
import { cn } from '@/lib/cn';
import { useState } from 'react';
import type { ReelLook } from '@motionpop/schemas';
import { useEditor, type SaveStatus } from '@/lib/stores/editor';
import { useUploadState, type UploadState } from '@/lib/audio/use-upload-state';
import { audioRefsOf } from '@/lib/projects/summary';
import { FrameNotesLayer } from '@/components/notes/frame-notes-layer';
import { ReelNotesLayer } from '@/components/notes/reel-notes-layer';
import { OfflineBanner } from './offline-banner';
import { PreviewBadge } from './preview-badge';
import { PreviewProgress } from './preview-progress';
import { PreviewPlayer } from './preview-player';
import { ReelPreview } from './reel-preview';
import { VideoCutsBar } from './video-cuts-bar';

const ASPECT: Record<Format, string> = { '16:9': '16 / 9', '9:16': '9 / 16', '1:1': '1 / 1' };

/**
 * The pen (spec 09 R8.1): turns draw mode on and pauses playback; off with no slot under the
 * playhead ("Notes go on a graphic. Move the playhead onto one.").
 */
function PenButton({ reel = false }: { reel?: boolean }) {
  const on = useEditor((s) => s.drawMode);
  const setDrawMode = useEditor((s) => s.setDrawMode);
  const setPlaying = useEditor((s) => s.setPlaying);
  // A reel always has a scene under the playhead (scenes tile it, spec 29).
  const hasSlot = useEditor((s) =>
    s.project
      ? reel
        ? Boolean(s.project.reel?.scenes.length)
        : slotAt(s.project.slots, s.playheadMs) !== null
      : false,
  );
  const button = (
    <button
      type="button"
      aria-label="Draw a note"
      aria-pressed={on}
      aria-disabled={!hasSlot}
      title={reel ? 'Draw a note: circle anything and say what to change' : undefined}
      onClick={() => {
        if (!hasSlot) return;
        if (!on) setPlaying(false);
        setDrawMode(!on);
      }}
      className={cn(
        'px-3.5 transition-colors',
        !hasSlot
          ? 'cursor-not-allowed text-text-4'
          : on
            ? 'text-violet'
            : 'text-text-2 hover:text-text',
      )}
    >
      <PenLine className="size-[18px]" strokeWidth={1.5} />
    </button>
  );
  return hasSlot ? (
    button
  ) : (
    <Tooltip content="Notes go on a graphic. Move the playhead onto one." side="bottom">
      {button}
    </Tooltip>
  );
}

/** Caption presets (spec 12 R5.3 + spec 23 R2): editorial, studio, minimal-pill, pop, clean, boxed. */
const CAPTION_PRESETS: readonly DropdownOption<CaptionsSetting['presetId']>[] = [
  { value: 'editorial', label: 'Captions · Editorial', hint: '1–2 word bold sans & italic serif' },
  { value: 'studio', label: 'Captions · Studio', hint: 'Clean shadow + split seam bar' },
  { value: 'minimal-pill', label: 'Captions · Minimal', hint: 'Compact dark pill' },
  { value: 'pop', label: 'Captions · Pop', hint: 'Bold, word on a pill' },
  { value: 'clean', label: 'Captions · Clean', hint: 'Underlined word' },
  { value: 'boxed', label: 'Captions · Boxed', hint: 'Dark box' },
];

const REEL_LOOKS: readonly DropdownOption<ReelLook>[] = [
  { value: 'mono', label: 'Look · Mono', hint: 'Split screen, white grid panel, bold labels' },
  { value: 'cream', label: 'Look · Cream', hint: 'Editorial serif, speaker in a rounded card' },
];

/** Reel tools (spec 25): look, captions and a new direction. */
function ReelTools() {
  const look = useEditor((s) => s.project?.reel?.look ?? 'mono');
  const captions = useEditor((s) => s.project?.reel?.captions ?? true);
  const exec = useEditor((s) => s.exec);
  const [busy, setBusy] = useState(false);
  const { client: credits } = useCreditsClient();
  return (
    <>
      <PenButton reel />
      <ToolbarDivider />
      <div className="flex items-center gap-2 pr-3.5 pl-3.5">
        <Dropdown
          label="Reel look"
          value={look}
          options={REEL_LOOKS}
          className="text-text-2"
          onChange={(next) => {
            if (next !== look) exec(setReelLook(next));
          }}
        />
      </div>
      <ToolbarDivider />
      <div className="flex items-center gap-2 pr-3.5 pl-3.5">
        <span className="text-[11px] leading-[14px] font-semibold text-text">CC</span>
        <Toggle
          checked={captions}
          onCheckedChange={(on) => exec(setReelCaptions(on))}
          label="Captions"
        />
      </div>
      <ToolbarDivider />
      <Tooltip
        content={`Direct the reel again · ☁ ${costOf('reel', 1, APP_CONFIG_DEFAULTS)} credits + ${costOf('image', 1, APP_CONFIG_DEFAULTS)} per new picture`}
        side="bottom"
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            regenerateReel({ credits })
              .then((source) =>
                toast(source === 'cloud' ? 'New direction ready' : 'New direction (free director)'),
              )
              .catch(() => toast.error("Couldn't direct the reel. Try again."))
              .finally(() => setBusy(false));
          }}
          className="flex items-center gap-[7px] px-3.5 text-text-2 transition-colors hover:text-text disabled:text-text-4"
        >
          <RefreshCw
            className={cn('size-[16px]', busy && 'animate-spin')}
            strokeWidth={1.5}
            aria-hidden
          />
          {busy ? 'Directing…' : 'Re-direct'}
        </button>
      </Tooltip>
    </>
  );
}

/** Preview workspace ("Preview workspace" in design/figma-export.css): toolbar, frame, footer. */
export function PreviewPane() {
  const isReel = useEditor((s) => Boolean(s.project?.reel && s.project?.video));
  const projectFormat = useEditor((s) => s.project?.format ?? '16:9');
  const format: Format = isReel ? '9:16' : projectFormat;
  const styleName = useEditor((s) => (s.project ? styleFor(s.project).name : ''));
  const captions = useEditor((s) => s.project?.captions ?? DEFAULT_CAPTIONS);
  const exec = useEditor((s) => s.exec);
  const safeZone = useEditor((s) => s.safeZone);
  const toggleSafeZone = useEditor((s) => s.toggleSafeZone);
  const saveStatus = useEditor((s) => s.saveStatus);
  const voiceover = useEditor((s) => s.project?.voiceover);
  const uploads = useUploadState(voiceover ? audioRefsOf({ voiceover }) : undefined);
  const generating = useEditor((s) => s.generating !== null);
  const sceneTotal = useEditor(
    (s) => s.project?.reel?.scenes.length ?? s.project?.slots.length ?? 0,
  );
  const sceneIndex = useEditor((s) => {
    if (!s.project) return 0;
    if (s.project.reel) {
      const t = s.playheadMs;
      return s.project.reel.scenes.filter((x) => x.startMs <= t).length;
    }
    const active =
      s.project.slots.find((x) => x.id === s.selectedSlotId) ??
      slotAt(s.project.slots, s.playheadMs);
    if (!active) return 0;
    return s.project.slots.filter((x) => x.startMs <= active.startMs).length;
  });

  return (
    <section
      aria-label="Preview"
      className="relative flex min-w-0 flex-1 flex-col items-center overflow-hidden bg-bg"
    >
      <Ambient />
      <GlassToolbar label="Preview tools" className="relative z-10 mt-5 gap-0 px-0">
        {isReel ? (
          <ReelTools />
        ) : (
          <>
            <PenButton />
            <ToolbarDivider />
            <div className="flex items-center gap-2 pr-3.5 pl-3.5">
              <span className="text-[11px] leading-[14px] font-semibold text-text">CC</span>
              <Dropdown
                label="Caption style"
                value={captions.presetId}
                options={CAPTION_PRESETS}
                className="text-text-2"
                onChange={(presetId) => {
                  if (presetId !== captions.presetId)
                    exec(setCaptions({ presetId, enabled: true }));
                }}
              />
              <Toggle
                checked={captions.enabled}
                onCheckedChange={(enabled) => exec(setCaptions({ enabled }))}
                label="Captions"
                className="ml-1.5"
              />
            </div>
            <ToolbarDivider />
            <button
              type="button"
              aria-pressed={safeZone}
              onClick={toggleSafeZone}
              className={cn(
                'flex items-center gap-[7px] px-3.5 transition-colors',
                safeZone ? 'text-text' : 'text-text-2 hover:text-text',
              )}
            >
              <Scan
                className={cn('size-[18px]', safeZone && 'text-violet')}
                strokeWidth={1.5}
                aria-hidden
              />
              Safe zone
            </button>
            <ToolbarDivider />
            <button
              type="button"
              className="flex items-center gap-[27px] pr-4 pl-[18px] text-text-2 hover:text-text"
              onClick={() => toast('Preview zoom is on its way.')}
            >
              <span className="tabular">Fit</span>
              <ChevronDown className="size-[13px]" strokeWidth={1.5} aria-hidden />
            </button>
          </>
        )}
      </GlassToolbar>

      <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col items-center justify-center px-6 pt-5 pb-4">
        <div
          className="relative max-h-full max-w-full overflow-hidden rounded-card bg-frame shadow-glass"
          style={{ aspectRatio: ASPECT[format], height: isReel ? '100%' : 'min(405px, 100%)' }}
        >
          {isReel ? <ReelPreview /> : <PreviewPlayer />}
          {isReel ? <ReelNotesLayer /> : <FrameNotesLayer />}
          <PreviewProgress />
          <PreviewBadge />
          <OfflineBanner />
          {safeZone && <SafeZoneOverlay format={format} />}
        </div>
      </div>

      {!isReel && <VideoCutsBar />}
      <footer className="relative z-10 mb-[19px] flex w-[720px] max-w-[calc(100%-48px)] items-center justify-between text-[11px] leading-[14px]">
        <span className="font-mono text-[10px] leading-[13px] tracking-[0.5px] text-text-3">
          SCENE {String(sceneIndex).padStart(2, '0')} / {String(sceneTotal).padStart(2, '0')}
        </span>
        <span className="text-text-2">{isReel ? 'Talking-head reel' : styleName}</span>
        <SaveIndicator status={saveStatus} uploads={uploads} generating={generating} />
      </footer>
    </section>
  );
}

function SaveIndicator({
  status,
  uploads,
  generating,
}: {
  status: SaveStatus;
  uploads: UploadState;
  generating: boolean;
}) {
  // Audio still uploading to the account counts as unsaved (spec 11 design §10).
  const text = generating
    ? 'Generating motion…'
    : status === 'error'
      ? 'Couldn’t save · retrying on next change'
      : uploads === 'failing'
        ? 'Couldn’t upload audio · retrying'
        : status === 'saving' || uploads === 'uploading'
          ? 'Saving…'
          : 'All changes saved';
  const tone = generating
    ? 'mint'
    : status === 'error'
      ? 'error'
      : uploads !== 'idle' || status === 'saving'
        ? 'warn'
        : 'mint';
  return (
    <span role="status" className="flex items-center gap-2 text-text-2">
      <StatusDot tone={tone} className="size-[5px]" />
      {text}
    </span>
  );
}

/** Ambient spotlights + edge vignette from the design (6 % violet and ember, blurred). */
function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute top-10 left-6 h-[450px] w-[820px] rounded-full bg-violet/6 blur-[90px]" />
      <div className="absolute top-[172px] left-[228px] h-[350px] w-[580px] rounded-full bg-ember/6 blur-[90px]" />
      <div className="absolute inset-0 bg-[radial-gradient(50%_50%_at_50%_50%,transparent_0%,rgb(0_0_0/0.24)_100%)]" />
    </div>
  );
}

/** Safe-area guides matching motion-principles.md principle 10. */
function SafeZoneOverlay({ format }: { format: Format }) {
  const inset =
    format === '9:16'
      ? { top: '12%', bottom: '20%', left: '6%', right: '6%' }
      : { top: '5%', bottom: '5%', left: '5%', right: '5%' };
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute rounded-sm border border-dashed border-violet/60"
      style={inset}
    />
  );
}
