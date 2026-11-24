'use client';

import type { ProjectPreview, ProjectSummary } from '@motionpop/schemas';
import { Film, MapPin, Play } from 'lucide-react';
import { cn } from '@/lib/cn';
import { lookPalette } from '@/lib/projects/preview';
import { useAssetThumb, useVideoThumb } from '@/lib/projects/video-thumb';

type PosterSize = 'sm' | 'md' | 'lg';

/** Relative luminance check so badge contrast adapts to light or dark look palettes. */
function isDarkHex(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110;
}

/** Deterministic mini waveform heights from a string so each voiceover card looks unique. */
function waveBars(seed: string, count = 22): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Array.from({ length: count }, (_, i) => {
    const v = Math.abs(Math.sin((h % 97) * 0.13 + i * 0.72) * 0.65 + Math.cos(i * 1.41) * 0.35);
    return Math.round(24 + v * 76);
  });
}

/**
 * Content-authentic project thumbnail (spec 41): renders what is actually inside the project —
 * real face-centred video frames + opening reel graphic for talking-head videos, and live
 * miniature compositions of the actual hero graphic / transcript in the project's real look
 * palette for voiceover and motion-graphic projects. Never shows static demo `/looks/*.jpg` stills.
 */
export function ProjectPoster({
  project,
  styleId,
  title,
  size = 'md',
  className,
}: {
  project?: Pick<ProjectSummary, 'styleId' | 'title' | 'format' | 'preview'>;
  styleId?: string;
  title?: string;
  size?: PosterSize;
  className?: string;
}) {
  const resolvedStyleId = project?.styleId ?? styleId ?? 'editorial-explainer';
  const resolvedTitle = project?.title ?? title ?? 'Untitled Project';
  const preview: ProjectPreview = project?.preview ?? {
    kind: 'motion',
    headline: resolvedTitle,
    palette: lookPalette(resolvedStyleId),
  };

  const videoThumb = useVideoThumb(preview.videoSrc, preview.videoAtMs ?? 300, preview.videoPoster);
  const assetThumb = useAssetThumb(preview.imageSrc);
  const [bg, ink, accent] = preview.palette ?? lookPalette(resolvedStyleId);
  const dark = isDarkHex(bg);

  // 1. Talking-head Reel & Video projects
  if (preview.kind === 'reel' || preview.kind === 'video') {
    const isReel = preview.kind === 'reel';
    const hasGraphic =
      isReel &&
      preview.reelLayout !== 'speaker' &&
      preview.heroKind !== 'none' &&
      Boolean(preview.headline || preview.items?.length || assetThumb);

    // Compact thumbnails (list rows & editor Projects sidebar): full-bleed real video frame.
    if (size === 'sm') {
      return (
        <div
          aria-hidden
          data-testid="project-poster"
          data-kind={preview.kind}
          className={cn('relative overflow-hidden bg-[#16161b] select-none', className)}
        >
          {videoThumb ? (
            // eslint-disable-next-line @next/next/no-img-element -- extracted video keyframe data URL
            <img
              src={videoThumb}
              alt=""
              draggable={false}
              className="block h-full w-full object-cover object-[50%_26%]"
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center px-1.5 text-center"
              style={{ background: bg, color: ink }}
            >
              <Film className="size-3.5 opacity-60" strokeWidth={2} />
            </div>
          )}
        </div>
      );
    }

    // Medium / Large Reel with a real graphic scene: crisp split preview showing BOTH the real
    // speaker footage (left) and the actual opening graphic in its real theme palette (right).
    if (hasGraphic) {
      return (
        <div
          aria-hidden
          data-testid="project-poster"
          data-kind="reel"
          className={cn(
            'relative grid grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] overflow-hidden bg-[#141418] select-none',
            className,
          )}
        >
          {/* Left: Real speaker video frame */}
          <div className="relative h-full w-full overflow-hidden border-r-2 border-ink bg-[#18181f]">
            {videoThumb ? (
              // eslint-disable-next-line @next/next/no-img-element -- extracted video keyframe data URL
              <img
                src={videoThumb}
                alt=""
                draggable={false}
                className="block h-full w-full object-cover object-[50%_26%]"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[linear-gradient(150deg,#23232d,#131318)] text-white/55">
                <Film className="size-5" strokeWidth={1.8} />
                <span className="font-mono text-[10px]">Video</span>
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.78))] px-2.5 pt-6 pb-2 text-[10px] text-white">
              <span className="inline-flex items-center gap-1 font-mono font-semibold tracking-[0.04em] uppercase">
                <Play className="size-2.5 fill-current" />
                {project?.format ?? '9:16'} Reel
              </span>
              {preview.reelSceneCount ? (
                <span className="font-mono text-white/80 tabular-nums">
                  {preview.reelSceneCount} scenes
                </span>
              ) : null}
            </div>
          </div>

          {/* Right: Real opening reel graphic in its real theme palette */}
          <div
            className="relative flex h-full w-full flex-col justify-center overflow-hidden px-3.5 py-3"
            style={{
              backgroundColor: bg,
              color: ink,
              backgroundImage:
                preview.reelLook === 'mono' && !dark
                  ? 'radial-gradient(rgba(0,0,0,0.08) 1px, transparent 1px)'
                  : undefined,
              backgroundSize: '12px 12px',
            }}
          >
            <ReelGraphicMini
              preview={preview}
              assetThumb={assetThumb}
              ink={ink}
              accent={accent}
              dark={dark}
              large={size === 'lg'}
            />
          </div>
        </div>
      );
    }

    // Raw video or speaker-only reel: clean full-bleed face-centred real video frame (Reference 1).
    const captionLine = preview.headline || preview.excerpt;
    return (
      <div
        aria-hidden
        data-testid="project-poster"
        data-kind={preview.kind}
        className={cn('relative overflow-hidden bg-[#141418] select-none', className)}
      >
        {videoThumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- extracted video keyframe data URL
          <img
            src={videoThumb}
            alt=""
            draggable={false}
            className="block h-full w-full object-cover object-[50%_26%]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[linear-gradient(150deg,#23232d,#131318)] px-5 text-center text-white/75">
            <Film className="size-6 opacity-70" strokeWidth={1.8} />
            <span className="line-clamp-2 text-[12px] font-medium">{resolvedTitle}</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.82))] px-3 pt-8 pb-2.5 text-white">
          <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
            <span className="inline-flex items-center gap-1 font-semibold tracking-[0.04em] uppercase">
              <Play className="size-2.5 fill-current" />
              {isReel
                ? `${project?.format ?? '9:16'} Reel${preview.reelSceneCount ? ` · ${preview.reelSceneCount} scenes` : ''}`
                : `${project?.format ?? '16:9'} Video`}
            </span>
          </div>
          {captionLine && (
            <p className="mt-1 line-clamp-1 font-sans text-[12px] leading-tight font-medium text-white/95">
              {captionLine}
            </p>
          )}
        </div>
      </div>
    );
  }

  // 2. Motion-Graphic / Voiceover / Script projects (no source video)
  return (
    <MotionContentPoster
      preview={preview}
      title={resolvedTitle}
      styleId={resolvedStyleId}
      bg={bg}
      ink={ink}
      accent={accent}
      dark={dark}
      assetThumb={assetThumb}
      size={size}
      className={className}
    />
  );
}

/** Miniature rendering of the reel's actual hero scene graphic (mono/cream/bold). */
function ReelGraphicMini({
  preview,
  assetThumb,
  ink,
  accent,
  dark,
  large,
}: {
  preview: ProjectPreview;
  assetThumb: string | null;
  ink: string;
  accent: string;
  dark: boolean;
  large: boolean;
}) {
  const kind = preview.heroKind;
  const muted = dark ? 'rgba(255,255,255,0.62)' : 'rgba(15,15,20,0.56)';
  const subtleBg = dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.06)';
  const isCream = preview.reelLook === 'cream';

  if (assetThumb && (kind === 'image' || kind === 'website' || kind === 'logo')) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- project image asset */}
        <img
          src={assetThumb}
          alt=""
          className={cn(
            'rounded-md border border-black/15 object-cover shadow-xs',
            kind === 'logo' ? 'size-12 object-contain p-1.5 bg-white' : 'h-[62%] w-full',
          )}
        />
        {preview.headline && (
          <div
            className={cn(
              'line-clamp-2 font-sans font-bold tracking-[-0.02em]',
              large ? 'text-[14px] leading-tight' : 'text-[11px] leading-tight',
            )}
          >
            {preview.headline}
          </div>
        )}
      </div>
    );
  }

  if (kind === 'counter') {
    return (
      <div className="flex flex-col items-center text-center">
        {preview.kicker && (
          <span
            className="line-clamp-1 font-mono text-[9px] tracking-[0.06em] uppercase"
            style={{ color: muted }}
          >
            {preview.kicker}
          </span>
        )}
        <span
          className={cn(
            'mt-1 font-poster leading-[0.9] tracking-[0.01em] tabular-nums',
            large ? 'text-[52px]' : 'text-[38px]',
          )}
          style={{ color: accent }}
        >
          {preview.headline}
        </span>
        {preview.subline && (
          <span
            className={cn(
              'mt-1.5 line-clamp-2 font-sans font-semibold',
              large ? 'text-[13px]' : 'text-[11px]',
            )}
          >
            {preview.subline}
          </span>
        )}
      </div>
    );
  }

  if (kind === 'terminal') {
    return (
      <div className="w-full overflow-hidden rounded-md border border-black/25 bg-[#0d1117] p-2.5 text-left font-mono text-[10px] text-[#e6edf3]">
        <div className="mb-1.5 flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-[#ff5f56]" />
          <span className="size-1.5 rounded-full bg-[#ffbd2e]" />
          <span className="size-1.5 rounded-full bg-[#27c93f]" />
          {preview.kicker && (
            <span className="ml-1 truncate text-[8px] text-white/45">{preview.kicker}</span>
          )}
        </div>
        {(preview.items ?? (preview.headline ? [preview.headline] : [])).slice(0, 3).map((l, i) => (
          <div key={i} className="truncate leading-[1.45]">
            <span style={{ color: accent }}>$ </span>
            {l}
          </div>
        ))}
      </div>
    );
  }

  if (kind === 'compare' && preview.items && preview.items.length >= 2) {
    return (
      <div className="flex flex-col gap-2">
        <span
          className="text-center font-mono text-[9px] font-semibold tracking-[0.08em] uppercase"
          style={{ color: muted }}
        >
          Compare
        </span>
        <div className="grid grid-cols-2 gap-1.5">
          <div
            className="rounded-md px-2 py-2.5 text-center font-sans text-[10px] leading-tight font-semibold"
            style={{ background: subtleBg, color: ink }}
          >
            <span className="line-clamp-2">{preview.items[0]}</span>
          </div>
          <div
            className="rounded-md px-2 py-2.5 text-center font-sans text-[10px] leading-tight font-bold text-white"
            style={{ background: accent }}
          >
            <span className="line-clamp-2">{preview.items[1]}</span>
          </div>
        </div>
      </div>
    );
  }

  if (
    (kind === 'list' || kind === 'stack' || kind === 'checklist' || kind === 'flow') &&
    preview.items?.length
  ) {
    return (
      <div className="flex flex-col gap-1.5 text-left">
        {(preview.kicker || preview.headline) && (
          <div
            className="line-clamp-1 font-sans text-[11px] font-bold tracking-[-0.01em]"
            style={{ color: ink }}
          >
            {preview.headline ?? preview.kicker}
          </div>
        )}
        <div className="flex flex-col gap-1">
          {preview.items.slice(0, 3).map((item, idx) => (
            <div
              key={idx}
              className="flex items-center gap-1.5 rounded px-2 py-1 font-sans text-[10px] leading-tight font-medium"
              style={{ background: subtleBg }}
            >
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: idx === 0 ? accent : muted }}
              />
              <span className="truncate">{item}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Default Reel graphic (headline, statement, quote, punch, cta, progress, browser, etc.)
  return (
    <div className="flex flex-col items-center text-center">
      {preview.kicker && (
        <span className="line-clamp-1 font-sans text-[10px] font-medium" style={{ color: muted }}>
          {preview.kicker}
        </span>
      )}
      {preview.headline && (
        <div
          className={cn(
            'mt-1 line-clamp-3 leading-[1.06] font-extrabold tracking-[-0.025em]',
            isCream ? 'font-serif font-semibold' : 'font-sans uppercase',
            large ? 'text-[19px]' : 'text-[14px]',
          )}
        >
          {preview.headline}
        </div>
      )}
      {preview.subline && (
        <span
          className={cn(
            'mt-1 line-clamp-1 font-sans font-bold tracking-[-0.01em]',
            large ? 'text-[15px]' : 'text-[12px]',
          )}
          style={{ color: accent }}
        >
          {preview.subline}
        </span>
      )}
    </div>
  );
}

/** Live miniature composition for voiceover / script / motion-graphic projects. */
function MotionContentPoster({
  preview,
  title,
  styleId,
  bg,
  ink,
  accent,
  dark,
  assetThumb,
  size,
  className,
}: {
  preview: ProjectPreview;
  title: string;
  styleId: string;
  bg: string;
  ink: string;
  accent: string;
  dark: boolean;
  assetThumb: string | null;
  size: PosterSize;
  className?: string;
}) {
  const muted = dark ? 'rgba(255,255,255,0.6)' : 'rgba(20,20,24,0.55)';
  const subtleBg = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)';
  const kind = preview.heroKind;
  const headline = preview.headline ?? preview.excerpt ?? title;
  const bars = waveBars(title + (preview.excerpt ?? ''), 20);

  const gridStyle =
    styleId === 'studio-light' || styleId === 'keynote-clean'
      ? {
          backgroundImage: dark
            ? 'radial-gradient(rgba(255,255,255,0.09) 1px, transparent 1px)'
            : 'radial-gradient(rgba(0,0,0,0.09) 1px, transparent 1px)',
          backgroundSize: '14px 14px',
        }
      : {};

  // Compact mode (78×44 list row or 72×40 editor projects panel)
  if (size === 'sm') {
    if (assetThumb) {
      return (
        <div
          aria-hidden
          data-testid="project-poster"
          data-kind="motion"
          className={cn('relative overflow-hidden select-none', className)}
          style={{ background: bg }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- project image asset */}
          <img src={assetThumb} alt="" className="block h-full w-full object-cover" />
        </div>
      );
    }
    return (
      <div
        aria-hidden
        data-testid="project-poster"
        data-kind="motion"
        className={cn(
          'relative flex flex-col justify-between overflow-hidden px-1.5 py-1 select-none',
          className,
        )}
        style={{ backgroundColor: bg, color: ink, ...gridStyle }}
      >
        <span className="h-[3px] w-4 rounded-full" style={{ background: accent }} />
        <span className="line-clamp-2 font-sans text-[9px] leading-[1.1] font-bold">
          {headline}
        </span>
      </div>
    );
  }

  // Real image asset (photo-evidence / illustrated scene)
  if (assetThumb) {
    return (
      <div
        aria-hidden
        data-testid="project-poster"
        data-kind="motion"
        className={cn('relative overflow-hidden select-none', className)}
        style={{ backgroundColor: bg, color: ink }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- project image asset */}
        <img src={assetThumb} alt="" className="block h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.8))] px-3.5 pt-8 pb-2.5 text-white">
          <p className="line-clamp-2 font-sans text-[13px] leading-snug font-semibold">
            {headline}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      aria-hidden
      data-testid="project-poster"
      data-kind="motion"
      className={cn(
        'relative flex flex-col justify-between overflow-hidden px-5 py-4 select-none',
        className,
      )}
      style={{ backgroundColor: bg, color: ink, ...gridStyle }}
    >
      {/* Top eyebrow / scene type tag */}
      <div className="flex items-center justify-between gap-2">
        <span
          className="line-clamp-1 font-mono text-[10px] font-semibold tracking-[0.07em] uppercase"
          style={{ color: muted }}
        >
          {preview.kicker ??
            (kind === 'stat-punch'
              ? 'KEY STAT'
              : kind === 'versus'
                ? 'COMPARISON'
                : kind === 'chart-story'
                  ? 'DATA STORY'
                  : kind === 'list-stack'
                    ? 'KEY POINTS'
                    : kind === 'timeline'
                      ? 'TIMELINE'
                      : kind === 'map-zoom'
                        ? 'LOCATION'
                        : kind === 'quote'
                          ? 'QUOTE'
                          : 'MOTION GRAPHIC')}
        </span>
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: accent }} />
      </div>

      {/* Main visual body driven by the project's ACTUAL hero content */}
      <div className="my-auto py-2">
        {kind === 'stat-punch' ? (
          <div className="flex flex-col items-start">
            <span
              className={cn(
                'inline-block rounded-lg px-2.5 py-0.5 font-poster leading-[0.95] tabular-nums',
                size === 'lg' ? 'text-[58px]' : 'text-[44px]',
              )}
              style={{
                background: accent,
                color: isDarkHex(accent) ? '#FFFFFF' : '#111111',
              }}
            >
              {headline}
            </span>
            {preview.subline && (
              <p
                className={cn(
                  'mt-2 line-clamp-2 font-sans font-semibold',
                  size === 'lg' ? 'text-[16px]' : 'text-[13px]',
                )}
              >
                {preview.subline}
              </p>
            )}
          </div>
        ) : kind === 'versus' && preview.items && preview.items.length >= 2 ? (
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-lg p-2.5" style={{ background: subtleBg }}>
              <span className="block font-mono text-[9px] uppercase" style={{ color: muted }}>
                A
              </span>
              <span className="mt-0.5 line-clamp-2 block font-sans text-[12px] font-bold">
                {preview.items[0]}
              </span>
            </div>
            <div
              className="rounded-lg p-2.5"
              style={{
                background: accent,
                color: isDarkHex(accent) ? '#FFFFFF' : '#111111',
              }}
            >
              <span className="block font-mono text-[9px] uppercase opacity-75">B</span>
              <span className="mt-0.5 line-clamp-2 block font-sans text-[12px] font-bold">
                {preview.items[1]}
              </span>
            </div>
          </div>
        ) : kind === 'chart-story' ? (
          <div>
            <p className="line-clamp-1 font-sans text-[14px] font-bold">{headline}</p>
            <div className="mt-2.5 flex h-12 items-end gap-2">
              {[42, 68, 54, 100].map((h, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <span
                    className="w-full rounded-t"
                    style={{
                      height: `${Math.round((h / 100) * 34)}px`,
                      background: i === 3 ? accent : subtleBg,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : kind === 'list-stack' && preview.items?.length ? (
          <div className="space-y-1.5">
            {preview.items.slice(0, 3).map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 rounded-md px-2.5 py-1 font-sans text-[12px] font-medium"
                style={{ background: subtleBg }}
              >
                <span
                  className="font-mono text-[10px] font-bold tabular-nums"
                  style={{ color: accent }}
                >
                  0{idx + 1}
                </span>
                <span className="truncate">{item}</span>
              </div>
            ))}
          </div>
        ) : kind === 'timeline' && preview.items?.length ? (
          <div>
            <p className="line-clamp-1 font-sans text-[13px] font-bold">{headline}</p>
            <div className="relative mt-3 flex items-start justify-between gap-2 pt-3">
              <span
                className="absolute top-[5px] right-2 left-2 h-[2px]"
                style={{ background: accent }}
              />
              {preview.items.slice(0, 3).map((ev, i) => (
                <div key={i} className="relative flex min-w-0 flex-1 flex-col items-start">
                  <span
                    className="mb-1 size-2.5 rounded-full border-2"
                    style={{ background: bg, borderColor: accent }}
                  />
                  <span className="line-clamp-2 font-mono text-[10px] leading-tight">{ev}</span>
                </div>
              ))}
            </div>
          </div>
        ) : kind === 'map-zoom' ? (
          <div className="flex items-center gap-3">
            <span
              className="grid size-11 shrink-0 place-items-center rounded-full"
              style={{
                background: accent,
                color: isDarkHex(accent) ? '#FFFFFF' : '#111111',
              }}
            >
              <MapPin className="size-5" strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <p
                className={cn(
                  'line-clamp-2 font-sans leading-tight font-bold',
                  size === 'lg' ? 'text-[22px]' : 'text-[16px]',
                )}
              >
                {headline}
              </p>
              {preview.subline && (
                <p className="mt-0.5 line-clamp-1 text-[11px]" style={{ color: muted }}>
                  {preview.subline}
                </p>
              )}
            </div>
          </div>
        ) : kind === 'quote' ? (
          <div className="border-l-[3px] pl-3" style={{ borderColor: accent }}>
            <p
              className={cn(
                'line-clamp-3 font-serif italic leading-snug',
                size === 'lg' ? 'text-[18px]' : 'text-[14px]',
              )}
            >
              “{headline}”
            </p>
            {preview.subline && (
              <p className="mt-1 font-mono text-[10px]" style={{ color: muted }}>
                — {preview.subline}
              </p>
            )}
          </div>
        ) : (
          <div>
            <p
              className={cn(
                'line-clamp-2 font-sans leading-[1.15] font-extrabold tracking-[-0.02em]',
                size === 'lg' ? 'text-[24px]' : 'text-[17px]',
              )}
            >
              {headline}
            </p>
            {preview.subline && preview.subline !== headline ? (
              <p className="mt-1.5 line-clamp-1 font-sans text-[12px]" style={{ color: muted }}>
                {preview.subline}
              </p>
            ) : preview.excerpt && preview.excerpt !== headline ? (
              <p className="mt-1.5 line-clamp-1 font-mono text-[11px]" style={{ color: muted }}>
                “{preview.excerpt}”
              </p>
            ) : null}
          </div>
        )}
      </div>

      {/* Subtle voice waveform footer */}
      <div className="flex h-3.5 items-end gap-[3px] opacity-65">
        {bars.map((h, i) => (
          <span
            key={i}
            className="flex-1 rounded-full"
            style={{
              height: `${h}%`,
              background: i < 7 ? accent : muted,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** One storyboard tick per slot: a filled box when its graphic is ready, dashed while waiting. */
export function SlotTicks({
  states,
  size = 'sm',
  className,
}: {
  states: readonly ('ready' | 'pending')[];
  size?: 'sm' | 'lg';
  className?: string;
}) {
  const ready = states.filter((s) => s === 'ready').length;
  const box =
    size === 'lg' ? 'h-[18px] w-[26px] rounded-[4px]' : 'h-[10px] w-[14px] rounded-[2.5px]';
  return (
    <span
      role="img"
      aria-label={`${ready} of ${states.length} graphics ready`}
      className={cn(
        'inline-flex flex-wrap items-center',
        size === 'lg' ? 'gap-1.5' : 'gap-1',
        className,
      )}
    >
      {states.map((s, i) => (
        <span
          key={i}
          className={cn(
            box,
            'border-2 border-ink',
            s === 'ready' ? 'bg-ink' : 'border-dashed bg-transparent',
          )}
        />
      ))}
    </span>
  );
}
