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

import { detectAvailability, mapAvailability, setUpOnDevice, useAIStatusStore } from './ai-status';

const reset = () =>
  useAIStatusStore.setState({ availability: 'checking', setupProgress: null, detected: false });
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

  it('set-up only starts from "downloadable", streams progress and ends available', async () => {
    await setUpOnDevice();
    expect(h.init).not.toHaveBeenCalled();
    useAIStatusStore.setState({ availability: 'downloadable' });
    h.init.mockImplementation((cb: (p: number) => void) => {
      cb(0.34);
      expect(useAIStatusStore.getState()).toMatchObject({
        availability: 'downloading',
        setupProgress: 0.34,
      });
      return Promise.resolve();
    });
    await setUpOnDevice();
    expect(useAIStatusStore.getState()).toMatchObject({
      availability: 'available',
      setupProgress: null,
    });
  });

  it('a failed set-up goes back to "downloadable" so the button returns', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    useAIStatusStore.setState({ availability: 'downloadable' });
    h.init.mockRejectedValue(new Error('network'));
    await setUpOnDevice();
    expect(useAIStatusStore.getState()).toMatchObject({
      availability: 'downloadable',
      setupProgress: null,
    });
  });
});
