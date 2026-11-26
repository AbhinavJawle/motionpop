// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { APP_CONFIG_DEFAULTS, type EditConfig } from '@motionpop/schemas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only removal of a DOM API
delete (Element.prototype as any).animate;
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as never;
}

const h = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  submit: vi.fn<(id: string, edit: unknown) => boolean>(() => true),
  take: null as unknown,
  signedIn: true,
  balance: 100 as number | null,
}));

// A stable router, as Next's is: the screen's effect depends on it.
vi.mock('next/navigation', () => {
  const router = { replace: h.replace, push: h.push };
  return { useRouter: () => router };
});
vi.mock('@/components/start/project-top-bar', () => ({ ProjectTopBar: () => null }));
vi.mock('@/components/start/start-hero', () => ({
  StartHero: ({ headline, bubble }: { headline: string; bubble: string }) => (
    <header>
      <h1>{headline}</h1>
      <p>{bubble}</p>
    </header>
  ),
}));
vi.mock('@/lib/ai/router-client', () => ({ getRouter: () => Promise.resolve(null) }));
vi.mock('@/lib/credits/use-credits-client', () => ({
  useCreditsClient: () => ({ client: h.signedIn ? {} : null }),
  useCreditsBalance: () => h.balance,
}));
vi.mock('@/lib/renders/hooks', () => ({
  useAppConfig: () => APP_CONFIG_DEFAULTS,
  useOnline: () => true,
}));
vi.mock('@/lib/intake/pending', () => ({ takePending: () => Promise.resolve(h.take) }));
vi.mock('@/lib/pipeline/jobs-store', async (orig) => ({
  ...(await orig<typeof import('@/lib/pipeline/jobs-store')>()),
  submit: h.submit,
}));

import { isWatched, resetJobsForTest, useJobs } from '@/lib/pipeline/jobs-store';
import { ConfigureScreen } from './configure-screen';

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
const scriptTake = (speed: number, n = 200) => ({
  blob: null,
  meta: {
    source: 'tts',
    name: 'Script',
    cleanup: false,
    tts: { voiceId: 'Kore', speed, script: words(n) },
  },
  draft: { title: 'Untitled Project', format: '16:9' },
});

const loaded = () => screen.findByRole('radiogroup', { name: 'Recipe' });
const lastEdit = (): EditConfig => {
  const call = h.submit.mock.calls.at(-1) as unknown as [string, EditConfig] | undefined;
  return call![1];
};

beforeEach(() => {
  h.signedIn = true;
  h.balance = 100;
  h.take = scriptTake(1);
  h.submit.mockClear();
  h.push.mockClear();
  h.replace.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  resetJobsForTest();
});

describe('ConfigureScreen', () => {
  it('goes back to Start when nothing is pending', async () => {
    h.take = null;
    render(<ConfigureScreen />);
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/start'));
  });

  it('prices the script voice at the speed chosen on the script screen', async () => {
    // 200 words: two started minutes at the natural pace, one at 1.5x.
    h.take = scriptTake(1.5);
    render(<ConfigureScreen />);
    await loaded();
    expect(screen.getByText('Voice from script')).toBeTruthy();
    expect(screen.getByText('2 credits')).toBeTruthy();
    cleanup();
    resetJobsForTest();

    h.take = scriptTake(1);
    render(<ConfigureScreen />);
    await loaded();
    expect(screen.getByText('4 credits')).toBeTruthy();
  });

  it('blocks Create for a script when signed out', async () => {
    h.signedIn = false;
    h.balance = null;
    render(<ConfigureScreen />);
    await loaded();
    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText('Sign in to generate a voice')).toBeTruthy();
  });

  it('Create submits the choices once and opens the processing page', async () => {
    render(<ConfigureScreen />);
    await loaded();
    const create = screen.getByRole('button', { name: 'Create' });
    fireEvent.click(create);
    fireEvent.click(create);
    expect(h.submit).toHaveBeenCalledTimes(1);
    const id = Object.keys(useJobs.getState().jobs)[0]!;
    expect(h.submit.mock.calls[0]![0]).toBe(id);
    expect(h.push).toHaveBeenCalledWith(`/processing/${id}`);
    expect(lastEdit().resolved).toBeUndefined();
  });

  it('watches the job from Create until the screen unmounts (fast-pipeline toast race)', async () => {
    const { unmount } = render(<ConfigureScreen />);
    await loaded();
    const id = Object.keys(useJobs.getState().jobs)[0]!;
    expect(isWatched(id)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(isWatched(id)).toBe(true);
    unmount();
    expect(isWatched(id)).toBe(false);
  });

  it('leaving without Create drops the preparing job but not a created one', async () => {
    const first = render(<ConfigureScreen />);
    await loaded();
    expect(Object.keys(useJobs.getState().jobs)).toHaveLength(1);
    first.unmount();
    expect(Object.keys(useJobs.getState().jobs)).toHaveLength(0);
  });

  it('a job that reached Create stays when the screen unmounts', async () => {
    // The real `submit` queues the job; the mock stands in for that.
    h.submit.mockImplementationOnce((id) => {
      useJobs.setState((s) => ({
        jobs: { ...s.jobs, [id]: { ...s.jobs[id]!, status: 'queued' } },
      }));
      return true;
    });
    const { unmount } = render(<ConfigureScreen />);
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    unmount();
    expect(Object.values(useJobs.getState().jobs).map((j) => j.status)).toEqual(['queued']);
  });

  it('stays on the page when the store refuses the job', async () => {
    h.submit.mockReturnValueOnce(false);
    render(<ConfigureScreen />);
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(h.push).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  describe('describe your own', () => {
    const pickCustomRecipe = async () => {
      render(<ConfigureScreen />);
      await loaded();
      fireEvent.click(
        within(screen.getByRole('radiogroup', { name: 'Recipe' })).getByRole('radio', {
          name: /Describe your own/,
        }),
      );
      return screen.getByLabelText('Describe your recipe');
    };
    const settle = async (ms: number) => {
      await act(async () => {
        vi.advanceTimersByTime(ms);
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    };

    it('reads the words 600 ms after the field loses focus, then shows "Your style"', async () => {
      const box = await pickCustomRecipe();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      fireEvent.change(box, { target: { value: 'a gaming stream with loud memes' } });
      fireEvent.blur(box);
      await settle(599);
      expect(screen.queryByText('Your style')).toBeNull();
      await settle(1);
      expect(screen.getByText('Your style')).toBeTruthy();
      expect(screen.getByText('Free · quick match')).toBeTruthy();
      expect(screen.getAllByText('free · quick match').length).toBeGreaterThan(0);

      vi.useRealTimers();
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      const edit = lastEdit();
      expect(edit.recipeId).toBe('custom');
      expect(edit.resolved?.recipeId).toBe('gaming');
    });

    it('blurring again inside the window restarts it (one read of the latest words)', async () => {
      const box = await pickCustomRecipe();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      fireEvent.change(box, { target: { value: 'stock market money' } });
      fireEvent.blur(box);
      await settle(400);
      fireEvent.change(box, { target: { value: 'a gaming stream' } });
      fireEvent.blur(box);
      await settle(400);
      expect(screen.queryByText('Your style')).toBeNull();
      await settle(200);
      vi.useRealTimers();
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      expect(lastEdit().resolved?.recipeId).toBe('gaming');
    });

    it('Create straight from the field (not read yet) uses the instant keyword match', async () => {
      const box = await pickCustomRecipe();
      fireEvent.change(box, { target: { value: 'stock market money and finance' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      expect(lastEdit().resolved?.recipeId).toBe('finance-business');
    });

    it('words changed after the last read are read again at Create, not reused', async () => {
      const box = await pickCustomRecipe();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      fireEvent.change(box, { target: { value: 'a gaming stream' } });
      fireEvent.blur(box);
      await settle(600);
      vi.useRealTimers();
      expect(screen.getByText('Your style')).toBeTruthy();
      fireEvent.change(box, { target: { value: 'stock market money and finance' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      expect(lastEdit().resolved?.recipeId).toBe('finance-business');
    });

    it('leaving "Describe your own" for a built-in recipe drops what was resolved', async () => {
      const box = await pickCustomRecipe();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      fireEvent.change(box, { target: { value: 'a gaming stream' } });
      fireEvent.blur(box);
      await settle(600);
      vi.useRealTimers();
      fireEvent.click(
        within(screen.getByRole('radiogroup', { name: 'Recipe' })).getByRole('radio', {
          name: /Tech Explainer/,
        }),
      );
      expect(screen.queryByText('Your style')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      const edit = lastEdit();
      expect(edit.recipeId).toBe('tech-explainer');
      expect(edit.resolved).toBeUndefined();
    });

    it('an old recipe text does not steer a built-in recipe that has a described style', async () => {
      const box = await pickCustomRecipe();
      fireEvent.change(box, { target: { value: 'stock market money and finance' } });
      // back to a built-in recipe, then describe only the style
      fireEvent.click(
        within(screen.getByRole('radiogroup', { name: 'Recipe' })).getByRole('radio', {
          name: /Tech Explainer/,
        }),
      );
      fireEvent.click(
        within(screen.getByRole('radiogroup', { name: 'Style' })).getByRole('radio', {
          name: /Describe your own/,
        }),
      );
      fireEvent.change(screen.getByLabelText('Describe your style'), {
        target: { value: 'dark and neon' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      const edit = lastEdit();
      expect(edit.recipeId).toBe('tech-explainer');
      expect(edit.resolved?.recipeId).toBe('tech-explainer');
    });

    it('emptying the field clears the resolved style', async () => {
      const box = await pickCustomRecipe();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      fireEvent.change(box, { target: { value: 'a gaming stream' } });
      fireEvent.blur(box);
      await settle(600);
      expect(screen.getByText('Your style')).toBeTruthy();
      fireEvent.change(box, { target: { value: '' } });
      fireEvent.blur(box);
      await settle(600);
      expect(screen.queryByText('Your style')).toBeNull();
      vi.useRealTimers();
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      expect(lastEdit().resolved).toBeUndefined();
    });
  });

  describe('motion graphic flow', () => {
    it('auto-selects Paper Collage for Vox prompts, exposes Format & AI Cutout Visuals, and hides captions/sound', async () => {
      h.take = {
        blob: new Blob([new Uint8Array(64)], { type: 'audio/wav' }),
        meta: {
          source: 'upload',
          name: 'Motion graphic.wav',
          cleanup: false,
          single: true,
          graphicPrompt: 'design a vox style motion graphic about the white house',
        },
        draft: { title: 'Inside the White House', format: '16:9' },
      };
      render(<ConfigureScreen />);
      await loaded();
      expect(screen.getByText('Design your motion graphic.')).toBeTruthy();
      expect(screen.getByText('Motion graphic directing')).toBeTruthy();
      expect(screen.getByText('Transparent WebM export')).toBeTruthy();
      expect(screen.queryByText('Captions')).toBeNull();
      expect(screen.queryByText('Sound')).toBeNull();

      // Format switcher updates the job's format
      const formatGroup = screen.getByRole('group', { name: 'Canvas format' });
      fireEvent.click(within(formatGroup).getByRole('button', { name: /9:16/ }));
      const job = Object.values(useJobs.getState().jobs)[0];
      expect(job?.format).toBe('9:16');

      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      const edit = lastEdit();
      expect(edit.styleId).toBe('paper-collage');
      expect(edit.illustrations).toBe(true);
      expect(edit.captions.enabled).toBe(false);
      expect(edit.sound.music).toBe('none');
    });
  });

  describe('transcript auto-pick', () => {
    it('automatically pre-selects the best recipe, skill & look from the transcript and supports Reset', async () => {
      h.take = {
        blob: null,
        meta: {
          source: 'tts',
          name: 'Finance Script',
          cleanup: false,
          tts: {
            voiceId: 'Kore',
            speed: 1,
            script:
              'Nvidia revenue jumped 94% to 35 billion last quarter as stock market valuation surged.',
          },
        },
        draft: { title: 'Untitled Project', format: '16:9' },
      };
      render(<ConfigureScreen />);
      const banner = await screen.findByTestId('auto-pick-banner');
      expect(banner.textContent).toMatch(/Auto-picked from your transcript:/);
      expect(banner.textContent).toMatch(/Bloomberg Data Story/);

      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      const edit = lastEdit();
      expect(edit.recipeId).toBe('finance-business');
      expect(edit.userSkill?.id).toBe('financial-data-story');
      expect(edit.styleId).toBe('newsprint');
      expect(edit.hookStyle).toBe('stat');
    });

    it('never overwrites an explicit preset from /start?recipe= and offers a non-intrusive Apply suggestion instead', async () => {
      h.take = {
        blob: null,
        meta: {
          source: 'tts',
          name: 'Finance Script',
          cleanup: false,
          tts: {
            voiceId: 'Kore',
            speed: 1,
            script:
              'Nvidia revenue jumped 94% to 35 billion last quarter as stock market valuation surged.',
          },
        },
        draft: { title: 'Untitled Project', format: '16:9', recipeId: 'podcast-story' },
      };
      render(<ConfigureScreen />);
      const banner = await screen.findByTestId('auto-pick-banner');
      expect(banner.textContent).toMatch(/Suggested from your transcript:/);
      expect(within(banner).getByRole('button', { name: 'Apply' })).toBeTruthy();

      // Submitting before clicking Apply preserves the creator's explicit recipe.
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      expect(lastEdit().recipeId).toBe('podcast-story');
      expect(lastEdit().userSkill).toBeUndefined();
    });
  });
});
