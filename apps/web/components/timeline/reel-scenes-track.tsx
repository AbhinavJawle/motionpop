'use client';

import { briefFromEdit, styleCraftDirection } from '@motionpop/ai';
import {
  isGraphicReel,
  reelMediaKey,
  reelMediaOf,
  type ImageAsset,
  type ReelMedia,
  type ReelScene,
} from '@motionpop/schemas';
import { Loader2, Plus, X } from 'lucide-react';
import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import { toast } from 'sonner';
import { getRouter } from '@/lib/ai/router-client';
import { cn } from '@/lib/cn';
import { appendReelScenes, deleteReelScene, resizeReelSceneBoundary } from '@/lib/commands';
import { useCreditsClient } from '@/lib/credits/use-credits-client';
import { composeGraphicScenes } from '@/lib/reel/compose-graphic';
import { directGraphicPaid, resolveReelMedia, resolveReelMediaList } from '@/lib/reel/media';
import { msToX } from '@/lib/timeline/geometry';
import { editorStore, useEditor } from '@/lib/stores/editor';
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
  clip: 'Clip',
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
    case 'clip':
      return c.label ?? (c.fit === 'screen-window' ? 'Screen showcase' : 'Uploaded clip');
    case 'custom':
      return c.title;
  }
}

const EMPTY_SCENES: readonly ReelScene[] = [];

/**
 * The reel's scenes as interactive slots on the Graphics row (spec 25 + graphics-only slot mode):
 * click to seek, drag the right edge between scenes to resize slot timing, click × to delete, and
 * on graphics-only projects click "+ Scene" to prompt and append a new graphic slot.
 */
export function ReelScenesTrack() {
  const { view, clock } = useTimeline();
  const scenes = useEditor((s) => s.project?.reel?.scenes ?? EMPTY_SCENES);
  const playheadMs = useEditor((s) => s.playheadMs);
  const graphicOnly = useEditor((s) => isGraphicReel(s.project));
  const exec = useEditor((s) => s.exec);
  const { client: credits } = useCreditsClient();

  const [adding, setAdding] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);

  const startResize = (e: ReactPointerEvent<HTMLSpanElement>, scene: ReelScene) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const initialEndMs = scene.endMs;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const deltaMs = dx / Math.max(0.001, view.pxPerMs);
      exec(resizeReelSceneBoundary(scene.id, initialEndMs + deltaMs));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleAddScene = async () => {
    const clean = prompt.trim();
    const project = editorStore.getState().project;
    if (!clean || !project?.reel || busy) return;
    setBusy(true);
    try {
      const brief = project.edit ? (briefFromEdit(project.edit) ?? undefined) : undefined;
      const styleDirection = styleCraftDirection({
        styleId: project.edit?.styleId ?? project.styleId,
        ...(project.edit?.customStyle ? { customStyle: project.edit.customStyle } : {}),
        promptHint: clean,
      });
      const styleHint = [project.edit?.styleId ?? project.styleId, project.edit?.customStyle, clean]
        .filter(Boolean)
        .join(' ');
      const illustrationsOn = project.edit ? project.edit.illustrations : true;

      const r = await directGraphicPaid(
        {
          prompt: clean,
          look: project.reel.look,
          format: project.format,
          durationMs: 4000,
          ...(brief ? { brief } : {}),
          styleDirection,
          illustrations: illustrationsOn,
          refId: `${project.id}-slot`,
        },
        { credits },
      );

      const assetMap = new Map<string, ImageAsset>((project.assets ?? []).map((a) => [a.id, a]));
      const newAssets: ImageAsset[] = [];
      const visualsByScene = new Map<string, ReelMedia[]>();
      const resolvedKeys = new Set<string>();
      const blueprints = r.blueprints ?? [];
      const bpEntries = blueprints.flatMap((bp) =>
        bp.visuals.map((item) => ({ sceneId: bp.sceneId, item })),
      );
      if (bpEntries.length > 0) {
        const got = await resolveReelMediaList(
          bpEntries.map((e) => e.item),
          project.reel.look,
          project.id,
          {
            credits,
            existing: project.assets ?? [],
            maxIllustrations: illustrationsOn ? 2 : 0,
            styleHint,
          },
        ).catch(() => null);
        if (got) {
          for (const a of got.assets) {
            assetMap.set(a.id, a);
            newAssets.push(a);
          }
          for (let i = 0; i < bpEntries.length; i++) {
            const entry = bpEntries[i]!;
            const resolved = got.media[i] ?? entry.item;
            if (resolved.asset) resolvedKeys.add(reelMediaKey(resolved));
            const list = visualsByScene.get(entry.sceneId) ?? [];
            list.push(resolved);
            visualsByScene.set(entry.sceneId, list);
          }
        }
      }

      let plan = {
        ...r.plan,
        ...(project.reel.theme ? { theme: project.reel.theme } : {}),
      };
      if (reelMediaOf(plan).some((m) => !m.asset && !resolvedKeys.has(reelMediaKey(m)))) {
        const media = await resolveReelMedia(plan, project.reel.look, project.id, {
          credits,
          existing: [...assetMap.values()],
          maxIllustrations: illustrationsOn ? 2 : 0,
          styleHint,
        }).catch(() => ({ plan, assets: [] }));
        plan = { ...media.plan, ...(project.reel.theme ? { theme: project.reel.theme } : {}) };
        for (const a of media.assets) {
          assetMap.set(a.id, a);
          newAssets.push(a);
        }
      }

      if (blueprints.some((b) => b.mode === 'custom')) {
        plan = await composeGraphicScenes(
          {
            plan,
            blueprints,
            visualsByScene,
            assets: [...assetMap.values()],
            prompt: clean,
            format: project.format,
            ...(brief ? { brief } : {}),
            styleDirection,
          },
          { getRouter: () => getRouter().catch(() => null) },
        ).catch(() => plan);
      }

      exec(appendReelScenes(plan.scenes, newAssets, 'Add graphic scene'));
      const added = editorStore.getState().project?.reel?.scenes;
      const last = added?.[added.length - 1];
      if (last) clock.seek(last.startMs);
      setPrompt('');
      setAdding(false);
    } catch {
      toast.error("Couldn't generate that graphic scene. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const lastScene = scenes[scenes.length - 1];
  const addLeft = lastScene ? msToX(lastScene.endMs, view) + 6 : 8;

  return (
    <>
      {scenes.map((s, idx) => {
        const left = msToX(s.startMs, view);
        const width = Math.max(12, msToX(s.endMs, view) - left - 2);
        const speaker = s.layout === 'speaker';
        const active = playheadMs >= s.startMs && playheadMs < s.endMs;
        const text = sceneText(s);
        const canResizeRight = idx < scenes.length - 1;
        const canDelete = scenes.length > 1;
        return (
          <div
            key={s.id}
            className="group absolute top-1/2 z-[2] h-[38px] -translate-y-1/2"
            style={{ left, width }}
          >
            <button
              type="button"
              title={`${NAMES[s.content.template]}${text ? ` · ${text}` : ''}`}
              onClick={() => clock.seek(s.startMs)}
              className={cn(
                'flex size-full flex-col justify-center overflow-hidden rounded-[10px] border px-2 text-left transition-colors',
                speaker
                  ? 'border-line bg-card text-text-3'
                  : active
                    ? 'border-violet bg-linear-to-r from-violet/30 to-pip/25 text-violet-ink ring-1 ring-violet/40'
                    : 'border-violet/45 bg-linear-to-r from-violet/22 to-pip/18 text-violet-ink hover:border-violet/70',
              )}
            >
              <span className="truncate font-mono text-[9px] leading-3 tracking-[0.5px] uppercase opacity-80">
                {NAMES[s.content.template]}
              </span>
              {text && <span className="truncate text-[11px] leading-4">{text}</span>}
            </button>
            {canDelete && width >= 44 && (
              <button
                type="button"
                aria-label={`Remove ${NAMES[s.content.template]} scene`}
                title="Remove scene slot"
                onClick={(e) => {
                  e.stopPropagation();
                  exec(deleteReelScene(s.id));
                }}
                className="absolute top-1 right-1.5 hidden size-4 items-center justify-center rounded bg-paper/90 text-text-2 shadow-xs hover:text-flame group-hover:flex"
              >
                <X className="size-2.5" strokeWidth={2.2} aria-hidden />
              </button>
            )}
            {canResizeRight && (
              <span
                role="separator"
                aria-orientation="vertical"
                aria-label={`Resize ${NAMES[s.content.template]} scene`}
                onPointerDown={(e) => startResize(e, s)}
                className="absolute top-0 -right-1 z-[4] h-full w-2.5 cursor-col-resize"
              />
            )}
          </div>
        );
      })}
      {graphicOnly && (
        <div
          className="absolute top-1/2 z-[3] flex -translate-y-1/2 items-center"
          style={{ left: addLeft }}
        >
          {adding ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleAddScene();
              }}
              className="flex items-center gap-1 rounded-[10px] border border-violet bg-paper px-2 py-1 shadow-sm"
            >
              <input
                autoFocus
                value={prompt}
                disabled={busy}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setAdding(false);
                    setPrompt('');
                  }
                }}
                aria-label="Describe next graphic scene"
                placeholder="Next graphic slot…"
                className="w-[180px] bg-transparent font-sans text-[11px] text-ink outline-none placeholder:text-text-3"
              />
              <button
                type="submit"
                disabled={busy || !prompt.trim()}
                className="inline-flex h-5 items-center gap-1 rounded bg-ink px-2 font-mono text-[10px] text-paper disabled:opacity-40"
              >
                {busy ? <Loader2 className="size-2.5 animate-spin" /> : 'Add'}
              </button>
              <button
                type="button"
                aria-label="Cancel add scene"
                onClick={() => {
                  setAdding(false);
                  setPrompt('');
                }}
                className="p-0.5 text-text-3 hover:text-ink"
              >
                <X className="size-3" />
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex h-[34px] items-center gap-1 rounded-[10px] border border-dashed border-violet/50 bg-paper/70 px-2.5 font-mono text-[10px] text-violet-ink transition-colors hover:border-violet hover:bg-violet/10"
            >
              <Plus className="size-3" strokeWidth={2} aria-hidden />
              Scene
            </button>
          )}
        </div>
      )}
    </>
  );
}
