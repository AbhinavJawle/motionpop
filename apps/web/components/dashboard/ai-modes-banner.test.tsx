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
}));

vi.mock('@/lib/ai/ai-status', () => ({
  useAIStatus: () => h.status,
  cancelSetUp: h.cancel,
}));
vi.mock('@/lib/ai/byok', () => ({
  useByok: () => h.byok,
}));

import { AiModesBanner } from './ai-modes-banner';

beforeEach(() => {
  h.status = { availability: 'available', setupActive: false, setupProgress: null };
  h.byok = { active: false, maskedKey: null, modelMode: 'balanced' };
  h.cancel.mockClear();
});
afterEach(cleanup);

describe('AiModesBanner (Dashboard top bar)', () => {
  it('shows Local on-device AI when ready alongside BYOK links', () => {
    render(<AiModesBanner />);
    expect(screen.getByText('Local on-device AI')).toBeTruthy();
    expect(screen.getByText('Ready · 0 cr')).toBeTruthy();
    expect(screen.getByText('Cloud AI · BYOK')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Add Gemini API key/i }).getAttribute('href')).toBe(
      '/settings#byok',
    );
    expect(screen.getByRole('link', { name: 'AI settings' }).getAttribute('href')).toBe(
      '/settings#ai',
    );
  });

  it('hides Gemini Nano download/setup UI on the dashboard when not yet set up or passively downloading', () => {
    h.status = { availability: 'downloadable', setupActive: false, setupProgress: null };
    h.byok = { active: true, maskedKey: 'AIza••••7890', modelMode: 'balanced' };
    const { unmount } = render(<AiModesBanner />);

    expect(screen.queryByText('Local on-device AI')).toBeNull();
    expect(screen.queryByRole('button', { name: /Set up Gemini Nano/i })).toBeNull();
    expect(screen.getByText('BYOK active · AIza••••7890')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'AI settings' }).getAttribute('href')).toBe(
      '/settings#ai',
    );
    unmount();

    // Passive Chrome 'downloading' without setupActive must also stay hidden on the dashboard.
    h.status = { availability: 'downloading', setupActive: false, setupProgress: null };
    render(<AiModesBanner />);
    expect(screen.queryByText('Local on-device AI')).toBeNull();
    expect(screen.queryByText(/Downloading/)).toBeNull();
  });

  it('shows downloading progress on the dashboard only when explicitly started from Settings', () => {
    h.status = { availability: 'downloading', setupActive: true, setupProgress: 0.42 };
    render(<AiModesBanner />);
    expect(screen.getByText('Local on-device AI')).toBeTruthy();
    expect(screen.getByText('Downloading · 42%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.cancel).toHaveBeenCalledOnce();
  });
});
