// @vitest-environment happy-dom
import { fixtureProject } from '@motionpop/motion/testing/project-fixture';
import { EditorProjectSchema } from '@motionpop/schemas';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  availability: 'available' as 'available' | 'unavailable',
  localLlmActive: true,
  localLlmModel: 'qwen3.5:9b' as string | null,
}));

vi.mock('@/lib/ai/ai-status', async (orig) => ({
  ...(await orig<typeof import('@/lib/ai/ai-status')>()),
  useAIStatus: () => ({
    availability: h.availability,
    setupActive: false,
    setupProgress: null,
    online: true,
    setupError: null,
  }),
}));

vi.mock('@/lib/ai/local-llm', async (orig) => ({
  ...(await orig<typeof import('@/lib/ai/local-llm')>()),
  useLocalLlm: () => ({
    active: h.localLlmActive,
    enabled: h.localLlmActive,
    preset: 'ollama' as const,
    baseUrl: 'http://localhost:11434/v1',
    model: h.localLlmModel,
    hasApiKey: false,
  }),
}));

import { editorStore } from '@/lib/stores/editor';
import { PenButton } from './preview-pane';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only removal of a DOM API
delete (Element.prototype as any).animate;

function loadReelProject() {
  const base = fixtureProject({ slots: [], durationMs: 6000 });
  editorStore.getState().load(
    EditorProjectSchema.parse({
      ...base,
      reel: {
        v: 1,
        look: 'mono',
        focus: { x: 0.5, y: 0.32 },
        captions: true,
        scenes: [
          {
            id: 'r1',
            startMs: 0,
            endMs: 6000,
            layout: 'split',
            content: { template: 'headline', title: 'Hello' },
          },
        ],
      },
    }),
  );
}

beforeEach(() => {
  h.availability = 'available';
  h.localLlmActive = true;
  h.localLlmModel = 'qwen3.5:9b';
  act(() => {
    loadReelProject();
    editorStore.getState().setNoteEngine('auto');
    editorStore.getState().setPlaying(true);
  });
});

afterEach(() => {
  cleanup();
  act(() => {
    editorStore.getState().setDrawMode(false);
    editorStore.getState().setNoteEngine('auto');
  });
});

describe('PenButton draw-a-note AI engine picker', () => {
  it('opens the Nano vs Local AI chooser when both are connected, then enters draw mode cleanly', () => {
    render(<PenButton reel />);
    const pen = screen.getByRole('button', { name: 'Draw a note' });
    fireEvent.click(pen);

    // Picker opens; drawMode waits for the user's pick.
    expect(screen.getByTestId('note-engine-picker')).toBeTruthy();
    expect(editorStore.getState().drawMode).toBe(false);

    // Pick Gemini Nano -> sets noteEngine, pauses playback, turns draw mode on.
    fireEvent.click(screen.getByTestId('note-engine-nano'));
    expect(screen.queryByTestId('note-engine-picker')).toBeNull();
    expect(editorStore.getState().noteEngine).toBe('nano');
    expect(editorStore.getState().drawMode).toBe(true);
    expect(editorStore.getState().playing).toBe(false);

    // Clicking pen again turns draw mode off immediately without reopening picker.
    fireEvent.click(pen);
    expect(editorStore.getState().drawMode).toBe(false);
    expect(screen.queryByTestId('note-engine-picker')).toBeNull();

    // Open again and pick Local AI.
    fireEvent.click(pen);
    fireEvent.click(screen.getByTestId('note-engine-local-llm'));
    expect(editorStore.getState().noteEngine).toBe('local-llm');
    expect(editorStore.getState().drawMode).toBe(true);
  });

  it('toggles draw mode directly without a picker when only one local engine is connected', () => {
    h.localLlmActive = false;
    render(<PenButton reel />);
    fireEvent.click(screen.getByRole('button', { name: 'Draw a note' }));
    expect(screen.queryByTestId('note-engine-picker')).toBeNull();
    expect(editorStore.getState().drawMode).toBe(true);
    expect(editorStore.getState().playing).toBe(false);
  });
});
