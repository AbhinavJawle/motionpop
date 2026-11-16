// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only removal of a DOM API
delete (Element.prototype as any).animate;

const h = vi.hoisted(() => ({
  auth: {
    status: 'signed-in',
    user: { uid: 'u', email: 'ada@example.com', displayName: 'Ada', photoURL: null },
  } as unknown,
  push: vi.fn(),
  signOut: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/auth/auth-provider', () => ({ useAuth: () => h.auth }));
vi.mock('@/lib/auth/actions', () => ({ signOutUser: h.signOut }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }));

import { AccountMenu } from './account-menu';

beforeEach(() => {
  h.auth = {
    status: 'signed-in',
    user: { uid: 'u', email: 'ada@example.com', displayName: 'Ada', photoURL: null },
  };
  h.push.mockClear();
  h.signOut.mockClear();
});
afterEach(cleanup);

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));

describe('AccountMenu', () => {
  it('opens a menu with the name, Settings and Sign out', () => {
    render(<AccountMenu />);
    expect(screen.getByRole('button', { name: 'Account menu' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
    open();
    expect(screen.getByRole('menu', { name: 'Account' })).toBeTruthy();
    expect(screen.getByText('Ada')).toBeTruthy();
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Settings',
      'Sign out',
    ]);
    // Focus moves into the menu.
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Settings' }));
  });

  it('Settings opens the panel in place when given, else goes to /settings', () => {
    const onOpen = vi.fn();
    const { unmount } = render(<AccountMenu onOpenSettings={onOpen} />);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(h.push).not.toHaveBeenCalled();
    unmount();
    render(<AccountMenu />);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }));
    expect(h.push).toHaveBeenCalledWith('/settings');
  });

  it('Sign out signs out and goes to /sign-in', async () => {
    render(<AccountMenu />);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await vi.waitFor(() => expect(h.push).toHaveBeenCalledWith('/sign-in'));
    expect(h.signOut).toHaveBeenCalled();
  });

  it('local mode has Settings only', () => {
    h.auth = { status: 'local' };
    render(<AccountMenu />);
    open();
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Settings']);
  });

  it('arrow keys move between items and Escape closes the menu and returns focus to the avatar', () => {
    render(<AccountMenu />);
    open();
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Sign out' }));
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Settings' }));
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Account menu' }));
  });
});
