// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLocalLlmConfig, getLocalLlmConfig, isLocalLlmActive } from '@/lib/ai/local-llm';
import { LocalLlmCard } from './local-llm-card';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only removal of happy-dom WAAPI
delete (Element.prototype as any).animate;

const originalFetch = globalThis.fetch;

beforeEach(() => {
  window.localStorage.clear();
  clearLocalLlmConfig();
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

describe('LocalLlmCard', () => {
  it('switches between Ollama and LM Studio presets and detects installed models', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: 'qwen3:8b' }, { id: 'gemma3:12b' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<LocalLlmCard variant="page" />);

    const urlInput = screen.getByLabelText('Local LLM server URL') as HTMLInputElement;
    expect(urlInput.value).toBe('http://localhost:11434/v1');

    fireEvent.click(screen.getByRole('button', { name: 'LM Studio' }));
    expect(urlInput.value).toBe('http://localhost:1234/v1');

    fireEvent.click(screen.getByRole('button', { name: 'Ollama' }));
    expect(urlInput.value).toBe('http://localhost:11434/v1');

    fireEvent.click(screen.getByRole('button', { name: /Detect models/i }));

    await waitFor(() => {
      expect(screen.getByText(/2 models detected/i)).toBeTruthy();
    });

    const select = screen.getByLabelText('Local LLM model') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(select.value).toBe('gemma3:12b');
  });

  it('saves, enables, pauses, and removes a verified local model cleanly', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'qwen3:8b' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<LocalLlmCard variant="page" />);

    fireEvent.change(screen.getByLabelText('Local LLM model'), {
      target: { value: 'qwen3:8b' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save & enable/i }));

    await waitFor(() => {
      expect(isLocalLlmActive()).toBe(true);
      expect(screen.getByTestId('local-llm-status-badge').textContent).toBe('Active · 0 credits');
    });
    expect(getLocalLlmConfig()).toMatchObject({
      preset: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      model: 'qwen3:8b',
    });

    fireEvent.click(screen.getByRole('button', { name: /Pause/i }));
    expect(isLocalLlmActive()).toBe(false);
    expect(screen.getByTestId('local-llm-status-badge').textContent).toBe('Paused');

    fireEvent.click(screen.getByRole('button', { name: /Remove local LLM server/i }));
    expect(getLocalLlmConfig()).toBeNull();
    expect(screen.getByTestId('local-llm-status-badge').textContent).toBe('Optional · Full local');
  });

  it('shows concise how-to-connect steps per preset and validates model exists before saving', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: 'qwen3:8b' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<LocalLlmCard variant="page" />);

    expect(screen.getByTestId('local-llm-connect-guide').textContent).toContain('ollama pull qwen3:8b');
    fireEvent.click(screen.getByRole('button', { name: 'LM Studio' }));
    expect(screen.getByTestId('local-llm-connect-guide').textContent).toContain('Developer → Local Server');
    fireEvent.click(screen.getByRole('button', { name: 'Ollama' }));

    fireEvent.change(screen.getByLabelText('Local LLM model'), {
      target: { value: 'nonexistent:7b' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save & enable/i }));

    await waitFor(() => {
      expect(screen.getByText(/Model "nonexistent:7b" was not found/i)).toBeTruthy();
    });
    expect(isLocalLlmActive()).toBe(false);
  });

  it('shows the actionable CORS quick-fix guide when browser fetch fails', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('Failed to fetch'));

    render(<LocalLlmCard variant="panel" />);
    fireEvent.click(screen.getByRole('button', { name: /Detect models/i }));

    await waitFor(() => {
      expect(screen.getByText(/Quick connection fix:/i)).toBeTruthy();
      expect(screen.getByText(/launchctl setenv OLLAMA_ORIGINS/i)).toBeTruthy();
    });
  });
});
