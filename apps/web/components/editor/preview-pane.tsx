'use client';

import { builtInSkills } from '@motionpop/ai';
import {
  APP_CONFIG_DEFAULTS,
  DEFAULT_CAPTIONS,
  costOf,
  isGraphicReel,
  isReelEngine,
  isVideoReel,
  type CaptionsSetting,
  type Format,
} from '@motionpop/schemas';
import { Grid2x2, Palette, PenLine, RefreshCw, Scan, Server, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { GeminiNanoStatus } from '@/components/ui/gemini-nano-status';
import { GlassToolbar, ToolbarDivider } from '@/components/ui/glass-toolbar';
import { StatusDot } from '@/components/ui/status-dot';
import { Toggle } from '@/components/ui/toggle';
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown';
import { useAIStatus } from '@/lib/ai/ai-status';
import { useByok } from '@/lib/ai/byok';
import { useLocalLlm } from '@/lib/ai/local-llm';
import { setCaptions, setFormat, setReelCaptions } from '@/lib/commands';
import { regenerateReel } from '@/lib/reel/regenerate';
import { useCreditsClient } from '@/lib/credits/use-credits-client';
import { useAppConfig } from '@/lib/renders/hooks';
import { Tooltip } from '@/components/ui/tooltip';
import { slotAt } from '@/lib/notes/active-slot';
import { styleFor } from '@/lib/composition/project-to-compile';
import { cn } from '@/lib/cn';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useEditor } from '@/lib/stores/editor';
import { openRailPanel } from '@/lib/editor/rail-panel';
import { openSettingsPanel } from '@/lib/editor/settings-panel';
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
 * playhead ("Notes go on a graphic. Move the playhead onto one."). When BOTH Chrome Gemini Nano
 * and a Local AI server (Ollama / LM Studio) are connected, clicking the pen lets the creator
 * pick which local engine will fix the note right then and there, then enters draw mode normally.
 */
export function PenButton({ reel = false }: { reel?: boolean }) {
  const on = useEditor((s) => s.drawMode);
  const setDrawMode = useEditor((s) => s.setDrawMode);
  const setPlaying = useEditor((s) => s.setPlaying);
  const noteEngine = useEditor((s) => s.noteEngine);
  const setNoteEngine = useEditor((s) => s.setNoteEngine);
  const { availability } = useAIStatus();
  const { active: localLlmActive, model: localLlmModel } = useLocalLlm();
  const bothLocal = localLlmActive && availability === 'available';
  const [pickerOpen, setPickerOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close the engine picker on outside click or Escape.
  useEffect(() => {
    if (!pickerOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [pickerOpen]);

  // A reel always has a scene under the playhead (scenes tile it, spec 29).
  const hasSlot = useEditor((s) =>
    s.project
      ? reel
        ? Boolean(s.project.reel?.scenes.length)
        : slotAt(s.project.slots, s.playheadMs) !== null
      : false,
  );

  const chooseEngine = (engine: 'nano' | 'local-llm') => {
    setNoteEngine(engine);
    setPickerOpen(false);
    setPlaying(false);
    setDrawMode(true);
  };

  const button = (
    <div ref={wrapRef} className="relative flex h-full items-center">
      <button
        type="button"
        aria-label="Draw a note"
        aria-pressed={on}
        aria-haspopup={bothLocal && !on ? 'menu' : undefined}
        aria-expanded={bothLocal && !on ? pickerOpen : undefined}
        aria-disabled={!hasSlot}
        title={reel ? 'Draw a note: circle anything and say what to change' : undefined}
        onClick={() => {
          if (!hasSlot) return;
          if (on) {
            setPickerOpen(false);
            setDrawMode(false);
            return;
          }
          if (bothLocal) {
            setPickerOpen((open) => !open);
            return;
          }
          setPlaying(false);
          setDrawMode(true);
        }}
        className={cn(
          'flex h-full items-center px-3.5 transition-colors',
          !hasSlot
            ? 'cursor-not-allowed text-text-4'
            : on || pickerOpen
              ? 'text-violet'
              : 'text-text-2 hover:text-text',
        )}
      >
        <PenLine className="size-[18px]" strokeWidth={1.5} />
      </button>
      {pickerOpen && bothLocal && !on && (
        <div
          role="menu"
          aria-label="Choose AI for this note"
          data-testid="note-engine-picker"
          className="absolute top-full left-0 z-50 mt-2 w-[272px] rounded-xl border border-line-strong bg-dialog p-1.5 shadow-[0_14px_38px_rgba(0,0,0,0.65)] ring-1 ring-white/10 backdrop-blur-md"
        >
          <p className="px-2.5 pt-1 pb-1.5 text-[10px] font-semibold tracking-[0.06em] text-text-3 uppercase">
            Fix note with
          </p>
          <button
            type="button"
            role="menuitem"
            data-testid="note-engine-nano"
            onClick={() => chooseEngine('nano')}
            className={cn(
              'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/8',
              noteEngine === 'nano' && 'bg-mint/10 ring-1 ring-mint/25',
            )}
          >
            <Zap
              className="mt-0.5 size-4 shrink-0 fill-bolt text-bolt"
              strokeWidth={1.5}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2 text-[12px] leading-4 font-semibold text-text">
                <span>Gemini Nano</span>
                <span className="rounded bg-mint-tint px-1.5 py-0.5 font-mono text-[9.5px] font-medium text-mint-ink">
                  Instant · free
                </span>
              </span>
              <span className="mt-0.5 block text-[11px] leading-[15px] text-text-2">
                Fast text, color, caption &amp; layout tweaks on-device
              </span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="note-engine-local-llm"
            onClick={() => chooseEngine('local-llm')}
            className={cn(
              'mt-1 flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/8',
              noteEngine === 'local-llm' && 'bg-mint/10 ring-1 ring-mint/25',
            )}
          >
            <Server className="mt-0.5 size-4 shrink-0 text-mint-ink" strokeWidth={1.75} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2 text-[12px] leading-4 font-semibold text-text">
                <span className="truncate">{localLlmModel || 'Local AI'}</span>
                <span className="shrink-0 rounded bg-mint-tint px-1.5 py-0.5 font-mono text-[9.5px] font-medium text-mint-ink">
                  Local · 0
                </span>
              </span>
              <span className="mt-0.5 block text-[11px] leading-[15px] text-text-2">
                Template swaps &amp; custom motion graphics via local server
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
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

const REEL_FORMATS: readonly DropdownOption<Format>[] = [
  { value: '16:9', label: '16:9', hint: 'Landscape (YouTube / Premiere Pro)' },
  { value: '9:16', label: '9:16', hint: 'Vertical (Reels / Shorts / TikTok)' },
  { value: '1:1', label: '1:1', hint: 'Square (Feeds / Cards)' },
];

const ALL_REEL_STYLES = builtInSkills.recipes().flatMap((r) => r.styles);

function resolveReelStyleName(
  editStyleId: string | undefined,
  look: 'mono' | 'cream',
  theme: { accent?: string; background?: string } | undefined,
): string {
  if (editStyleId) {
    const byId = ALL_REEL_STYLES.find((st) => st.id === editStyleId);
    if (byId) return byId.name;
  }
  const byMatch = ALL_REEL_STYLES.find((st) => {
    if (st.look !== look) return false;
    if (!st.theme && !theme) return true;
    return (
      st.theme?.accent?.toLowerCase() === theme?.accent?.toLowerCase() &&
      st.theme?.background === theme?.background
    );
  });
  return byMatch?.name ?? (look === 'cream' ? 'Warm Editorial' : 'Mono Grid');
}

/** Reel tools (spec 25): style, format/transparency (no-video), captions and re-direct. */
function ReelTools({
  hasSpeakerVideo,
  graphicOnly,
  format,
  transparentPreview,
  onToggleTransparent,
  onOpenStyles,
}: {
  hasSpeakerVideo: boolean;
  graphicOnly: boolean;
  format: Format;
  transparentPreview: boolean;
  onToggleTransparent: () => void;
  onOpenStyles: () => void;
}) {
  const look = useEditor((s) => s.project?.reel?.look ?? 'mono');
  const theme = useEditor((s) => s.project?.reel?.theme);
  const editStyleId = useEditor((s) => s.project?.edit?.styleId);
  const captions = useEditor((s) => s.project?.reel?.captions ?? true);
  const exec = useEditor((s) => s.exec);
  const [busy, setBusy] = useState(false);
  const { client: credits } = useCreditsClient();
  const { active: localLlmActive, model: localLlmModel } = useLocalLlm();
  const { active: byokActive } = useByok();
  const { online } = useAIStatus();
  const appConfig = useAppConfig();
  const cfg = { ...APP_CONFIG_DEFAULTS, ...appConfig };
  const offlineBlocked = !online && !localLlmActive;
  const reelStyleName = resolveReelStyleName(editStyleId, look, theme);
  return (
    <>
      <PenButton reel />
      <ToolbarDivider />
      <button
        type="button"
        onClick={onOpenStyles}
        className="flex items-center gap-2 px-3.5 text-text-2 transition-colors hover:text-text"
        aria-label={`Style: ${reelStyleName}. Change style`}
      >
        <Palette className="size-[16px]" strokeWidth={1.5} aria-hidden />
        <span className="max-w-40 truncate">{reelStyleName}</span>
      </button>
      {!hasSpeakerVideo && (
        <>
          <ToolbarDivider />
          <div className="flex items-center gap-2 pr-3.5 pl-3.5">
            <Dropdown
              label="Aspect ratio"
              value={format}
              options={REEL_FORMATS}
              className="font-mono text-text-2"
              onChange={(next) => {
                if (next !== format) exec(setFormat(next));
              }}
            />
          </div>
          <ToolbarDivider />
          <Tooltip
            content="Preview with transparent background (matches WebM alpha export for Premiere Pro)"
            side="bottom"
          >
            <button
              type="button"
              aria-pressed={transparentPreview}
              onClick={onToggleTransparent}
              className={cn(
                'flex items-center gap-[6px] px-3.5 transition-colors',
                transparentPreview ? 'text-violet' : 'text-text-2 hover:text-text',
              )}
            >
              <Grid2x2 className="size-[15px]" strokeWidth={1.5} aria-hidden />
              Alpha
            </button>
          </Tooltip>
        </>
      )}
      {!graphicOnly && (
        <>
          <ToolbarDivider />
          <div className="flex items-center gap-2 pr-3.5 pl-3.5">
            <span className="text-[11px] leading-[14px] font-semibold text-text">CC</span>
            <Toggle
              checked={captions}
              onCheckedChange={(on) => exec(setReelCaptions(on))}
              label="Captions"
            />
          </div>
        </>
      )}
      <ToolbarDivider />
      <Tooltip
        content={
          offlineBlocked
            ? 'Direct again · Needs connection (or enable Local AI)'
            : localLlmActive
              ? `Direct again · Local AI (${localLlmModel ?? 'local'}) · 0 credits`
              : byokActive
                ? 'Direct again · BYOK · 0 Motionpop credits'
                : `Direct again · ☁ ${costOf('reel', 1, cfg)} credits + ${costOf('image', 1, cfg)} per new picture`
        }
        side="bottom"
      >
        <button
          type="button"
          disabled={busy || offlineBlocked}
          onClick={() => {
            setBusy(true);
            regenerateReel({ credits })
              .then((source) =>
                toast(
                  source === 'cloud'
                    ? 'New direction ready'
                    : source === 'device'
                      ? 'New direction ready (local AI)'
                      : 'New direction (free director)',
                ),
              )
              .catch(() => toast.error("Couldn't direct again. Try again."))
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
  const isReel = useEditor((s) => isReelEngine(s.project));
  const hasSpeakerVideo = useEditor((s) => isVideoReel(s.project));
  const graphicOnly = useEditor((s) => isGraphicReel(s.project));
  const projectFormat = useEditor((s) => s.project?.format ?? '16:9');
  const format: Format = hasSpeakerVideo ? '9:16' : projectFormat;
  const [transparentPreview, setTransparentPreview] = useState(false);
  const showAlpha = isReel && !hasSpeakerVideo && transparentPreview;
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
      <div className="relative z-30 mt-4 flex w-full flex-wrap items-center justify-center gap-2.5 px-4">
        <GlassToolbar label="Preview tools" className="gap-0 px-0">
          {isReel ? (
            <ReelTools
              hasSpeakerVideo={hasSpeakerVideo}
              graphicOnly={graphicOnly}
              format={format}
              transparentPreview={showAlpha}
              onToggleTransparent={() => setTransparentPreview((v) => !v)}
              onOpenStyles={() => {
                openRailPanel('styles');
                setRail('styles');
              }}
            />
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
        <GeminiNanoStatus variant="editor" onOpenSettings={() => openSettingsPanel('ai')} />
      </div>

      <div
        ref={stageRef}
        className="relative z-10 flex min-h-0 w-full flex-1 items-center justify-center"
      >
        <div
          data-preview-frame
          className={cn(
            'relative rounded-[10px] shadow-frame',
            showAlpha ? '' : 'bg-frame',
          )}
          style={{
            ...(box ? { width: box.w, height: box.h } : { aspectRatio: ASPECT[format], height: '60%' }),
            ...(showAlpha
              ? {
                  backgroundColor: '#1f1f24',
                  backgroundImage:
                    'repeating-conic-gradient(#2c2c34 0% 25%, #1f1f24 0% 50%)',
                  backgroundSize: '20px 20px',
                }
              : {}),
          }}
        >
          <div className="absolute inset-0 z-0 overflow-hidden rounded-[10px]">
            {isReel ? <ReelPreview transparent={showAlpha} /> : <PreviewPlayer />}
            <StockOverlaysLayer />
            <PreviewProgress />
            <PreviewBadge />
            <OfflineBanner />
            {safeZone && <SafeZoneOverlay format={format} />}
          </div>
          {isReel ? <ReelNotesLayer /> : <FrameNotesLayer />}
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
  const project = useEditor((s) => s.project);
  const uploads = useUploadState(project ? audioRefsOf(project) : undefined);
  const generating = useEditor((s) => s.generating !== null);
  // Audio and video still uploading to the account count as unsaved (spec 11 design §10).
  const text = generating
    ? 'Generating motion…'
    : status === 'error'
      ? 'Couldn’t save · retrying on next change'
      : uploads === 'failing'
        ? 'Couldn’t upload media · retrying'
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
