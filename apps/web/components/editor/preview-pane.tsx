'use client';

import {
  APP_CONFIG_DEFAULTS,
  DEFAULT_CAPTIONS,
  costOf,
  type CaptionsSetting,
  type Format,
} from '@motionpop/schemas';
import { Palette, PenLine, RefreshCw, Scan } from 'lucide-react';
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
import { useLayoutEffect, useRef, useState } from 'react';
import type { ReelLook } from '@motionpop/schemas';
import { useEditor } from '@/lib/stores/editor';
import { openRailPanel } from '@/lib/editor/rail-panel';
import { useUploadState } from '@/lib/audio/use-upload-state';
import { audioRefsOf } from '@/lib/projects/summary';
import { FrameNotesLayer } from '@/components/notes/frame-notes-layer';
import { ReelNotesLayer } from '@/components/notes/reel-notes-layer';
import { OfflineBanner } from './offline-banner';
import { PreviewBadge } from './preview-badge';
import { PreviewProgress } from './preview-progress';
import { PreviewPlayer } from './preview-player';
import { ReelPreview } from './reel-preview';
import { StockOverlaysLayer } from './stock-overlays-layer';
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

/** Largest box of `aspect` (w / h) that fits inside `el` minus `pad` on every side (spec 32 R1.1). */
function useFitBox(aspect: number, pad: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const aw = Math.max(0, r.width - pad * 2);
      const ah = Math.max(0, r.height - pad * 2);
      const w = Math.min(aw, ah * aspect);
      setBox({ w: Math.floor(w), h: Math.floor(w / aspect) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect, pad]);
  return { ref, box };
}

const ASPECT_NUM: Record<Format, number> = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1 };

/**
 * Preview workspace (spec 32): the toolbar on top and the frame as large as the workspace
 * allows at the project's aspect ratio. Save status lives by the title; the style name sits in
 * the toolbar.
 */
export function PreviewPane() {
  const isReel = useEditor((s) => Boolean(s.project?.reel && s.project?.video));
  const projectFormat = useEditor((s) => s.project?.format ?? '16:9');
  const format: Format = isReel ? '9:16' : projectFormat;
  const styleName = useEditor((s) => (s.project ? styleFor(s.project).name : ''));
  const captions = useEditor((s) => s.project?.captions ?? DEFAULT_CAPTIONS);
  const exec = useEditor((s) => s.exec);
  const safeZone = useEditor((s) => s.safeZone);
  const toggleSafeZone = useEditor((s) => s.toggleSafeZone);
  const setRail = useEditor((s) => s.setRail);
  const { ref: stageRef, box } = useFitBox(ASPECT_NUM[format], 20);

  return (
    <section
      aria-label="Preview"
      className="relative flex min-w-0 flex-1 flex-col items-center overflow-hidden bg-stage"
    >
      <GlassToolbar label="Preview tools" className="relative z-10 mt-4 gap-0 px-0">
        {isReel ? (
          <ReelTools />
        ) : (
          <>
            <PenButton />
            <ToolbarDivider />
            <button
              type="button"
              onClick={() => {
                openRailPanel('styles');
                setRail('styles');
              }}
              className="flex items-center gap-2 px-3.5 text-text-2 transition-colors hover:text-text"
              aria-label={`Style: ${styleName}. Change style`}
            >
              <Palette className="size-[16px]" strokeWidth={1.5} aria-hidden />
              <span className="max-w-40 truncate">{styleName}</span>
            </button>
            <ToolbarDivider />
            <div className="flex items-center gap-2 pr-3.5 pl-3.5">
              <span className="text-[11px] leading-[14px] font-semibold text-text-2">CC</span>
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
              <Scan className="size-[16px]" strokeWidth={1.5} aria-hidden />
              Safe zone
            </button>
          </>
        )}
      </GlassToolbar>

      <div
        ref={stageRef}
        className="relative z-10 flex min-h-0 w-full flex-1 items-center justify-center"
      >
        <div
          data-preview-frame
          className="relative overflow-hidden rounded-[10px] bg-frame shadow-frame"
          style={
            box ? { width: box.w, height: box.h } : { aspectRatio: ASPECT[format], height: '60%' }
          }
        >
          {isReel ? <ReelPreview /> : <PreviewPlayer />}
          <StockOverlaysLayer />
          {isReel ? <ReelNotesLayer /> : <FrameNotesLayer />}
          <PreviewProgress />
          <PreviewBadge />
          <OfflineBanner />
          {safeZone && <SafeZoneOverlay format={format} />}
        </div>
      </div>

      {!isReel && <VideoCutsBar />}
      <div className="h-3 shrink-0" />
    </section>
  );
}

/** Save status (spec 32 R1.2): quiet text beside the project title. */
export function SaveIndicator({ onInk = false }: { onInk?: boolean } = {}) {
  const status = useEditor((s) => s.saveStatus);
  const voiceover = useEditor((s) => s.project?.voiceover);
  const uploads = useUploadState(voiceover ? audioRefsOf({ voiceover }) : undefined);
  const generating = useEditor((s) => s.generating !== null);
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
  const problem = status === 'error' || uploads === 'failing';
  return (
    <span
      role="status"
      className={cn(
        'flex items-center gap-1.5 text-[12px] leading-4 whitespace-nowrap',
        onInk && 'font-mono text-[11px]',
        problem ? (onInk ? 'text-flame' : 'text-error') : onInk ? 'text-paper/50' : 'text-text-3',
      )}
    >
      {problem && <StatusDot tone="error" className="size-[5px]" />}
      {text}
    </span>
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
