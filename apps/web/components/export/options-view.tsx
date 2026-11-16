'use client';

import { styleFor } from '@/lib/composition/project-to-compile';
import {
  type EditorProject,
  type Format,
  type RenderOptions,
  type Resolution,
} from '@motionpop/schemas';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { FORMAT_CHOICES, secondsText, type ExportOptionsState } from '@/lib/renders/export-flow';
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

const FORMAT_CARDS: readonly OptionCard<Format>[] = FORMAT_CHOICES.map((f) => ({
  value: f,
  label: f,
  icon: frameIcon(f),
}));

const RESOLUTION_CARDS: readonly OptionCard<Resolution | '4k'>[] = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '4k', label: '4K', soon: '4K export is almost ready.' },
];

/** The project card of the export dialog (export.png): still, title, "18 sec · 4 scenes", look. */
export function ProjectCard({
  project,
  format,
  scenes,
}: {
  project: EditorProject;
  format: Format;
  scenes: number;
}) {
  return (
    <div className="flex h-[132px] items-center gap-4 rounded-[14px] border border-dialog-line bg-dialog-card p-3">
      <VideoStill project={project} format={format} boxW={192} boxH={108} radius={3.2} />
      <div className="min-w-0">
        <div className="truncate text-[15px] leading-5 text-text">{project.title}</div>
        <div className="tabular mt-[7px] font-mono text-xs leading-4 text-text-2">
          {secondsText(project.durationMs)} · {scenes} {scenes === 1 ? 'scene' : 'scenes'}
        </div>
        <div className="mt-[9px] truncate text-xs leading-4 text-text-2">
          {styleFor(project).name}
        </div>
      </div>
    </div>
  );
}

/**
 * The options of "Export video" (design/screens/export.png): format and resolution cards, three
 * switches, the cost row and the button. Transparent background is "Soon" (R1.7); 4K is "Soon"
 * (R1.6). Captions and the sound bed are live (spec 12).
 */
export function OptionsView({
  options,
  onOptions,
  state,
  startError,
  onExport,
}: {
  options: RenderOptions;
  onOptions: (next: RenderOptions) => void;
  state: ExportOptionsState;
  startError: string | null;
  onExport: () => void;
}) {
  const note = startError ?? state.blockNote ?? state.leftOutNote;
  return (
    <div>
      <div className="mt-6 text-[13px] leading-[17px] text-text">Format</div>
      <div className="mt-[9px]">
        <OptionCards
          label="Format"
          options={FORMAT_CARDS}
          value={options.format}
          onChange={(format) => onOptions({ ...options, format })}
          cardClassName="h-12"
        />
      </div>

      <div className="mt-6 text-[13px] leading-[17px] text-text">Resolution</div>
      <div className="mt-[9px]">
        <OptionCards
          label="Resolution"
          options={RESOLUTION_CARDS}
          value={options.resolution}
          onChange={(resolution) => {
            if (resolution !== '4k') onOptions({ ...options, resolution });
          }}
          cardClassName="h-[42px]"
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
        hint="Exports as WebM with alpha when enabled."
        checked={false}
        onCheckedChange={() => {}}
        soon="Transparent export is almost ready."
      />
      <SwitchRow
        className="mt-[27px]"
        label="Include music and effects"
        hint="The pops, whooshes and music you hear in the editor."
        checked={options.music}
        onCheckedChange={(music) => onOptions({ ...options, music })}
      />

      <div className="mt-[23px] h-px bg-dialog-line" />

      <div className="mt-5 flex items-baseline justify-between">
        <span className="tabular font-mono text-xs leading-4 text-ember-ink">
          {state.cost === null
            ? 'Cost: free'
            : `Cost: ${state.cost} ${state.cost === 1 ? 'credit' : 'credits'}`}
        </span>
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
          'h-12 w-full justify-start gap-2.5 rounded-chip px-4 pb-3 text-xs leading-4',
          note ? 'mt-5' : 'mt-[23px]',
        )}
      >
        <Upload className="size-4" strokeWidth={1.6} aria-hidden />
        Export video
      </Button>
      <div className="tabular mt-[15px] text-center font-mono text-[11px] leading-[14px] text-text-2">
        MP4 · H.264 · 30 fps
      </div>
    </div>
  );
}
