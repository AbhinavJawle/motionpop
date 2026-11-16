'use client';

import { DEFAULT_CAPTIONS, type CaptionsSetting, type Format } from '@motionpop/schemas';
import { ChevronDown, PenLine, Scan } from 'lucide-react';
import { toast } from 'sonner';
import { GlassToolbar, ToolbarDivider } from '@/components/ui/glass-toolbar';
import { StatusDot } from '@/components/ui/status-dot';
import { Toggle } from '@/components/ui/toggle';
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown';
import { setCaptions } from '@/lib/commands';
import { Tooltip } from '@/components/ui/tooltip';
import { slotAt } from '@/lib/notes/active-slot';
import { styleFor } from '@/lib/composition/project-to-compile';
import { cn } from '@/lib/cn';
import { useEditor, type SaveStatus } from '@/lib/stores/editor';
import { FrameNotesLayer } from '@/components/notes/frame-notes-layer';
import { OfflineBanner } from './offline-banner';
import { PreviewBadge } from './preview-badge';
import { PreviewProgress } from './preview-progress';
import { PreviewPlayer } from './preview-player';

const ASPECT: Record<Format, string> = { '16:9': '16 / 9', '9:16': '9 / 16', '1:1': '1 / 1' };

/**
 * The pen (spec 09 R8.1): turns draw mode on and pauses playback; off with no slot under the
 * playhead ("Notes go on a graphic. Move the playhead onto one.").
 */
function PenButton() {
  const on = useEditor((s) => s.drawMode);
  const setDrawMode = useEditor((s) => s.setDrawMode);
  const hasSlot = useEditor((s) =>
    s.project ? slotAt(s.project.slots, s.playheadMs) !== null : false,
  );
  const button = (
    <button
      type="button"
      aria-label="Draw a note"
      aria-pressed={on}
      aria-disabled={!hasSlot}
      onClick={() => {
        if (!hasSlot) return;
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

/** The three caption presets (spec 12 R5.3); the trigger reads "Captions · Pop". */
const CAPTION_PRESETS: readonly DropdownOption<CaptionsSetting['presetId']>[] = [
  { value: 'pop', label: 'Captions · Pop', hint: 'Bold, word on a pill' },
  { value: 'clean', label: 'Captions · Clean', hint: 'Underlined word' },
  { value: 'boxed', label: 'Captions · Boxed', hint: 'Dark box' },
];

/** Preview workspace ("Preview workspace" in design/figma-export.css): toolbar, frame, footer. */
export function PreviewPane() {
  const format = useEditor((s) => s.project?.format ?? '16:9');
  const styleName = useEditor((s) => (s.project ? styleFor(s.project).name : ''));
  const captions = useEditor((s) => s.project?.captions ?? DEFAULT_CAPTIONS);
  const exec = useEditor((s) => s.exec);
  const safeZone = useEditor((s) => s.safeZone);
  const toggleSafeZone = useEditor((s) => s.toggleSafeZone);
  const saveStatus = useEditor((s) => s.saveStatus);
  const generating = useEditor((s) => s.generating !== null);
  const sceneTotal = useEditor((s) => s.project?.slots.length ?? 0);
  const sceneIndex = useEditor((s) => {
    const sel = s.project?.slots.find((x) => x.id === s.selectedSlotId);
    if (!sel || !s.project) return 0;
    return s.project.slots.filter((x) => x.startMs <= sel.startMs).length;
  });

  return (
    <section
      aria-label="Preview"
      className="relative flex min-w-0 flex-1 flex-col items-center overflow-hidden bg-bg"
    >
      <Ambient />
      <GlassToolbar label="Preview tools" className="relative z-10 mt-5 gap-0 px-0">
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
              if (presetId !== captions.presetId) exec(setCaptions({ presetId, enabled: true }));
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
      </GlassToolbar>

      <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col items-center justify-center px-6 pt-5 pb-4">
        <div
          className="relative max-h-full max-w-full overflow-hidden rounded-card bg-frame shadow-glass"
          style={{ aspectRatio: ASPECT[format], height: 'min(405px, 100%)' }}
        >
          <PreviewPlayer />
          <FrameNotesLayer />
          <PreviewProgress />
          <PreviewBadge />
          <OfflineBanner />
          {safeZone && <SafeZoneOverlay format={format} />}
        </div>
      </div>

      <footer className="relative z-10 mb-[19px] flex w-[720px] max-w-[calc(100%-48px)] items-center justify-between text-[11px] leading-[14px]">
        <span className="font-mono text-[10px] leading-[13px] tracking-[0.5px] text-text-3">
          SCENE {String(sceneIndex).padStart(2, '0')} / {String(sceneTotal).padStart(2, '0')}
        </span>
        <span className="text-text-2">{styleName}</span>
        <SaveIndicator status={saveStatus} generating={generating} />
      </footer>
    </section>
  );
}

function SaveIndicator({ status, generating }: { status: SaveStatus; generating: boolean }) {
  const text = generating
    ? 'Generating motion…'
    : status === 'saving'
      ? 'Saving…'
      : status === 'error'
        ? 'Couldn’t save · retrying on next change'
        : 'All changes saved';
  return (
    <span role="status" className="flex items-center gap-2 text-text-2">
      <StatusDot
        tone={
          generating ? 'mint' : status === 'error' ? 'error' : status === 'saving' ? 'warn' : 'mint'
        }
        className="size-[5px]"
      />
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
