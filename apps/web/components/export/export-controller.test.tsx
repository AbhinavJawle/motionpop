// @vitest-environment happy-dom
import { APP_CONFIG_DEFAULTS } from '@motionpop/schemas';
import { bigNumberSlot, fixtureProject } from '@motionpop/motion/testing/project-fixture';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  RenderClient,
  RenderView,
  StartInput,
  StartResult,
} from '@/lib/renders/render-client';
import { exportStore } from '@/lib/renders/export-store';
import { editorStore } from '@/lib/stores/editor';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only removal of a DOM API
delete (Element.prototype as any).animate;

const toastSpy = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ toast: toastSpy }));
vi.mock('./video-still', () => ({
  VideoStill: () => <div data-testid="video-still" />,
  fitBox: () => ({ width: 1, height: 1 }),
}));
vi.mock('@/lib/renders/voice-upload', async (orig) => ({
  ...(await orig<typeof import('@/lib/renders/voice-upload')>()),
  resolveVoiceBlob: async () => new Blob(['x'], { type: 'audio/wav' }),
}));

interface Fake {
  client: RenderClient;
  start: ReturnType<typeof vi.fn<(i: StartInput) => Promise<StartResult>>>;
  push: (v: Partial<RenderView>) => void;
}
const fake = vi.hoisted(() => ({ current: null as unknown }));
const hookState = vi.hoisted(() => ({
  mode: 'offline' as 'offline' | 'cloud',
  balance: null as number | null,
}));

vi.mock('@/lib/renders/hooks', async (orig) => {
  const actual = await orig<typeof import('@/lib/renders/hooks')>();
  return {
    ...actual,
    useRenderClient: () => (fake.current as Fake).client,
    useAppConfig: () => APP_CONFIG_DEFAULTS,
    useCreditBalance: () => hookState.balance,
    useOnline: () => true,
    useActiveRender: () => null,
  };
});
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    status: hookState.mode === 'cloud' ? 'signed-in' : 'local',
    user: { uid: 'u1' },
  }),
}));

import { ExportController } from './export-controller';

const view = (over: Partial<RenderView> = {}): RenderView => ({
  renderId: 'r1',
  status: 'queued',
  progress: 0,
  costCredits: 0,
  title: 'Fixture',
  format: '16:9',
  resolution: '1080p',
  durationMs: 18_000,
  ...over,
});

function makeFake(mode: 'offline' | 'cloud'): Fake {
  let push: (v: RenderView) => void = () => {};
  const start = vi.fn<(i: StartInput) => Promise<StartResult>>(async () => ({
    ok: true,
    replay: false,
    renderId: 'r1',
    costCredits: mode === 'cloud' ? 5 : 0,
    balanceAfter: 0,
  }));
  const client = {
    mode,
    start,
    watch: (_id: string, on: (v: RenderView) => void) => {
      push = on;
      return () => {};
    },
    check: async () => null,
    downloadUrl: async () => '/x',
    share: async () => null,
    thumbnailUrl: async () => null,
  } as unknown as RenderClient;
  return { client, start, push: (v) => push(view(v)) };
}

function setup(mode: 'offline' | 'cloud' = 'offline') {
  hookState.mode = mode;
  hookState.balance = mode === 'cloud' ? 120 : null;
  const f = makeFake(mode);
  fake.current = f;
  editorStore.getState().load(fixtureProject({ slots: [bigNumberSlot('s1', 0, 3000)] }));
  exportStore.setState({
    open: false,
    starting: false,
    renderId: null,
    view: null,
    options: null,
    startError: null,
    costOverride: null,
  });
  render(<ExportController />);
  return f;
}

const clickExport = () => fireEvent.click(screen.getByRole('button', { name: 'Export video' }));
const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

beforeEach(() => {
  toastSpy.success.mockClear();
  toastSpy.error.mockClear();
});
afterEach(() => cleanup());

describe('export controller: the flow of one render', () => {
  it('starts with the picked options, shows progress, then the finished render', async () => {
    const f = setup('offline');
    act(() => exportStore.getState().openFromButton());
    fireEvent.click(screen.getByRole('radio', { name: '9:16' }));
    fireEvent.click(screen.getByRole('radio', { name: '720p' }));
    clickExport();
    await flush();
    expect(f.start).toHaveBeenCalledTimes(1);
    const input = f.start.mock.calls[0]?.[0];
    expect(input?.options).toEqual({
      format: '9:16',
      resolution: '720p',
      // Captions default to the project's setting, on for new projects (spec 12a).
      captions: true,
      // The sound bed is on by default (spec 12b).
      music: true,
    });
    expect(input?.expectedCost).toBe(0);
    expect(input?.project.id).toBe('fixture');
    // Frozen copy, not the live store object.
    expect(input?.project).not.toBe(editorStore.getState().project);
    expect(input?.requestId).toMatch(/^[0-9a-f-]{36}$/);

    expect(await screen.findByText('Warming up…')).toBeTruthy();
    act(() => f.push({ status: 'rendering', progress: 40 }));
    expect(screen.getByText('Rendering frames…')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40');
    act(() => f.push({ status: 'encoding', progress: 90 }));
    expect(screen.getByText('Encoding…')).toBeTruthy();
    // Done: no toast while the modal is open.
    act(() => f.push({ status: 'done', progress: 100 }));
    expect(toastSpy.success).not.toHaveBeenCalled();
    // The ready dialog replaces the export dialog.
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Your video is ready' }),
    ).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Your video is ready' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download video' })).toBeTruthy();
  });

  it('shows the error state with the code\'s message, and "Try again" sends a new request', async () => {
    const f = setup('cloud');
    act(() => exportStore.getState().openFromButton());
    clickExport();
    await flush();
    expect(f.start.mock.calls[0]?.[0].expectedCost).toBe(5);
    act(() => f.push({ status: 'rendering', progress: 20 }));
    act(() => f.push({ status: 'error', progress: 20, error: 'input-missing' }));
    expect(await screen.findByText("That one didn't make it")).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe(
      'Pip lost the voiceover on the way. Your credits are back.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await flush();
    expect(f.start).toHaveBeenCalledTimes(2);
    const [a, b] = [f.start.mock.calls[0]?.[0], f.start.mock.calls[1]?.[0]];
    expect(b?.options).toEqual(a?.options);
    expect(b?.requestId).not.toBe(a?.requestId);
  });

  it('a refused request stays on the options with the reason', async () => {
    const f = setup('cloud');
    f.start.mockResolvedValueOnce({ ok: false, error: 'daily-limit' });
    act(() => exportStore.getState().openFromButton());
    clickExport();
    await flush();
    expect(screen.getByText("That's today's exports. More tomorrow.")).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    // The button works again.
    expect(
      (screen.getByRole('button', { name: 'Export video' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('cost-changed shows the server price and sends it next time', async () => {
    const f = setup('cloud');
    f.start.mockResolvedValueOnce({
      ok: false,
      error: 'cost-changed',
      detail: { error: 'cost-changed', cost: 4 },
    });
    act(() => exportStore.getState().openFromButton());
    clickExport();
    await flush();
    expect(screen.getByText('Cost: 4 credits')).toBeTruthy();
    clickExport();
    await flush();
    expect(f.start.mock.calls[1]?.[0].expectedCost).toBe(4);
  });

  it('render-active shows the progress of the running render', async () => {
    const f = setup('cloud');
    f.start.mockResolvedValueOnce({
      ok: false,
      error: 'render-active',
      detail: { error: 'render-active', renderId: 'r9' },
    });
    act(() => exportStore.getState().openFromButton());
    clickExport();
    await flush();
    expect(exportStore.getState().renderId).toBe('r9');
    expect(await screen.findByRole('progressbar')).toBeTruthy();
  });

  it('a double click starts one request', async () => {
    const f = setup('offline');
    act(() => exportStore.getState().openFromButton());
    const button = screen.getByRole('button', { name: 'Export video' });
    fireEvent.click(button);
    fireEvent.click(button);
    await flush();
    expect(f.start).toHaveBeenCalledTimes(1);
  });
});

describe('export controller: toasts with the modal closed (R4.5, R6.2)', () => {
  it('"Your video is ready" with Open, which opens the finished render', async () => {
    const f = setup('offline');
    act(() => exportStore.getState().openFromButton());
    clickExport();
    await flush();
    act(() => f.push({ status: 'rendering', progress: 50 }));
    act(() => exportStore.getState().close());
    expect(exportStore.getState().renderId).toBe('r1'); // closing keeps the render (R4.4)
    act(() => f.push({ status: 'done', progress: 100 }));
    expect(toastSpy.success).toHaveBeenCalledTimes(1);
    const [title, opts] = toastSpy.success.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(title).toBe('Your video is ready');
    expect(opts.action.label).toBe('Open');
    act(() => opts.action.onClick());
    expect(exportStore.getState()).toMatchObject({ open: true, renderId: 'r1' });
    expect(toastSpy.success).toHaveBeenCalledTimes(1);
  });

  it('an error toast with the message and Retry, which starts a new request', async () => {
    const f = setup('cloud');
    act(() => exportStore.getState().openFromButton());
    clickExport();
    await flush();
    act(() => f.push({ status: 'rendering', progress: 10 }));
    act(() => exportStore.getState().close());
    act(() => f.push({ status: 'error', progress: 10, error: 'render-failed' }));
    expect(toastSpy.error).toHaveBeenCalledTimes(1);
    const [message, opts] = toastSpy.error.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe('Pip dropped a frame. Your credits are back.');
    expect(opts.action.label).toBe('Retry');
    await act(async () => {
      opts.action.onClick();
      await Promise.resolve();
    });
    expect(f.start).toHaveBeenCalledTimes(2);
  });

  it('no toast when the modal is open at the end', async () => {
    const f = setup('offline');
    act(() => exportStore.getState().openFromButton());
    clickExport();
    await flush();
    act(() => f.push({ status: 'rendering', progress: 50 }));
    act(() => f.push({ status: 'error', progress: 50, error: 'internal' }));
    expect(toastSpy.error).not.toHaveBeenCalled();
  });
});
