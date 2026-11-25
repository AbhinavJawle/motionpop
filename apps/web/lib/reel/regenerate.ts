import { briefFromEdit, styleCraftDirection } from '@motionpop/ai';
import { reelMediaKey, reelMediaOf, type ImageAsset, type ReelMedia } from '@motionpop/schemas';
import type { CreditsClient } from '@/lib/credits/client';
import { setReel } from '@/lib/commands';
import { editorStore } from '@/lib/stores/editor';
import { appAudioStore } from '@/lib/audio/app-audio-store';
import { getRouter } from '@/lib/ai/router-client';
import { composeGraphicScenes, composeReelHeroScenes } from './compose-graphic';
import {
  directGraphicPaid,
  directReelPaid,
  resolveReelMedia,
  resolveReelMediaList,
  resolveReelMusic,
} from './media';

/**
 * Directs the open project's reel again (spec 25 R4.1, spec 26 R5.1): supports talking-head video
 * reels, voiceover-only reels (`noVideo: true`), and prompt-driven graphics-only projects
 * (`reel.graphic` + bespoke Film Kit custom scene composition). One undo step.
 */
export async function regenerateReel(
  opts: { free?: boolean; credits?: CreditsClient | null } = {},
): Promise<'cloud' | 'device' | 'auto'> {
  const { project } = editorStore.getState();
  if (!project?.reel) throw new Error('This project has no reel');
  const credits = opts.credits ?? null;
  const prev = project.reel;
  const brief = project.edit ? (briefFromEdit(project.edit) ?? undefined) : undefined;
  const styleHint = [project.edit?.styleId ?? project.styleId, project.edit?.customStyle, prev.prompt]
    .filter(Boolean)
    .join(' ');

  if (prev.graphicOnly && prev.prompt) {
    const styleDirection = styleCraftDirection({
      styleId: project.edit?.styleId ?? project.styleId,
      ...(project.edit?.customStyle ? { customStyle: project.edit.customStyle } : {}),
      promptHint: prev.prompt,
    });
    const illustrationsOn = project.edit ? project.edit.illustrations : true;
    const r = await directGraphicPaid(
      {
        prompt: prev.prompt,
        look: prev.look,
        format: project.format,
        durationMs: project.durationMs,
        ...(brief ? { brief } : {}),
        styleDirection,
        illustrations: illustrationsOn,
        refId: project.id,
      },
      { credits, free: opts.free ?? false },
    );
    const assetMap = new Map<string, ImageAsset>((project.assets ?? []).map((a) => [a.id, a]));
    const newAssets: ImageAsset[] = [];
    const visualsByScene = new Map<string, ReelMedia[]>();
    const resolvedKeys = new Set<string>();
    const blueprints = r.blueprints ?? [];
    const bpEntries = blueprints.flatMap((bp) => bp.visuals.map((item) => ({ sceneId: bp.sceneId, item })));

    if (bpEntries.length > 0) {
      const got = await resolveReelMediaList(
        bpEntries.map((e) => e.item),
        prev.look,
        project.id,
        {
          credits,
          existing: project.assets ?? [],
          maxIllustrations: illustrationsOn ? 4 : 0,
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
      ...(prev.theme ? { theme: prev.theme } : {}),
    };
    if (reelMediaOf(plan).some((m) => !m.asset && !resolvedKeys.has(reelMediaKey(m)))) {
      const media = await resolveReelMedia(plan, prev.look, project.id, {
        credits,
        existing: [...assetMap.values()],
        maxIllustrations: illustrationsOn ? 3 : 0,
        styleHint,
      }).catch(() => ({ plan, assets: [] }));
      plan = { ...media.plan, ...(prev.theme ? { theme: prev.theme } : {}) };
      for (const a of media.assets) {
        assetMap.set(a.id, a);
        newAssets.push(a);
      }
    }

    if (blueprints.some((b) => b.mode === 'custom') && !opts.free) {
      plan = await composeGraphicScenes(
        {
          plan,
          blueprints,
          visualsByScene,
          assets: [...assetMap.values()],
          prompt: prev.prompt,
          format: project.format,
          ...(brief ? { brief } : {}),
          styleDirection,
        },
        { getRouter: () => getRouter().catch(() => null) },
      ).catch(() => plan);
    }

    editorStore.getState().exec(setReel(plan, 'Re-direct motion graphic', newAssets));
    return r.source;
  }

  const words = project.transcript.words.map((w) => ({
    text: w.text,
    startMs: w.startMs,
    endMs: w.endMs,
  }));
  const noVideo = !project.video;
  const r = await directReelPaid(
    {
      look: prev.look,
      words,
      durationMs: project.durationMs,
      refId: project.id,
      ...(brief ? { brief } : {}),
      ...(noVideo ? { noVideo: true } : {}),
    },
    { credits, free: opts.free ?? false },
  );
  const media = await resolveReelMedia(r.plan, prev.look, project.id, {
    credits,
    existing: project.assets ?? [],
    styleHint,
  }).catch(() => ({ plan: r.plan, assets: [] }));
  let composedPlan = media.plan;
  if (r.source === 'cloud' && !opts.free) {
    const heroStyleDirection = styleCraftDirection({
      styleId: project.edit?.styleId ?? project.styleId,
      ...(project.edit?.customStyle ? { customStyle: project.edit.customStyle } : {}),
      ...(project.edit?.userSkill?.name ? { promptHint: project.edit.userSkill.name } : {}),
    });
    composedPlan = await composeReelHeroScenes(
      {
        plan: { ...media.plan, ...(prev.theme ? { theme: prev.theme } : {}) },
        words,
        assets: [...(project.assets ?? []), ...media.assets],
        format: noVideo ? project.format : '9:16',
        noVideo,
        ...(brief ? { brief } : {}),
        styleDirection: heroStyleDirection,
        styleId: project.edit?.styleId ?? project.styleId,
        maxScenes: noVideo ? 4 : 3,
      },
      { getRouter: () => getRouter().catch(() => null) },
    ).catch(() => media.plan);
  }
  // The footage did not change: keep what the first pass saw (face keys, footage kind). A new
  // music brief gets new music; otherwise the old track stays.
  const sameBrief = !r.plan.music || r.plan.music.brief === prev.music?.brief;
  const scored = sameBrief
    ? composedPlan
    : await resolveReelMusic(composedPlan, project.durationMs, project.id, {
        audioStore: appAudioStore(),
      });
  const plan = {
    ...composedPlan,
    focus: prev.focus,
    ...(prev.footage ? { footage: prev.footage } : {}),
    ...(sameBrief
      ? prev.music
        ? { music: prev.music }
        : {}
      : scored.music
        ? { music: scored.music }
        : {}),
    captions: prev.captions,
  };
  const { exec } = editorStore.getState();
  exec(setReel(plan, 'Re-direct the reel', media.assets));
  return r.source;
}
