// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only removal of happy-dom WAAPI
delete (Element.prototype as any).animate;

const h = vi.hoisted(() => ({
  status: { availability: 'available', setupProgress: null as number | null },
  setUp: vi.fn(),
  cancel: vi.fn(),
  byok: { active: false, maskedKey: null as string | null, modelMode: 'balanced' as const },
}));

vi.mock('@/lib/ai/ai-status', () => ({
  useAIStatus: () => h.status,
  setUpOnDevice: h.setUp,
  cancelSetUp: h.cancel,
}));
vi.mock('@/lib/ai/byok', () => ({
  useByok: () => h.byok,
}));

import { AiModesBanner } from './ai-modes-banner';

beforeEach(() => {
  h.status = { availability: 'available', setupProgress: null };
  h.byok = { active: false, maskedKey: null, modelMode: 'balanced' };
  h.setUp.mockClear();
  h.cancel.mockClear();
});
afterEach(cleanup);

describe('AiModesBanner (Dashboard top bar)', () => {
  it('surfaces both Local on-device AI and Cloud AI BYOK compactly with direct links', () => {
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

  it('offers Gemini Nano setup with warning modal when downloadable and shows active BYOK state', () => {
    h.status = { availability: 'downloadable', setupProgress: null };
    h.byok = { active: true, maskedKey: 'AIza••••7890', modelMode: 'balanced' };
    render(<AiModesBanner />);

    expect(screen.getByText('BYOK active · AIza••••7890')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Manage API key/i }).getAttribute('href')).toBe(
      '/settings#byok',
    );

    fireEvent.click(screen.getByRole('button', { name: /Set up Gemini Nano/i }));
    expect(h.setUp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Download model' }));
    expect(h.setUp).toHaveBeenCalledOnce();
  });
});
