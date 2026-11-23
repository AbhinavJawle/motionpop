'use client';

import type { ReelScene } from '@motionpop/schemas';
import { cn } from '@/lib/cn';
import { msToX } from '@/lib/timeline/geometry';
import { useEditor } from '@/lib/stores/editor';
import { useTimeline } from './timeline-context';

const NAMES: Record<ReelScene['content']['template'], string> = {
  headline: 'Title',
  list: 'List',
  stack: 'Stack',
  checklist: 'Checklist',
  compare: 'Compare',
  statement: 'Statement',
  counter: 'Number',
  progress: 'Progress',
  terminal: 'Terminal',
  chart: 'Chart',
  browser: 'Website',
  flow: 'Steps',
  quote: 'Quote',
  punch: 'Punchline',
  cta: 'Call to action',
  none: 'Speaker',
  logo: 'Logo',
  logos: 'Logos',
  image: 'Picture',
  website: 'Website',
  custom: 'Custom',
};

/** The scene's main words, for its timeline card. */
function sceneText(s: ReelScene): string {
  const c = s.content;
  switch (c.template) {
    case 'headline':
    case 'list':
    case 'progress':
    case 'chart':
      return c.title;
    case 'stack':
      return c.words.map((w) => w.text).join(' · ');
    case 'checklist':
      return c.rows.map((r) => r.label).join(' · ');
    case 'compare':
      return `${c.left} vs ${c.right}`;
    case 'statement':
    case 'quote':
    case 'terminal':
      return c.lines.map((l) => l.text).join(' · ');
    case 'counter':
      return `${c.prefix}${c.value}${c.suffix} ${c.label}`;
    case 'browser':
      return c.headline;
    case 'flow':
      return c.steps.map((x) => x.text).join(' → ');
    case 'punch':
      return c.text;
    case 'cta':
      return `${c.verb} ${c.keyword}`;
    case 'none':
      return '';
    case 'logo':
      return c.name;
    case 'logos':
      return c.items.map((x) => x.name).join(' · ');
    case 'image':
      return c.title ?? (c.words.map((w) => w.text).join(' · ') || c.media.query);
    case 'website':
      return c.headline ?? c.url;
    case 'custom':
      return c.title;
  }
}

/**
 * The reel's scenes on the SLOTS row (spec 25): one card per scene, graphic scenes in violet,
 * speaker shots muted. A click moves the playhead to the scene.
 */
export function ReelScenesTrack() {
  const { view, clock } = useTimeline();
  const scenes = useEditor((s) => s.project?.reel?.scenes ?? []);
  return (
    <>
      {scenes.map((s) => {
        const left = msToX(s.startMs, view);
        const width = Math.max(6, msToX(s.endMs, view) - left - 2);
        const speaker = s.layout === 'speaker';
        const text = sceneText(s);
        return (
          <button
            key={s.id}
            type="button"
            title={`${NAMES[s.content.template]}${text ? ` · ${text}` : ''}`}
            onClick={() => clock.seek(s.startMs)}
            className={cn(
              'absolute top-1/2 z-[2] flex h-[38px] -translate-y-1/2 flex-col justify-center overflow-hidden rounded-[10px] border px-2 text-left',
              speaker
                ? 'border-line bg-card text-text-3'
                : 'border-violet/45 bg-linear-to-r from-violet/22 to-pip/18 text-violet-ink',
            )}
            style={{ left, width }}
          >
            <span className="truncate font-mono text-[9px] leading-3 tracking-[0.5px] uppercase opacity-80">
              {NAMES[s.content.template]}
            </span>
            {text && <span className="truncate text-[11px] leading-4">{text}</span>}
          </button>
        );
      })}
    </>
  );
}
