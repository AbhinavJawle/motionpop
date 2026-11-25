import { builtInSkills } from '@motionpop/ai';
import { formatCount, looks, stylePacks } from '@motionpop/motion';
import {
  keptSourceSegments,
  ProjectPreviewSchema,
  type EditorProject,
  type ImageAsset,
  type ProjectPreview,
  type ReelPlan,
  type ReelScene,
  type ReelTemplate,
  type Slot,
  type VideoTrack,
} from '@motionpop/schemas';

/**
 * Extracts a compact, content-authentic `ProjectPreview` from a project (or a parsed Firestore
 * `bodyJson` payload) so every thumbnail across the site shows what is actually inside (spec 41).
 */

const clip = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/\s+/g, ' ').trim();
  return s.length > 0 ? s.slice(0, max) : undefined;
};

const clipItems = (arr: readonly (string | undefined)[], max = 4): string[] | undefined => {
  const out = arr
    .map((s) => clip(s, 60))
    .filter((s): s is string => Boolean(s))
    .slice(0, max);
  return out.length > 0 ? out : undefined;
};

/** Resolves `[bg, ink, accent]` for any voiceover/motion-graphic style pack id. */
export function lookPalette(styleId: string, brandAccent?: string): [string, string, string] {
  const pack = looks[styleId] ?? stylePacks[styleId];
  if (!pack) return ['#F7F5F0', '#111111', brandAccent ?? '#FF6A3D'];
  return [pack.colors.bg, pack.colors.ink, brandAccent ?? pack.colors.accent];
}

/** Resolves `[bg, ink, accent]` for a talking-head reel from its edit style, theme and look. */
function reelPalette(
  reel: Pick<ReelPlan, 'look' | 'theme'>,
  edit?: EditorProject['edit'],
): [string, string, string] {
  if (edit && edit.recipeId !== 'custom' && edit.styleId) {
    const curated = builtInSkills.style(edit.recipeId, edit.styleId);
    if (curated) return [curated.swatch[0], curated.swatch[1], curated.swatch[2]];
  }
  const accent = reel.theme?.accent;
  if (reel.theme?.background === 'bold') {
    return ['#0E0E14', '#FFFFFF', accent ?? '#8B7CFF'];
  }
  if (reel.look === 'cream') {
    return ['#EAE4D9', '#151413', accent ?? '#D4623A'];
  }
  return ['#FFFFFF', '#0B0B0C', accent ?? '#5A57F0'];
}

/** First non-cut timestamp in the source video (400 ms into the first kept segment). */
function firstKeptMs(video: Pick<VideoTrack, 'originalDurationMs' | 'cuts'>): number {
  const segs = keptSourceSegments(video.originalDurationMs, video.cuts ?? []);
  const first = segs[0];
  if (!first) return Math.min(400, Math.max(0, video.originalDurationMs - 100));
  const span = first.endMs - first.startMs;
  return Math.round(first.startMs + Math.min(400, Math.floor(span * 0.25)));
}

function assetSrcById(
  assets: readonly ImageAsset[] | undefined,
  id: string | undefined,
): string | undefined {
  if (!assets || !id) return undefined;
  const hit = assets.find((a) => a.id === id);
  return hit?.src ? clip(hit.src, 300) : undefined;
}

function extractReelGraphic(
  g: ReelTemplate,
  assets: readonly ImageAsset[] | undefined,
): Partial<ProjectPreview> {
  const heroKind = g.template;
  switch (g.template) {
    case 'headline':
      return {
        heroKind,
        kicker: clip(g.kicker, 80),
        headline: clip(g.title, 140),
        subline: clip(g.accent ?? g.sub, 140),
      };
    case 'counter': {
      const formatted = formatCount(g.value, {
        prefix: g.prefix || undefined,
        suffix: g.suffix || undefined,
        decimals: g.decimals || undefined,
      });
      return {
        heroKind,
        kicker: clip(g.kicker, 80),
        headline: clip(formatted, 140),
        subline: clip(g.label, 140),
      };
    }
    case 'compare':
      return {
        heroKind,
        kicker: 'VS',
        headline: clip(`${g.left} vs ${g.right}`, 140),
        items: clipItems([g.left, g.right, ...g.rows.map((r) => r.text)], 4),
      };
    case 'list':
      return {
        heroKind,
        kicker: clip(g.kicker, 80),
        headline: clip(g.title, 140),
        items: clipItems(
          g.items.map((i) => i.text),
          4,
        ),
      };
    case 'stack':
      return {
        heroKind,
        kicker: clip(g.label, 80),
        headline: clip(g.words[0]?.text ?? g.label, 140),
        items: clipItems(
          g.words.map((w) => w.text),
          4,
        ),
      };
    case 'checklist':
      return {
        heroKind,
        kicker: clip(g.kicker ?? 'CHECKLIST', 80),
        headline: clip(g.rows[0]?.label, 140),
        items: clipItems(
          g.rows.map((r) => (r.value ? `${r.label} · ${r.value}` : r.label)),
          4,
        ),
      };
    case 'statement':
      return {
        heroKind,
        headline: clip(g.lines.map((l) => l.text).join(' '), 140),
        items: clipItems(
          g.lines.map((l) => l.text),
          4,
        ),
      };
    case 'progress':
      return {
        heroKind,
        kicker: clip(g.task, 80),
        headline: clip(g.title, 140),
        subline: clip(g.doneTitle ?? g.sub, 140),
      };
    case 'terminal':
      return {
        heroKind,
        kicker: clip(g.title ?? 'terminal', 80),
        headline: clip(g.lines[0]?.text, 140),
        items: clipItems(
          g.lines.map((l) => l.text),
          3,
        ),
      };
    case 'chart':
      return {
        heroKind,
        kicker: g.kind === 'bars' ? 'BAR CHART' : 'TREND',
        headline: clip(g.title, 140),
        items: clipItems(
          g.points.map((pt) => `${pt.label} ${pt.value}${g.unit}`),
          4,
        ),
      };
    case 'browser':
      return {
        heroKind,
        kicker: clip(g.url, 80),
        headline: clip(g.headline, 140),
        subline: clip(g.sub ?? g.button, 140),
      };
    case 'website':
      return {
        heroKind,
        kicker: clip(g.url, 80),
        headline: clip(g.headline ?? g.url, 140),
        imageSrc: assetSrcById(assets, g.media.asset),
      };
    case 'flow':
      return {
        heroKind,
        kicker: 'FLOW',
        headline: clip(g.steps.map((s) => s.text).join(' → '), 140),
        items: clipItems(
          g.steps.map((s) => s.text),
          4,
        ),
      };
    case 'quote':
      return {
        heroKind,
        headline: clip(g.lines.map((l) => l.text).join(' '), 140),
      };
    case 'logo':
      return {
        heroKind,
        kicker: 'FEATURED',
        headline: clip(g.name, 140),
        subline: clip(g.sub, 140),
        imageSrc: assetSrcById(assets, g.media.asset),
      };
    case 'logos':
      return {
        heroKind,
        kicker: clip(g.title ?? 'TOOLS', 80),
        headline: clip(g.items.map((i) => i.name).join(' · '), 140),
        items: clipItems(
          g.items.map((i) => i.name),
          4,
        ),
      };
    case 'image':
      return {
        heroKind,
        kicker: clip(g.kicker, 80),
        headline: clip(g.title ?? g.words.map((w) => w.text).join(' '), 140),
        imageSrc: assetSrcById(assets, g.media.asset),
      };
    case 'punch':
      return {
        heroKind,
        kicker: clip(g.top, 80),
        headline: clip(g.text, 140),
      };
    case 'cta':
      return {
        heroKind,
        kicker: clip(g.verb, 80),
        headline: clip(g.keyword, 140),
      };
    case 'custom':
      return {
        heroKind,
        headline: clip(g.title, 140),
        subline: clip(g.brief, 140),
      };
    case 'none':
    default:
      return { heroKind: 'none' };
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function slotContent(slot: Slot): Record<string, unknown> {
  const c = slot.params.content;
  return typeof c === 'object' && c !== null && !Array.isArray(c)
    ? (c as Record<string, unknown>)
    : slot.params;
}

function extractSlotPreview(
  slot: Slot,
  assets: readonly ImageAsset[] | undefined,
): Partial<ProjectPreview> {
  const c = slotContent(slot);
  const id = slot.componentId;

  if (id === 'stat-punch' || id === 'big-number') {
    const formatted =
      typeof c.value === 'number'
        ? formatCount(c.value, {
            prefix: typeof c.prefix === 'string' ? c.prefix : undefined,
            suffix: typeof c.suffix === 'string' ? c.suffix : undefined,
            decimals: typeof c.decimals === 'number' ? c.decimals : undefined,
          })
        : undefined;
    return {
      heroKind: 'stat-punch',
      kicker: clip(c.eyebrow ?? c.context ?? c.kicker, 80),
      headline: clip(formatted ?? c.title ?? c.label, 140),
      subline: clip(c.label ?? c.sub, 140),
    };
  }

  if (id === 'hook-statement' || id === 'kinetic-headline') {
    return {
      heroKind: 'hook-statement',
      kicker: clip(c.eyebrow ?? c.kicker, 80),
      headline: clip(c.line ?? c.title ?? c.headline, 140),
      subline: clip(c.sub ?? c.highlight, 140),
    };
  }

  if (id === 'versus') {
    const left = asRecord(c.left);
    const right = asRecord(c.right);
    const lLabel = clip(left.label ?? c.leftLabel ?? c.left, 40);
    const rLabel = clip(right.label ?? c.rightLabel ?? c.right, 40);
    const lVal = clip(left.value !== undefined ? String(left.value) : undefined, 24);
    const rVal = clip(right.value !== undefined ? String(right.value) : undefined, 24);
    return {
      heroKind: 'versus',
      kicker: clip(c.eyebrow ?? 'VERSUS', 80),
      headline: clip(c.title ?? (lLabel && rLabel ? `${lLabel} vs ${rLabel}` : undefined), 140),
      items: clipItems(
        [
          lLabel ? (lVal ? `${lLabel}: ${lVal}` : lLabel) : undefined,
          rLabel ? (rVal ? `${rLabel}: ${rVal}` : rLabel) : undefined,
        ],
        2,
      ),
    };
  }

  if (id === 'chart-story' || id === 'bar-chart' || id === 'line-chart') {
    const rawData = Array.isArray(c.data) ? c.data : Array.isArray(c.points) ? c.points : [];
    const items = rawData.slice(0, 4).map((d) => {
      const row = asRecord(d);
      const lbl = clip(row.label ?? row.name ?? row.x, 30);
      const val =
        row.value !== undefined
          ? String(row.value)
          : row.y !== undefined
            ? String(row.y)
            : undefined;
      return lbl && val ? `${lbl} · ${val}` : (lbl ?? val);
    });
    return {
      heroKind: 'chart-story',
      kicker: clip(c.eyebrow ?? c.unit ?? 'CHART', 80),
      headline: clip(c.title ?? c.label, 140),
      items: clipItems(items, 4),
    };
  }

  if (id === 'list-stack') {
    const rawItems = Array.isArray(c.items) ? c.items : [];
    const items = rawItems.slice(0, 4).map((it) => {
      if (typeof it === 'string') return it;
      const r = asRecord(it);
      return clip(r.title ?? r.text ?? r.label, 50);
    });
    return {
      heroKind: 'list-stack',
      kicker: clip(c.eyebrow ?? 'LIST', 80),
      headline: clip(c.title ?? items[0], 140),
      items: clipItems(items, 4),
    };
  }

  if (id === 'timeline') {
    const rawEvents = Array.isArray(c.events) ? c.events : Array.isArray(c.items) ? c.items : [];
    const items = rawEvents.slice(0, 4).map((ev) => {
      const r = asRecord(ev);
      const date = clip(r.date ?? r.year, 20);
      const lbl = clip(r.label ?? r.title ?? r.text, 36);
      return date && lbl ? `${date} · ${lbl}` : (date ?? lbl);
    });
    return {
      heroKind: 'timeline',
      kicker: clip(c.eyebrow ?? 'TIMELINE', 80),
      headline: clip(c.title ?? items[0], 140),
      items: clipItems(items, 4),
    };
  }

  if (id === 'quote') {
    return {
      heroKind: 'quote',
      headline: clip(c.quote ?? c.text ?? c.line, 140),
      subline: clip(c.attribution ?? c.author ?? c.speaker, 140),
    };
  }

  if (id === 'map-zoom') {
    const target = asRecord(c.target);
    return {
      heroKind: 'map-zoom',
      kicker: clip(c.eyebrow ?? c.region ?? 'MAP', 80),
      headline: clip(c.label ?? target.name ?? c.place ?? c.title, 140),
      subline: clip(c.sub ?? c.callout, 140),
    };
  }

  if (id === 'photo-evidence') {
    const assetId =
      typeof c.assetId === 'string'
        ? c.assetId
        : typeof slot.params.assetId === 'string'
          ? slot.params.assetId
          : undefined;
    return {
      heroKind: 'photo-evidence',
      kicker: clip(c.eyebrow ?? c.credit, 80),
      headline: clip(c.caption ?? c.title ?? c.label, 140),
      imageSrc: assetSrcById(assets, assetId) ?? clip(assets?.[0]?.src, 300),
    };
  }

  return {
    heroKind: clip(id, 40),
    kicker: clip(c.eyebrow ?? c.kicker, 80),
    headline: clip(c.title ?? c.line ?? c.label ?? c.text, 140),
    subline: clip(c.sub ?? c.caption, 140),
  };
}

function transcriptExcerpt(words: ReadonlyArray<{ text: string }> | undefined): string | undefined {
  if (!words || words.length === 0) return undefined;
  const joined = words
    .slice(0, 18)
    .map((w) => w.text)
    .join(' ');
  return clip(joined, 130);
}

function pickHeroScene(scenes: readonly ReelScene[]): ReelScene | undefined {
  return scenes.find((s) => s.content.template !== 'none') ?? scenes[0];
}

function cleanPreview(raw: ProjectPreview): ProjectPreview {
  const parsed = ProjectPreviewSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return { kind: raw.kind };
}

/** Builds a rich preview from a full `EditorProject` (used by IndexedDB `summarise` and Editor). */
export function buildProjectPreview(p: EditorProject): ProjectPreview {
  const excerpt = transcriptExcerpt(p.transcript.words);

  // 1. Talking-head Reel
  if (p.video && p.reel) {
    const hero = pickHeroScene(p.reel.scenes);
    const graphic = hero ? extractReelGraphic(hero.content, p.assets) : {};
    return cleanPreview({
      kind: 'reel',
      videoSrc: clip(p.video.src, 300),
      videoAtMs: firstKeptMs(p.video),
      ...(p.video.posterUrl ? { videoPoster: p.video.posterUrl } : {}),
      reelLook: p.reel.look,
      ...(hero ? { reelLayout: hero.layout } : {}),
      reelSceneCount: p.reel.scenes.length,
      palette: reelPalette(p.reel, p.edit),
      ...(excerpt ? { excerpt } : {}),
      ...graphic,
    });
  }

  // 1b. Graphics-only or voiceover-only Reel (no speaker video)
  if (p.reel && !p.video) {
    const hero = pickHeroScene(p.reel.scenes);
    const graphic = hero ? extractReelGraphic(hero.content, p.assets) : {};
    const fallbackHeadline = graphic.headline ?? excerpt ?? clip(p.title, 140);
    return cleanPreview({
      kind: 'motion',
      reelLook: p.reel.look,
      ...(hero ? { reelLayout: hero.layout } : {}),
      reelSceneCount: p.reel.scenes.length,
      palette: reelPalette(p.reel, p.edit),
      ...(excerpt ? { excerpt } : {}),
      ...graphic,
      ...(fallbackHeadline ? { headline: fallbackHeadline } : {}),
    });
  }

  // 2. Video project without a ReelPlan (legacy video choreography / raw clip)
  if (p.video) {
    const ordered = [...p.slots].sort((a, b) => a.startMs - b.startMs);
    const heroSlot = ordered.find((s) => s.status === 'ready') ?? ordered[0];
    const slotInfo = heroSlot ? extractSlotPreview(heroSlot, p.assets) : {};
    return cleanPreview({
      kind: 'video',
      videoSrc: clip(p.video.src, 300),
      videoAtMs: firstKeptMs(p.video),
      ...(p.video.posterUrl ? { videoPoster: p.video.posterUrl } : {}),
      palette: lookPalette(p.styleId, p.brand?.accent),
      ...(excerpt ? { excerpt } : {}),
      ...slotInfo,
    });
  }

  // 3. Motion-graphic / voiceover / script project
  const ordered = [...p.slots].sort((a, b) => a.startMs - b.startMs);
  const heroSlot = ordered.find((s) => s.status === 'ready') ?? ordered[0];
  const slotInfo = heroSlot ? extractSlotPreview(heroSlot, p.assets) : {};
  const filmIdea = p.film?.storyboard.beats[0]?.idea;
  const fallbackHeadline =
    slotInfo.headline ?? clip(filmIdea, 140) ?? excerpt ?? clip(p.title, 140);
  const photoFallback =
    !slotInfo.imageSrc && heroSlot?.componentId === 'photo-evidence'
      ? clip(p.assets?.[0]?.src, 300)
      : undefined;

  return cleanPreview({
    kind: 'motion',
    palette: lookPalette(p.styleId, p.brand?.accent),
    ...(excerpt ? { excerpt } : {}),
    ...slotInfo,
    ...(fallbackHeadline ? { headline: fallbackHeadline } : {}),
    ...(photoFallback ? { imageSrc: photoFallback } : {}),
  });
}

/**
 * Backfills a `ProjectPreview` from a Firestore `CloudProjectDoc`'s `bodyJson` object (for
 * existing cloud projects saved before `preview` was stored on the document).
 */
export function buildProjectPreviewFromBody(
  body: unknown,
  styleId: string,
  title: string,
): { preview: ProjectPreview; reelSceneCount?: number } {
  const b = asRecord(body);
  const video = typeof b.video === 'object' && b.video !== null ? (b.video as VideoTrack) : null;
  const reel = typeof b.reel === 'object' && b.reel !== null ? (b.reel as ReelPlan) : null;
  const edit =
    typeof b.edit === 'object' && b.edit !== null ? (b.edit as EditorProject['edit']) : undefined;
  const assets = Array.isArray(b.assets) ? (b.assets as ImageAsset[]) : undefined;
  const brand = asRecord(b.brand);
  const brandAccent = typeof brand.accent === 'string' ? brand.accent : undefined;

  if (video && typeof video.src === 'string' && reel && Array.isArray(reel.scenes)) {
    const hero = pickHeroScene(reel.scenes);
    const graphic = hero?.content ? extractReelGraphic(hero.content, assets) : {};
    const origMs =
      typeof video.originalDurationMs === 'number' && video.originalDurationMs > 0
        ? video.originalDurationMs
        : 1000;
    const cuts = Array.isArray(video.cuts) ? video.cuts : [];
    return {
      reelSceneCount: reel.scenes.length,
      preview: cleanPreview({
        kind: 'reel',
        videoSrc: clip(video.src, 300),
        videoAtMs: firstKeptMs({ originalDurationMs: origMs, cuts }),
        ...(typeof video.posterUrl === 'string' ? { videoPoster: video.posterUrl } : {}),
        reelLook: reel.look === 'cream' ? 'cream' : 'mono',
        ...(hero ? { reelLayout: hero.layout } : {}),
        reelSceneCount: reel.scenes.length,
        palette: reelPalette(reel, edit),
        ...graphic,
      }),
    };
  }

  if (!video && reel && Array.isArray(reel.scenes)) {
    const hero = pickHeroScene(reel.scenes);
    const graphic = hero?.content ? extractReelGraphic(hero.content, assets) : {};
    const fallbackHeadline = graphic.headline ?? clip(title, 140);
    return {
      reelSceneCount: reel.scenes.length,
      preview: cleanPreview({
        kind: 'motion',
        reelLook: reel.look === 'cream' ? 'cream' : 'mono',
        ...(hero ? { reelLayout: hero.layout } : {}),
        reelSceneCount: reel.scenes.length,
        palette: reelPalette(reel, edit),
        ...graphic,
        ...(fallbackHeadline ? { headline: fallbackHeadline } : {}),
      }),
    };
  }

  if (video && typeof video.src === 'string') {
    const origMs =
      typeof video.originalDurationMs === 'number' && video.originalDurationMs > 0
        ? video.originalDurationMs
        : 1000;
    const cuts = Array.isArray(video.cuts) ? video.cuts : [];
    return {
      preview: cleanPreview({
        kind: 'video',
        videoSrc: clip(video.src, 300),
        videoAtMs: firstKeptMs({ originalDurationMs: origMs, cuts }),
        ...(typeof video.posterUrl === 'string' ? { videoPoster: video.posterUrl } : {}),
        palette: lookPalette(styleId, brandAccent),
        headline: clip(title, 140),
      }),
    };
  }

  const film = asRecord(b.film);
  const storyboard = asRecord(film.storyboard);
  const beats = Array.isArray(storyboard.beats) ? storyboard.beats : [];
  const firstBeat = asRecord(beats[0]);
  const voiceover = asRecord(b.voiceover);
  const tts = asRecord(voiceover.tts);
  const scriptExcerpt = clip(tts.script, 130);

  return {
    preview: cleanPreview({
      kind: 'motion',
      palette: lookPalette(styleId, brandAccent),
      headline: clip(firstBeat.idea ?? title, 140),
      ...(scriptExcerpt ? { excerpt: scriptExcerpt } : {}),
      ...(assets?.[0]?.src ? { imageSrc: clip(assets[0].src, 300) } : {}),
    }),
  };
}
