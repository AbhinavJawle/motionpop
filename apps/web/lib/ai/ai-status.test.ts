import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ firebase: true, init: vi.fn() }));
vi.mock('../firebase/client', () => ({
  firebaseEnabled: () => h.firebase,
  getAILogic: () => Promise.resolve({}),
}));
vi.mock('firebase/ai', () => ({
  InferenceMode: { ONLY_ON_DEVICE: 'only_on_device' },
  getGenerativeModel: () => ({ initializeDeviceModel: h.init }),
}));

import {
  detectAvailability,
  mapAvailability,
  setUpOnDevice,
  useAIStatusStore,
  watchConnection,
} from './ai-status';

const reset = () =>
  useAIStatusStore.setState({
    availability: 'checking',
    setupActive: false,
    setupProgress: null,
    detected: false,
    setupError: null,
  });
beforeEach(() => {
  reset();
  h.firebase = true;
  h.init.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('on-device status', () => {
  it('maps the Prompt API answers, anything else is unavailable', () => {
    expect(mapAvailability('available')).toBe('available');
    expect(mapAvailability('downloadable')).toBe('downloadable');
    expect(mapAvailability('downloading')).toBe('downloading');
    expect(mapAvailability('unavailable')).toBe('unavailable');
    expect(mapAvailability('whatever')).toBe('unavailable');
    expect(mapAvailability(undefined)).toBe('unavailable');
  });

  it('unavailable without the Prompt API or without Firebase', async () => {
    await detectAvailability();
    expect(useAIStatusStore.getState().availability).toBe('unavailable');
    reset();
    h.firebase = false;
    vi.stubGlobal('LanguageModel', { availability: () => Promise.resolve('available') });
    await detectAvailability();
    expect(useAIStatusStore.getState().availability).toBe('unavailable');
  });

  it('reads the Prompt API with text and image inputs', async () => {
    const availability = vi.fn(() => Promise.resolve('downloadable'));
    vi.stubGlobal('LanguageModel', { availability });
    await detectAvailability();
    expect(useAIStatusStore.getState().availability).toBe('downloadable');
    expect(availability).toHaveBeenCalledWith({
      expectedInputs: [{ type: 'text' }, { type: 'image' }],
    });
  });

  it('a throwing Prompt API is unavailable', async () => {
    vi.stubGlobal('LanguageModel', { availability: () => Promise.reject(new Error('nope')) });
    await detectAvailability();
    expect(useAIStatusStore.getState().availability).toBe('unavailable');
  });

  /** A Prompt API stub: `create` reports progress through the monitor, then resolves or rejects. */
  function stubPromptApi(result: 'ok' | Error, progress: number[] = []) {
    const create = vi.fn(async (opts: { monitor?: (m: EventTarget) => void }) => {
      const target = new EventTarget();
      opts.monitor?.(target);
      for (const loaded of progress) {
        const e = new Event('downloadprogress');
        Object.assign(e, { loaded });
        target.dispatchEvent(e);
        expect(useAIStatusStore.getState()).toMatchObject({
          availability: 'downloading',
          setupProgress: loaded,
        });
      }
      if (result !== 'ok') throw result;
      return { destroy: vi.fn() };
    });
    vi.stubGlobal('LanguageModel', { create });
    return create;
  }

  it('set-up starts from "downloadable" or passive "downloading", streams progress and ends available', async () => {
    const create = stubPromptApi('ok', [0.34, 1]);
    await setUpOnDevice();
    expect(create).not.toHaveBeenCalled();
    useAIStatusStore.setState({ availability: 'downloadable', setupActive: false });
    await setUpOnDevice();
    expect(create).toHaveBeenCalledOnce();
    expect(useAIStatusStore.getState()).toMatchObject({
      availability: 'available',
      setupActive: false,
      setupProgress: null,
    });
    // Passive Chrome 'downloading' (setupActive: false) can also be completed in one go.
    useAIStatusStore.setState({ availability: 'downloading', setupActive: false });
    await setUpOnDevice();
    expect(create).toHaveBeenCalledTimes(2);
    expect(useAIStatusStore.getState()).toMatchObject({
      availability: 'available',
      setupActive: false,
      setupProgress: null,
    });
  });

  it('a failed set-up (Chrome aborts the download) goes back to "downloadable" with a reason', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    useAIStatusStore.setState({ availability: 'downloadable', setupActive: false, setupError: null });
    stubPromptApi(new DOMException('signal is aborted without reason', 'AbortError'));
    await setUpOnDevice();
    const st = useAIStatusStore.getState();
    expect(st).toMatchObject({ availability: 'downloadable', setupActive: false, setupProgress: null });
    expect(st.setupError).toMatch(/free disk space/);
  });
});

describe('fake AI (spec 09 design)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is available with the flag, and unavailable with ?device=off', async () => {
    vi.stubEnv('NEXT_PUBLIC_FAKE_AI', '1');
    await detectAvailability();
    expect(useAIStatusStore.getState().availability).toBe('available');
    reset();
    vi.stubGlobal('location', { search: '?device=off' });
    await detectAvailability();
    expect(useAIStatusStore.getState().availability).toBe('unavailable');
  });
});

describe('connection (spec 09 R9.4)', () => {
  function fakeWindow(onLine: boolean) {
    const handlers = new Map<string, Set<() => void>>();
    const win = {
      navigator: { onLine },
      addEventListener: (type: string, fn: () => void) => {
        handlers.set(type, (handlers.get(type) ?? new Set()).add(fn));
      },
      removeEventListener: (type: string, fn: () => void) => void handlers.get(type)?.delete(fn),
      fire: (type: string) => handlers.get(type)?.forEach((fn) => fn()),
      count: () => [...handlers.values()].reduce((n, s) => n + s.size, 0),
    };
    return win;
  }

  it('starts online, follows online and offline events, and stops after the cleanup', () => {
    const win = fakeWindow(true);
    const stop = watchConnection(win as never);
    expect(useAIStatusStore.getState().online).toBe(true);
    win.navigator.onLine = false;
    win.fire('offline');
    expect(useAIStatusStore.getState().online).toBe(false);
    win.navigator.onLine = true;
    win.fire('online');
    expect(useAIStatusStore.getState().online).toBe(true);
    stop();
    expect(win.count()).toBe(0);
    win.navigator.onLine = false;
    win.fire('offline');
    expect(useAIStatusStore.getState().online).toBe(true);
  });

  it('reads the current state when it starts watching', () => {
    const stop = watchConnection(fakeWindow(false) as never);
    expect(useAIStatusStore.getState().online).toBe(false);
    stop();
    useAIStatusStore.setState({ online: true });
  });
});
