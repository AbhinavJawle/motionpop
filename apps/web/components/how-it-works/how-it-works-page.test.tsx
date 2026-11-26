// @vitest-environment happy-dom
import { APP_CONFIG_DEFAULTS } from '@motionpop/schemas';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/paper/app-bar', () => ({ AppBar: () => <header data-testid="app-bar" /> }));
vi.mock('@/lib/ai/ai-status', async (orig) => {
  const actual = await orig<typeof import('@/lib/ai/ai-status')>();
  return {
    ...actual,
    detectAvailability: vi.fn(async () => undefined),
    watchConnection: vi.fn(() => () => undefined),
  };
});

import { HowItWorksPage } from './how-it-works-page';

afterEach(() => cleanup());

describe('HowItWorksPage', () => {
  it('renders the condensed Frankenstein Monster architecture, 4 upgraded diagrams, Firebase + Kiroween briefs, and filterable routing matrix', () => {
    render(<HowItWorksPage />);
    expect(
      screen.getByRole('heading', { name: /The Frankenstein Monster — 12 stitched organs/i }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: /On-device Gemini Nano first/i })).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: /Seven Firebase products\. Built for Desktop Chrome/i }),
    ).toBeTruthy();
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(4);
    expect(screen.getAllByText(new RegExp(APP_CONFIG_DEFAULTS.modelStrong)).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText(/Diagram 01 · High-Level Architecture/)).toBeTruthy();
    expect(screen.getByText(/Diagram 02 · Hybrid AI Sequence/)).toBeTruthy();
    expect(screen.getByText(/Diagram 03 · End-to-End Pipeline Sequence/)).toBeTruthy();
    expect(screen.getByText(/Diagram 04 · One Composition, Frame-Exact Parity/)).toBeTruthy();
    // Key hybrid Nano tasks, Frankenstein elements, and both hackathon signals
    expect(screen.getAllByText(/reel\.note\.local/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/pip\.quick/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/reel\.draft/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/lyria-002/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Pixabay/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Openverse/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Antigravity/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Firebase Agent Skills/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/142 Kiro CLI runs/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/motionpop-builder/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Optional Bring Your Own Key/i)).toBeTruthy();
    expect(screen.getByText(/Zero-server BYOK safety/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Connect Ollama \/ LM Studio/i }).getAttribute('href')).toBe(
      '/settings#local-llm',
    );
    expect(screen.getAllByText(/setup\.recommend/).length).toBeGreaterThan(0);

    // Interactive routing matrix filter works cleanly
    const localBtn = screen.getByRole('button', { name: /On-Device & Local/i });
    fireEvent.click(localBtn);
    expect(screen.queryByText('Export (1080p MP4 · Alpha WebM)')).toBeNull();
    expect(screen.getAllByText(/reel\.note\.local/).length).toBeGreaterThan(0);
  });
});
