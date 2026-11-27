// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only removal of happy-dom WAAPI
delete (Element.prototype as any).animate;

const h = vi.hoisted(() => ({
  status: {
    availability: 'available',
    setupActive: false,
    setupProgress: null as number | null,
  },
  cancel: vi.fn(),
  byok: { active: false, maskedKey: null as string | null, modelMode: 'balanced' as const },
  preferOnDevice: true,
}));

vi.mock('@/lib/ai/ai-status', () => ({
  useAIStatus: () => h.status,
  cancelSetUp: h.cancel,
}));
vi.mock('@/lib/ai/byok', () => ({
  useByok: () => h.byok,
}));
vi.mock('@/lib/settings/use-prefer-on-device', () => ({
  usePreferOnDevice: () => ({ preferOnDevice: h.preferOnDevice, loaded: true, save: vi.fn() }),
}));

import { AiModesBanner } from './ai-modes-banner';

beforeEach(() => {
  h.status = { availability: 'available', setupActive: false, setupProgress: null };
  h.byok = { active: false, maskedKey: null, modelMode: 'balanced' };
  h.preferOnDevice = true;
  h.cancel.mockClear();
});
afterEach(cleanup);

describe('AiModesBanner (Dashboard top bar)', () => {
  it('shows green On-Device Gemini Nano status when ready alongside BYOK links', () => {
    render(<AiModesBanner />);
    const status = screen.getByTestId('gemini-nano-status');
    expect(status.getAttribute('data-nano-state')).toBe('on');
    expect(status.textContent).toContain('On-Device');
    expect(status.textContent).toContain('Gemini Nano');
    expect(screen.getByText(/Ready · 0 cr/)).toBeTruthy();
    expect(screen.getByText('Cloud AI · BYOK')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Add Gemini API key/i }).getAttribute('href')).toBe(
      '/settings#byok',
    );
    expect(screen.getByRole('link', { name: 'AI settings' }).getAttribute('href')).toBe(
      '/settings#ai',
    );
  });

  it('shows red On-Device status without passive download prompts when not yet set up or passively downloading', () => {
    h.status = { availability: 'downloadable', setupActive: false, setupProgress: null };
    h.byok = { active: true, maskedKey: 'AIza••••7890', modelMode: 'balanced' };
    const { unmount } = render(<AiModesBanner />);

    const status = screen.getByTestId('gemini-nano-status');
    expect(status.getAttribute('data-nano-state')).toBe('off');
    expect(status.textContent).toContain('On-Device');
    expect(screen.queryByRole('button', { name: /Set up Gemini Nano/i })).toBeNull();
    expect(screen.getByText('BYOK active · AIza••••7890')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'AI settings' }).getAttribute('href')).toBe(
      '/settings#ai',
    );
    unmount();

    // Passive Chrome 'downloading' without setupActive must also show red 'off' with no download prompt.
    h.status = { availability: 'downloading', setupActive: false, setupProgress: null };
    render(<AiModesBanner />);
    expect(screen.getByTestId('gemini-nano-status').getAttribute('data-nano-state')).toBe('off');
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('shows downloading progress and cancel button on the dashboard when explicitly started from Settings', () => {
    h.status = { availability: 'downloading', setupActive: true, setupProgress: 0.42 };
    render(<AiModesBanner />);
    const status = screen.getByTestId('gemini-nano-status');
    expect(status.getAttribute('data-nano-state')).toBe('downloading');
    expect(status.textContent).toContain('On-Device · 42%');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.cancel).toHaveBeenCalledOnce();
  });
});
