// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  push: vi.fn(),
  auth: { status: 'signed-in' } as { status: string },
  balance: 20 as number | null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.push }),
}));
vi.mock('@/lib/auth/auth-provider', () => ({ useAuth: () => h.auth }));
vi.mock('@/lib/credits/use-credits-client', () => ({ useCreditsBalance: () => h.balance }));
vi.mock('@/components/settings/account-menu', () => ({
  AccountMenu: () => <button type="button">Account</button>,
}));

import { AppBar } from './app-bar';
import { ProjectTopBar } from '@/components/start/project-top-bar';

afterEach(() => {
  cleanup();
  h.push.mockClear();
  h.auth = { status: 'signed-in' };
});

describe('AppBar', () => {
  it('shows all five tabs when signed in and marks the active tab', () => {
    render(<AppBar active="recipes" />);
    const links = [
      ['Projects', '/dashboard'],
      ['Styles', '/styles'],
      ['Recipes', '/recipes'],
      ['Skills', '/skills'],
      ['How it works', '/how-it-works'],
    ] as const;
    for (const [name, href] of links) {
      const el = screen.getByRole('link', { name });
      expect(el.getAttribute('href')).toBe(href);
    }
    expect(screen.getByRole('link', { name: 'Recipes' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'motionpop home' }).getAttribute('href')).toBe(
      '/dashboard',
    );
  });

  it('shows only How it works and Sign in when signed out, with logo pointing to /', () => {
    h.auth = { status: 'signed-out' };
    render(<AppBar active="how" />);
    expect(screen.getByRole('link', { name: 'How it works' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/sign-in');
    expect(screen.queryByRole('link', { name: 'Projects' })).toBeNull();
    expect(screen.getByRole('link', { name: 'motionpop home' }).getAttribute('href')).toBe('/');
  });
});

describe('ProjectTopBar', () => {
  it('keeps the black film-strip AppBar on top plus the draft controls sub-bar', () => {
    render(<ProjectTopBar />);
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Recipes' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Skills' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'How it works' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Home/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Help' })).toBeTruthy();
  });
});
