import { RotateCw } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Static posters (spec 11 task 12, static half): HTML/CSS recreations of the five designed
 * thumbnails in the "Try a style" frames. Every size is in container-query units of a
 * 256 px-wide design, so one poster serves the 256 px style card, the 416 px project card
 * and the 768 px Continue card. Style colours appear only inside posters (design-system.md).
 */
export type PosterKind =
  'editorial' | 'dark-money' | 'clean-minimal' | 'paper-collage' | 'neon-data';

/** Built style id → its poster. Unknown or unbuilt ids fall back to the editorial one. */
export function posterKindFor(styleId: string): PosterKind {
  if (styleId === 'paper-collage') return 'paper-collage';
  if (styleId === 'field-notes') return 'clean-minimal';
  return 'editorial';
}

/** Design px (of a 256 px-wide poster) → container units. */
const u = (px: number) => `${((px / 256) * 100).toFixed(3)}cqw`;

function Text({
  at,
  size,
  className,
  style,
  children,
}: {
  at: [number, number];
  size: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <span
      className={cn('absolute leading-[1.12] whitespace-pre-line', className)}
      style={{ left: u(at[0]), top: u(at[1]), fontSize: u(size), ...style }}
    >
      {children}
    </span>
  );
}

function Bars({
  at,
  height,
  bars,
  width,
  gap,
}: {
  at: [number, number];
  height: number;
  bars: ReadonlyArray<{ h: number; c: string }>;
  width: number;
  gap: number;
}) {
  return (
    <span
      className="absolute flex items-end"
      style={{ left: u(at[0]), top: u(at[1]), height: u(height), gap: u(gap) }}
    >
      {bars.map((b, i) => (
        <span key={i} style={{ width: u(width), height: u(b.h), background: b.c }} />
      ))}
    </span>
  );
}

const DESIGNED: Record<PosterKind, string> = {
  editorial: 'Small changes.\nBigger impact.',
  'dark-money': '$2.4M',
  'clean-minimal': 'Clarity is\neverything.',
  'paper-collage': 'Cut. Paste.',
  'neon-data': '+128%',
};

const eyebrow = 'font-medium uppercase tracking-[0.04em]';

/** Long project titles step down so they stay inside the poster. */
function fit(base: number, text: string, custom: boolean): number {
  if (!custom) return base;
  const n = text.length;
  return n <= 16 ? base : n <= 28 ? base * 0.8 : base * 0.62;
}

export function StylePoster({
  kind,
  headline,
  loop = '0:06',
  className,
}: {
  kind: PosterKind;
  /** Replaces the designed headline (a project's title on its card). */
  headline?: string;
  /** "↻ 0:06" chip; null hides it. */
  loop?: string | null;
  className?: string;
}) {
  const h = headline ?? DESIGNED[kind];
  const dark = kind === 'dark-money' || kind === 'neon-data';
  return (
    <div
      aria-hidden
      className={cn('relative overflow-hidden font-sans select-none', className)}
      style={{ containerType: 'inline-size' }}
    >
      <div className="absolute inset-0">{body(kind, h, headline !== undefined)}</div>
      {loop && (
        <span
          className={cn(
            'absolute flex items-center rounded-full font-mono',
            dark ? 'bg-[#1F2A24]/90 text-[#cfe3c4]' : 'bg-white text-[#3a3530]',
            kind === 'neon-data' && 'bg-[#2a2142]/90 text-[#ddd3ff]',
          )}
          style={{
            right: u(7),
            bottom: u(7),
            fontSize: u(5),
            gap: u(2),
            padding: `${u(2)} ${u(6)}`,
          }}
        >
          <RotateCw style={{ width: u(5), height: u(5) }} strokeWidth={2} />
          {loop}
        </span>
      )}
    </div>
  );
}

function body(kind: PosterKind, h: string, custom: boolean): ReactNode {
  switch (kind) {
    case 'editorial':
      return (
        <div className="absolute inset-0 bg-[#F1EBE1] text-[#2A2622]">
          <Text at={[13, 12]} size={5} className={cn(eyebrow, 'text-[#6d655b]')}>
            The bigger picture
          </Text>
          <Text at={[13, 29]} size={fit(16, h, custom)} className="max-w-[56%] font-semibold">
            {h}
          </Text>
          <Bars
            at={[151, 34]}
            height={70}
            width={18}
            gap={9}
            bars={[
              { h: 28, c: '#BDB2CF' },
              { h: 48, c: '#9B87C2' },
              { h: 70, c: '#FF7A3D' },
            ]}
          />
          <Text at={[13, 100]} size={4.5} className="text-[#6d655b]">
            One idea. A new perspective.
          </Text>
        </div>
      );
    case 'dark-money':
      return (
        <div className="absolute inset-0 bg-[linear-gradient(160deg,#152A1F,#0E1813)] text-[#C8F07A]">
          <Text at={[13, 12]} size={4.5} className={cn(eyebrow, 'text-[#9fb5a0]')}>
            Follow the money
          </Text>
          <Text
            at={[13, 32]}
            size={fit(custom ? 16 : 28, h, custom)}
            className="max-w-[56%] font-semibold"
          >
            {h}
          </Text>
          {!custom && (
            <Text at={[13, 67]} size={6} className="text-[#b8d98a]">
              ↑ 32.8% this quarter
            </Text>
          )}
          <Bars
            at={[134, 52]}
            height={57}
            width={3.6}
            gap={4}
            bars={[8, 12, 10, 16, 14, 21, 19, 26, 30, 28, 38, 46, 50, 57].map((v, i) => ({
              h: v,
              c: i > 10 ? '#C8F07A' : i > 7 ? '#7fb35a' : '#3D6B47',
            }))}
          />
          <span
            className="absolute bg-[#3c5a45]"
            style={{ left: u(13), top: u(110), width: u(218), height: '1px' }}
          />
          <Text at={[13, 115]} size={4} className={cn(eyebrow, 'text-[#7d917f]')}>
            A different kind of growth.
          </Text>
        </div>
      );
    case 'clean-minimal':
      return (
        <div className="absolute inset-0 bg-[#EEF1F4] text-[#1F2733]">
          <Text at={[13, 12]} size={4.5} className={cn(eyebrow, 'text-[#7a8592]')}>
            Less, but better.
          </Text>
          <Text at={[13, 34]} size={fit(17, h, custom)} className="max-w-[58%] font-medium">
            {h}
          </Text>
          <span
            className="absolute rounded-full bg-[#C9D6E3]"
            style={{ left: u(168), top: u(28), width: u(70), height: u(70) }}
          />
          <span
            className="absolute rounded-full bg-[#44709E]"
            style={{ left: u(182), top: u(42), width: u(42), height: u(42) }}
          />
          <Text at={[13, 108]} size={4.5} className="text-[#7a8592]">
            Space to let your story breathe.
          </Text>
        </div>
      );
    case 'paper-collage':
      return (
        <div className="absolute inset-0 bg-[#DCCBB0] text-[#2B241C]">
          <Text at={[13, 12]} size={4.5} className={cn(eyebrow, 'text-[#6b5a45]')}>
            A little rough around the edges
          </Text>
          <span
            className="absolute flex items-center bg-[#F4EDDB] font-medium shadow-[0_1px_2px_rgb(0_0_0/0.15)]"
            style={{
              left: u(19),
              top: u(36),
              padding: `${u(5)} ${u(10)}`,
              fontSize: u(fit(16, h, custom)),
              maxWidth: u(150),
              rotate: '-3deg',
            }}
          >
            {h}
          </span>
          <span
            className="absolute bg-[#B9BF8F]/90"
            style={{ left: u(155), top: u(30), width: u(52), height: u(11), rotate: '8deg' }}
          />
          <span
            className="absolute bg-[#E0613F] font-semibold text-[#FCEBDD]"
            style={{
              left: u(64),
              top: u(70),
              padding: `${u(4)} ${u(10)}`,
              fontSize: u(14),
              rotate: '3deg',
            }}
          >
            Make it move.
          </span>
          <Text at={[13, 113]} size={4} className={cn(eyebrow, 'text-[#6b5a45]')}>
            Unpolished. On purpose.
          </Text>
        </div>
      );
    case 'neon-data':
      return (
        <div className="absolute inset-0 bg-[linear-gradient(160deg,#211838,#130E22)] text-[#C8F35A]">
          {[30, 52, 74, 96].map((y) => (
            <span
              key={y}
              className="absolute bg-white/6"
              style={{ left: u(13), top: u(y), width: u(230), height: '1px' }}
            />
          ))}
          <Text at={[13, 12]} size={4.5} className={cn(eyebrow, 'text-[#a99bd0]')}>
            Signal / noise
          </Text>
          <Text
            at={[13, 34]}
            size={fit(custom ? 16 : 28, h, custom)}
            className="max-w-[56%] font-semibold"
          >
            {h}
          </Text>
          <Text at={[13, 69]} size={4} className={cn(eyebrow, 'text-[#d9d2ef]')}>
            Turn numbers into energy
          </Text>
          <Bars
            at={[138, 46]}
            height={62}
            width={10}
            gap={7}
            bars={[
              { h: 18, c: '#C8F35A' },
              { h: 30, c: '#9B7BFF' },
              { h: 26, c: '#C8F35A' },
              { h: 52, c: '#9B7BFF' },
              { h: 38, c: '#C8F35A' },
              { h: 62, c: '#9B7BFF' },
            ]}
          />
          <Text at={[13, 113]} size={4} className={cn(eyebrow, 'text-[#8f84b3]')}>
            Data that doesn&apos;t sit still.
          </Text>
        </div>
      );
  }
}
