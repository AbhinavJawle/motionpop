// @vitest-environment happy-dom
import type { ProjectSummary } from '@motionpop/schemas';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/projects/video-thumb', () => ({
  useVideoThumb: (_src: string | undefined, _at: number, initial?: string) => initial ?? null,
  useAssetThumb: (src: string | undefined) => (src?.startsWith('data:') ? src : null),
}));

import { ProjectPoster } from './project-poster';

afterEach(() => cleanup());

function baseSummary(over: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: 'p1',
    title: 'My Video',
    format: '9:16',
    styleId: 'studio-light',
    durationMs: 36_000,
    status: 'ready',
    slotCount: 4,
    readySlotCount: 4,
    slotStates: ['ready', 'ready', 'ready', 'ready'],
    graphicsGenerated: 0,
    lastOpenedAt: 200,
    createdAt: 100,
    updatedAt: 200,
    ...over,
  };
}

describe('ProjectPoster (spec 41)', () => {
  it('renders the real speaker frame and opening graphic for a talking-head reel (never static 40% look stills)', () => {
    const project = baseSummary({
      title: 'talking_head_raw_footage (360p)',
      preview: {
        kind: 'reel',
        videoSrc: 'idb:vid',
        videoPoster: 'data:image/jpeg;base64,REALFRAME',
        reelLook: 'mono',
        reelLayout: 'split',
        reelSceneCount: 18,
        heroKind: 'headline',
        kicker: 'used that replaced',
        headline: 'MY TEAM OF',
        subline: 'FIVE',
        palette: ['#FFFFFF', '#0B0B0C', '#5A57F0'],
      },
    });
    const { container } = render(<ProjectPoster project={project} size="md" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('data:image/jpeg;base64,REALFRAME');
    expect(screen.getByText('used that replaced')).toBeTruthy();
    expect(screen.getByText('MY TEAM OF')).toBeTruthy();
    expect(screen.getByText('FIVE')).toBeTruthy();
    expect(screen.getByText('18 scenes')).toBeTruthy();
    expect(container.innerHTML).not.toContain('/looks/');
  });

  it('renders a clean full-bleed video frame for compact sm thumbnails', () => {
    const project = baseSummary({
      preview: {
        kind: 'reel',
        videoSrc: 'idb:vid',
        videoPoster: 'data:image/jpeg;base64,SMALLFRAME',
        reelLook: 'mono',
        reelLayout: 'split',
        headline: 'MY TEAM OF',
      },
    });
    const { container } = render(<ProjectPoster project={project} size="sm" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('data:image/jpeg;base64,SMALLFRAME');
    expect(screen.queryByText('MY TEAM OF')).toBeNull();
  });

  it('renders actual project content for motion-graphic projects instead of /looks/*.jpg', () => {
    const project = baseSummary({
      title: 'How does the world work',
      format: '16:9',
      styleId: 'paper-collage',
      preview: {
        kind: 'motion',
        heroKind: 'hook-statement',
        kicker: 'EXPLAINER',
        headline: 'How does the world work?',
        palette: ['#F2E8D5', '#1B1917', '#E05A47'],
      },
    });
    const { container } = render(<ProjectPoster project={project} size="md" />);
    expect(screen.getByText('How does the world work?')).toBeTruthy();
    expect(screen.getByText('EXPLAINER')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain('40%');
  });
});
