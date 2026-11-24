// @vitest-environment happy-dom
import { builtInSkills } from '@motionpop/ai';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock('@/components/paper/app-bar', () => ({ AppBar: () => <header data-testid="app-bar" /> }));

import { RecipesPage } from './recipes-page';

afterEach(() => {
  cleanup();
  h.push.mockClear();
});

describe('RecipesPage', () => {
  it('renders every built-in recipe, its skill file link, paired slot skills and custom mode', () => {
    render(<RecipesPage />);
    for (const r of builtInSkills.recipes()) {
      expect(screen.getByRole('heading', { name: r.name })).toBeTruthy();
      expect(screen.getByText(`skills/recipes/${r.id}.md`)).toBeTruthy();
    }
    expect(screen.getByRole('heading', { name: 'Describe your own' })).toBeTruthy();

    const useButtons = screen.getAllByRole('button', { name: /Use this recipe/ });
    fireEvent.click(useButtons[0]!);
    expect(h.push).toHaveBeenCalledWith('/start?recipe=tech-explainer');
  });
});
