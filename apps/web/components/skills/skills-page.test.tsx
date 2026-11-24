// @vitest-environment happy-dom
import { builtInSkills, SKILLS } from '@motionpop/ai';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/components/paper/app-bar', () => ({ AppBar: () => <header data-testid="app-bar" /> }));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ status: 'local' }),
}));

import { SkillsPage } from './skills-page';

beforeEach(() => {
  window.localStorage.clear();
  push.mockClear();
});
afterEach(cleanup);

describe('SkillsPage', () => {
  it('shows all reel director skills and motion-graphic slot skills with category filters', () => {
    render(<SkillsPage />);
    expect(
      screen.getByRole('heading', {
        name: `Reel director skills (${builtInSkills.recipes().length})`,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: `Motion-graphic slot skills (${SKILLS.length})` }),
    ).toBeTruthy();
    expect(screen.getByText('Shocking Stat Reveal')).toBeTruthy();
    expect(screen.getByText('skills/shocking-stat-reveal.md')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Reel director skills/ }));
    expect(screen.queryByText('Shocking Stat Reveal')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /Motion-graphic slot skills/ }));
    expect(screen.getByText('Shocking Stat Reveal')).toBeTruthy();
  });

  it('lets creators import a Markdown skill, saves it, and routes to /start?skill=<id>', async () => {
    render(<SkillsPage />);
    fireEvent.click(screen.getByRole('button', { name: /Import \/ Create skill/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Load example skill' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save skill' }));

    const card = await screen.findByTestId('user-skill-blueprint-schematic-documentary');
    expect(card).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Use in new video/i }));
    expect(push).toHaveBeenCalledWith('/start?skill=blueprint-schematic-documentary');
  });
});
