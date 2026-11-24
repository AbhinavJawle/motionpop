'use client';

import { styleFor } from '@/lib/composition/project-to-compile';
import {
  audibleStockAudio,
  sanitizeFilename,
  visibleStockOverlays,
  type EditorProject,
  type Format,
  type RenderOptions,
  type Resolution,
} from '@motionpop/schemas';
import { Captions, Layers, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { FORMAT_CHOICES, secondsText, type ExportOptionsState } from '@/lib/renders/export-flow';
import { buildSrt, buildVtt, hasSubtitleWords } from '@/lib/renders/subtitles';
import { OptionCards, type OptionCard } from './option-cards';
import { SwitchRow } from './switch-row';
import { VideoStill } from './video-still';

const frameIcon = (format: Format) => {
  const dims: Record<Format, string> = {
    '16:9': 'h-3 w-5',
    '9:16': 'h-5 w-3',
    '1:1': 'size-4',
  };
  return (
    <span aria-hidden className={cn('rounded-[2px] border-[1.5px] border-current', dims[format])} />
  );
};

const RESOLUTION_CARDS: readonly OptionCard<Resolution | '4k'>[] = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '4k', label: '4K', soon: '4K export is almost ready.' },
];

function downloadTextFile(content: string, filename: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The project card of the export dialog (export.png + spec 46 R4): still, title, accurate scene count, look, and active timeline layers. */
export function ProjectCard({
  project,
  format,
  scenes,
}: {
  project: EditorProject;
  format: Format;
  scenes: number;
}) {
  const isReel = Boolean(project.reel && project.video);
  const displayScenes = isReel && scenes === 0 ? (project.reel?.scenes.length ?? 0) : scenes;
  const mediaCount = visibleStockOverlays(project).length;
  const audioCount = audibleStockAudio(project).length;
  const cutCount = (project.video?.cuts ?? []).filter((c) => c.enabled).length;
  const layerParts: string[] = [];
  if (mediaCount > 0) {
    layerParts.push(`${mediaCount} ${mediaCount === 1 ? 'media overlay' : 'media overlays'}`);
  }
  if (audioCount > 0) {
    layerParts.push(`${audioCount} ${audioCount === 1 ? 'audio clip' : 'audio clips'}`);
  }
  if (cutCount > 0) {
    layerParts.push(`${cutCount} ${cutCount === 1 ? 'cut' : 'cuts'}`);
  }

  return (
    <div className="flex min-h-[132px] items-center gap-4 rounded-[12px] bg-white/[0.03] p-3 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]">
      <VideoStill project={project} format={format} boxW={192} boxH={108} radius={3.2} />
      <div className="min-w-0">
        <div className="truncate text-[15px] leading-5 font-semibold text-text">
          {project.title}
        </div>
        <div className="tabular mt-[7px] font-mono text-xs leading-4 text-text-2">
          {secondsText(project.durationMs)} · {displayScenes}{' '}
          {displayScenes === 1 ? 'scene' : 'scenes'}
        </div>
        <div className="mt-[9px] truncate text-xs leading-4 text-text-2">
          {styleFor(project).name}
        </div>
        {layerParts.length > 0 && (
          <div
            data-testid="export-layers-summary"
            className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-md bg-mint/12 px-1.5 py-0.5 font-mono text-[10px] leading-3 text-mint"
            title="All visible timeline tracks and cuts are included in your MP4"
          >
            <Layers className="size-2.5 shrink-0" strokeWidth={2} aria-hidden />
            <span className="truncate">{layerParts.join(' · ')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The options of "Export video" (design/screens/export.png + spec 46): format & resolution cards,
 * three switches, instant subtitle download strip, cost row, and export button.
 */
export function OptionsView({
  project,
  options,
  onOptions,
  state,
  startError,
  onExport,
}: {
  project?: EditorProject;
  options: RenderOptions;
  onOptions: (next: RenderOptions) => void;
  state: ExportOptionsState;
  startError: string | null;
  onExport: () => void;
}) {
  const isReel = Boolean(project?.reel && project?.video);
  const words = project?.transcript.words ?? [];
  const formatCards: OptionCard<Format>[] = FORMAT_CHOICES.map((f) => ({
    value: f,
    label: f,
    icon: frameIcon(f),
    ...(isReel && f !== '9:16' ? { disabledReason: 'Reels export in 9:16 vertical.' } : {}),
  }));
  const note = startError ?? state.blockNote ?? state.leftOutNote;
  const title = project?.title ?? 'motionpop video';

  return (
    <div>
      <div className="mt-6 flex items-baseline justify-between gap-2">
        <span className="text-[12px] leading-4 font-semibold text-text-2">Format</span>
        {isReel && (
          <span className="font-mono text-[10.5px] leading-4 text-text-3">Vertical 9:16 reel</span>
        )}
      </div>
      <div className="mt-[9px]">
        <OptionCards
          label="Format"
          options={formatCards}
          value={options.format}
          onChange={(format) => onOptions({ ...options, format })}
          cardClassName="h-11"
        />
      </div>

      <div className="mt-5 text-[12px] leading-4 font-semibold text-text-2">Resolution</div>
      <div className="mt-[9px]">
        <OptionCards
          label="Resolution"
          options={RESOLUTION_CARDS}
          value={options.resolution}
          onChange={(resolution) => {
            if (resolution !== '4k') onOptions({ ...options, resolution });
          }}
          cardClassName="h-10"
        />
      </div>

      <SwitchRow
        className="mt-[30px]"
        label="Captions"
        hint="Burned into the video, word by word."
        checked={options.captions}
        onCheckedChange={(captions) => onOptions({ ...options, captions })}
      />
      <SwitchRow
        className="mt-[21px]"
        label="Transparent background (for editors)"
        hint={
          isReel
            ? 'Not available for Reels — camera footage is baked into the scene.'
            : options.transparent
              ? 'Exports WebM with alpha (VP9 · yuva420p) for Premiere, Resolve & Final Cut.'
              : 'Exports as WebM with alpha when enabled.'
        }
        checked={!isReel && Boolean(options.transparent)}
        onCheckedChange={(transparent) => {
          if (transparent) {
            onOptions({ ...options, transparent: true });
          } else {
            const { transparent: _drop, ...rest } = options;
            void _drop;
            onOptions(rest);
          }
        }}
        {...(isReel
          ? { disabledReason: 'Reels bake speaker camera footage and cannot export transparent.' }
          : {})}
      />
      <SwitchRow
        className="mt-[27px]"
        label="Include music and effects"
        hint="The pops, whooshes and music you hear in the editor."
        checked={options.music}
        onCheckedChange={(music) => onOptions({ ...options, music })}
      />

      {hasSubtitleWords(words) && (
        <div
          data-testid="options-subtitle-strip"
          className="mt-5 flex items-center justify-between gap-3 rounded-[10px] border border-dialog-line bg-white/[0.025] px-3 py-2"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Captions
              className="size-3.5 shrink-0 text-violet-icon"
              strokeWidth={1.75}
              aria-hidden
            />
            <div className="min-w-0">
              <div className="text-[11.5px] leading-4 font-medium text-text">Instant subtitles</div>
              <div className="truncate text-[10.5px] leading-3.5 text-text-3">
                Word-synced captions · ready without rendering
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                downloadTextFile(
                  buildSrt(words),
                  sanitizeFilename(title, 'srt'),
                  'application/x-subrip;charset=utf-8',
                );
                toast.success('Downloaded .srt captions');
              }}
              className="rounded-md border border-dialog-line bg-white/[0.04] px-2 py-1 font-mono text-[10.5px] font-medium text-text-2 transition-colors hover:bg-white/[0.09] hover:text-text"
            >
              .srt
            </button>
            <button
              type="button"
              onClick={() => {
                downloadTextFile(
                  buildVtt(words),
                  sanitizeFilename(title, 'vtt'),
                  'text/vtt;charset=utf-8',
                );
                toast.success('Downloaded .vtt captions');
              }}
              className="rounded-md border border-dialog-line bg-white/[0.04] px-2 py-1 font-mono text-[10.5px] font-medium text-text-2 transition-colors hover:bg-white/[0.09] hover:text-text"
            >
              .vtt
            </button>
          </div>
        </div>
      )}

      <div className="mt-[20px] h-px bg-dialog-line" />

      <div className="mt-5 flex items-baseline justify-between">
        {state.cost === null || state.cost === 0 ? (
          <Chip tone="mint">Free</Chip>
        ) : (
          <span className="tabular font-mono text-xs leading-4 text-ember-ink">
            {`Cost: ${state.cost} ${state.cost === 1 ? 'credit' : 'credits'}`}
          </span>
        )}
        <span
          className={cn(
            'tabular mr-[22px] font-mono text-[11px] leading-[14px]',
            state.rightText.tone === 'error' && 'text-error',
            state.rightText.tone === 'mint' && 'text-mint',
            state.rightText.tone === 'muted' && 'text-text-2',
          )}
          aria-live="polite"
        >
          {state.rightText.text}
        </span>
      </div>
      {note && (
        <p
          role="status"
          className={cn(
            'mt-[7px] text-[11px] leading-[14px]',
            startError ? 'text-error' : 'text-text-2',
          )}
        >
          {note}
        </p>
      )}

      <Button
        variant="primary"
        disabled={!state.canExport}
        onClick={onExport}
        className={cn(
          'h-11 w-full justify-center gap-2 rounded-[10px] px-4 text-[13px] leading-4 font-semibold',
          note ? 'mt-5' : 'mt-[23px]',
        )}
      >
        <Upload className="size-4" strokeWidth={1.6} aria-hidden />
        Export video
      </Button>
      <div className="tabular mt-3 text-center font-mono text-[11px] leading-[14px] text-text-3">
        {!isReel && options.transparent ? 'WebM · VP9 Alpha · 30 fps' : 'MP4 · H.264 · 30 fps'}
      </div>
    </div>
  );
}
