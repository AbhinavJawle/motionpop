// @vitest-environment happy-dom
import { sanitizeFilename } from '@motionpop/schemas';
import { bigNumberSlot, fixtureProject } from '@motionpop/motion/testing/project-fixture';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderClient, RenderView } from '@/lib/renders/render-client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only removal of a DOM API
delete (Element.prototype as any).animate;

const toastSpy = vi.hoisted(() => {
  const t = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return t;
});
vi.mock('@/components/ui/toast', () => ({ toast: toastSpy }));
vi.mock('./video-still', () => ({ VideoStill: () => <div data-testid="video-still" /> }));

import { ReadyView } from './ready-view';

const view: RenderView = {
  renderId: 'r1',
  status: 'done',
  progress: 100,
  costCredits: 5,
  title: 'Untitled Project',
  format: '16:9',
  resolution: '1080p',
  durationMs: 18_000,
};
const project = fixtureProject({ slots: [bigNumberSlot('s1', 0, 3000)] });

function client(over: Partial<RenderClient> = {}): RenderClient {
  return {
    mode: 'cloud',
    start: async () => ({ ok: false, error: 'network' }),
    watch: () => () => {},
    check: async () => null,
    downloadUrl: async () => 'https://signed.example/video.mp4',
    share: async () => 'https://app.example/share/abc',
    thumbnailUrl: async () => null,
    ...over,
  } as RenderClient;
}

function mockMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }));
}

beforeEach(() => {
  toastSpy.mockClear();
  toastSpy.success.mockClear();
  toastSpy.error.mockClear();
  mockMotion(false);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ready view (R5.1–R5.3)', () => {
  it('shows the designed copy and the file card', () => {
    render(<ReadyView view={view} project={project} client={client()} />);
    expect(screen.getByText('Your video is ready')).toBeTruthy();
    expect(screen.getByText('From your voice to something worth sharing.')).toBeTruthy();
    expect(screen.getByText('Untitled Project.mp4')).toBeTruthy();
    expect(screen.getByText('1080p · 16:9 · 18 sec')).toBeTruthy();
    expect(screen.getByText('Ready to download')).toBeTruthy();
    expect(screen.getByText('Made with your voice. Finished with motionpop.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download video' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy share link' })).toBeTruthy();
  });

  it('names the file after the sanitized title', () => {
    const title = 'a/b:c*?"<>|d';
    render(<ReadyView view={{ ...view, title }} project={project} client={client()} />);
    const name = sanitizeFilename(title, 'mp4');
    expect(name).toMatch(/\.mp4$/);
    expect(name).not.toMatch(/[/\\:*?"<>|]/);
    expect(screen.getByText(name)).toBeTruthy();
  });

  it('Download asks the server for the URL and starts a download under the filename', async () => {
    const clicked: { href: string; download: string }[] = [];
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    };
    const downloadUrl = vi.fn(async () => 'https://signed.example/video.mp4');
    render(<ReadyView view={view} project={project} client={client({ downloadUrl })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download video' }));
    await waitFor(() => expect(clicked.length).toBe(1));
    HTMLAnchorElement.prototype.click = orig;
    expect(downloadUrl).toHaveBeenCalledWith('r1');
    expect(clicked[0]).toEqual({
      href: 'https://signed.example/video.mp4',
      download: 'Untitled Project.mp4',
    });
  });

  it('a failed download says so', async () => {
    render(
      <ReadyView
        view={view}
        project={project}
        client={client({
          downloadUrl: async () => {
            throw new Error('nope');
          },
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Download video' }));
    await waitFor(() => expect(toastSpy.error).toHaveBeenCalled());
  });

  it('Copy share link copies the URL and shows "Link copied"', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const share = vi.fn(async () => 'https://app.example/share/abc');
    render(<ReadyView view={view} project={project} client={client({ share })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }));
    await waitFor(() => expect(toastSpy.success).toHaveBeenCalledWith('Link copied'));
    expect(share).toHaveBeenCalledWith('r1');
    expect(writeText).toHaveBeenCalledWith('https://app.example/share/abc');
  });

  it('shows the link in a toast when the clipboard is refused', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: {
        writeText: async () => {
          throw new Error('denied');
        },
      },
    });
    render(<ReadyView view={view} project={project} client={client()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }));
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith('Copy this link: https://app.example/share/abc'),
    );
  });

  it('offline mode has no share links and says so', async () => {
    render(
      <ReadyView view={view} project={project} client={client({ share: async () => null })} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }));
    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    expect(toastSpy.success).not.toHaveBeenCalled();
  });

  it('uses the thumbnail of the render when there is one', async () => {
    render(
      <ReadyView
        view={view}
        project={project}
        client={client({ thumbnailUrl: async () => '/api/local-renders/r1/thumb' })}
      />,
    );
    const img = await screen.findByAltText('Thumbnail of your video');
    expect(img.getAttribute('src')).toBe('/api/local-renders/r1/thumb');
  });

  it('draws the confetti, and none under reduced motion (R5.1)', () => {
    const { container, unmount } = render(
      <ReadyView view={view} project={project} client={client()} />,
    );
    expect(container.querySelectorAll('[data-confetti]').length).toBe(20);
    unmount();
    mockMotion(true);
    const still = render(<ReadyView view={view} project={project} client={client()} />);
    expect(still.container.querySelectorAll('[data-confetti]').length).toBe(0);
  });
});
