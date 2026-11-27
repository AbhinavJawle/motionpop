// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only removal of happy-dom WAAPI
delete (Element.prototype as any).animate;

const h = vi.hoisted(() => ({
  status: {
    availability: 'available' as
      | 'checking'
      | 'available'
      | 'downloadable'
      | 'downloading'
      | 'unavailable',
    setupActive: false,
    setupProgress: null as number | null,
    online: true,
    setupError: null as string | null,
  },
  preferOnDevice: true,
}));

vi.mock('@/lib/ai/ai-status', () => ({
  useAIStatus: () => h.status,
}));
vi.mock('@/lib/settings/use-prefer-on-device', () => ({
  usePreferOnDevice: () => ({ preferOnDevice: h.preferOnDevice, loaded: true, save: vi.fn() }),
}));

import { GeminiNanoStatus, resolveNanoLamp } from './gemini-nano-status';

beforeEach(() => {
  h.status = {
    availability: 'available',
    setupActive: false,
    setupProgress: null,
    online: true,
    setupError: null,
  };
  h.preferOnDevice = true;
});
afterEach(cleanup);

describe('resolveNanoLamp', () => {
  it('turns green (on) when Gemini Nano is available and preferOnDevice is enabled', () => {
    const view = resolveNanoLamp({
      availability: 'available',
      preferOnDevice: true,
      setupActive: false,
      setupProgress: null,
    });
    expect(view.state).toBe('on');
    expect(view.label).toBe('On-Device');
    expect(view.statusWord).toBe('Ready');
  });

  it('turns red (off) when unavailable, downloadable, passive downloading, or paused in settings', () => {
    for (const input of [
      { availability: 'unavailable' as const, preferOnDevice: true, setupActive: false },
      { availability: 'downloadable' as const, preferOnDevice: true, setupActive: false },
      { availability: 'downloading' as const, preferOnDevice: true, setupActive: false },
      { availability: 'available' as const, preferOnDevice: false, setupActive: false },
    ]) {
      const view = resolveNanoLamp({ ...input, setupProgress: null });
      expect(view.state).toBe('off');
      expect(view.statusWord).toBe('Off');
    }
  });

  it('shows downloading progress only when setupActive is true and clamps out-of-range values', () => {
    const view = resolveNanoLamp({
      availability: 'downloading',
      preferOnDevice: true,
      setupActive: true,
      setupProgress: 0.64,
    });
    expect(view.state).toBe('downloading');
    expect(view.label).toBe('On-Device · 64%');

    expect(
      resolveNanoLamp({
        availability: 'downloading',
        preferOnDevice: true,
        setupActive: true,
        setupProgress: Number.NaN,
      }).label,
    ).toBe('On-Device · 0%');

    expect(
      resolveNanoLamp({
        availability: 'downloading',
        preferOnDevice: true,
        setupActive: true,
        setupProgress: 1.5,
      }).label,
    ).toBe('On-Device · 100%');
  });
});

describe('GeminiNanoStatus', () => {
  it('renders a light-surface green On-Device link on dashboard without inverted text-white classes', () => {
    render(<GeminiNanoStatus variant="dashboard" />);
    const pill = screen.getByTestId('gemini-nano-status');
    expect(pill.getAttribute('data-nano-state')).toBe('on');
    expect(pill.getAttribute('href')).toBe('/settings#ai');
    expect(pill.className).not.toContain('text-white');
    expect(pill.className).toContain('bg-[#ecfdf5]');
    expect(pill.textContent).toContain('On-Device');
    expect(pill.textContent).toContain('Gemini Nano');
  });

  it('renders a red On-Device button that opens AI settings in editor variant when unavailable', () => {
    h.status.availability = 'unavailable';
    const onOpenSettings = vi.fn();
    render(<GeminiNanoStatus variant="editor" onOpenSettings={onOpenSettings} />);
    const pill = screen.getByTestId('gemini-nano-status');
    expect(pill.getAttribute('data-nano-state')).toBe('off');
    expect(pill.getAttribute('aria-label')).toBe('Gemini Nano on-device AI: Off');
    fireEvent.click(pill);
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });
});
