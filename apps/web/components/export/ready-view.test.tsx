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

  it('displays file size, opens inline MP4 player, downloads .srt/.vtt/cover, and triggers Export another format (spec 46 R1–R2)', async () => {
    const onExportAnother = vi.fn();
    const downloadUrl = vi.fn(async () => 'https://signed.example/video.mp4');
    render(
      <ReadyView
        view={{ ...view, sizeBytes: 4_823_450 }}
        project={project}
        client={client({
          downloadUrl,
          thumbnailUrl: async () => '/api/local-renders/r1/thumb',
        })}
        onExportAnother={onExportAnother}
      />,
    );

    expect(screen.getByText('1080p · 16:9 · 18 sec · 4.6 MB')).toBeTruthy();
    expect(screen.getByTestId('publish-kit')).toBeTruthy();

    // Open inline MP4 preview player
    fireEvent.click(screen.getByTestId('ready-watch-btn'));
    const videoEl = await screen.findByTestId('ready-video-player');
    expect(videoEl.getAttribute('src')).toBe('https://signed.example/video.mp4');
    expect(downloadUrl).toHaveBeenCalledWith('r1');

    // Export another format button (9:16 & 1:1 shown when 16:9 finished)
    fireEvent.click(screen.getByRole('button', { name: '9:16' }));
    expect(onExportAnother).toHaveBeenCalledWith('9:16');
  });

  it('shows inline recovery UI if <video> playback errors and retries cleanly', async () => {
    const downloadUrl = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('https://signed.example/expired.mp4')
      .mockResolvedValueOnce('https://signed.example/fresh.mp4');
    render(<ReadyView view={view} project={project} client={client({ downloadUrl })} />);

    fireEvent.click(screen.getByTestId('ready-watch-btn'));
    const videoEl = await screen.findByTestId('ready-video-player');
    fireEvent.error(videoEl);

    expect(screen.getByRole('alert').textContent).toContain("Couldn't play this video inline");
    fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }));
    const refreshed = await screen.findByTestId('ready-video-player');
    expect(refreshed.getAttribute('src')).toBe('https://signed.example/fresh.mp4');
    expect(downloadUrl).toHaveBeenCalledTimes(2);
  });

  it('reuses a fetched blob URL when Download is clicked after Watch (no double fetch)', async () => {
    const clicked: { href: string; download: string }[] = [];
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    };
    const downloadUrl = vi.fn(async () => 'blob:http://localhost/mp4-1');
    render(<ReadyView view={view} project={project} client={client({ downloadUrl })} />);

    fireEvent.click(screen.getByTestId('ready-watch-btn'));
    await screen.findByTestId('ready-video-player');
    fireEvent.click(screen.getByRole('button', { name: 'Download video' }));
    await waitFor(() => expect(clicked.length).toBe(1));
    HTMLAnchorElement.prototype.click = orig;

    expect(downloadUrl).toHaveBeenCalledTimes(1);
    expect(clicked[0]?.href).toBe('blob:http://localhost/mp4-1');
  });

  it('disables .srt and .vtt buttons when transcript only has whitespace words', () => {
    const emptyCaptionProject = {
      ...project,
      transcript: {
        ...project.transcript,
        words: [{ i: 0, text: '   ', startMs: 0, endMs: 300, conf: 1, filler: false }],
      },
    };
    render(<ReadyView view={view} project={emptyCaptionProject} client={client()} />);
    expect(
      (screen.getByRole('button', { name: /\.srt captions/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: /\.vtt captions/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('renders .webm filename, Alpha WebM badge, and checkerboard preview for transparent renders (spec 47)', async () => {
    const downloadUrl = vi.fn(async () => 'https://signed.example/overlay.webm');
    const { container } = render(
      <ReadyView
        view={{ ...view, title: 'Overlay Graphic', transparent: true, sizeBytes: 2_097_152 }}
        project={project}
        client={client({ downloadUrl })}
      />,
    );
    expect(screen.getByText('Overlay Graphic.webm')).toBeTruthy();
    expect(screen.getByText('Alpha WebM')).toBeTruthy();
    expect(screen.getByText('1080p · 16:9 · 18 sec · 2.0 MB')).toBeTruthy();

    fireEvent.click(screen.getByTestId('ready-watch-btn'));
    const videoEl = await screen.findByTestId('ready-video-player');
    expect(videoEl.getAttribute('src')).toBe('https://signed.example/overlay.webm');
    expect(container.querySelector('[data-checkerboard="true"]')).toBeTruthy();
    expect(
      screen.getByText('Playing your final transparent WebM · alpha channel verified'),
    ).toBeTruthy();
  });
});
