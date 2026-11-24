// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only removal of a DOM API
delete (Element.prototype as any).animate;

const h = vi.hoisted(() => ({ auth: { status: 'signed-out' } as { status: string } }));
vi.mock('@/lib/auth/auth-provider', () => ({ useAuth: () => h.auth }));
// next/font is a build-time loader; the page only needs the class names.
vi.mock('./fonts', () => ({ display: { variable: '' }, hand: { variable: '' } }));

import { Landing } from './landing';

afterEach(() => cleanup());

describe('Landing', () => {
  it('signed out: every call to action goes to sign-in, then the start screen', () => {
    h.auth = { status: 'signed-out' };
    render(<Landing />);
    const ctas = screen.getAllByRole('link', { name: /Start free/ });
    expect(ctas.length).toBeGreaterThanOrEqual(3);
    for (const a of ctas) expect(a.getAttribute('href')).toBe('/sign-in?next=/start');
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();
    // Pip's sign-up button opens the page and closes it (spec 34).
    const signups = screen.getAllByRole('link', { name: 'Sign up & create' });
    expect(signups.length).toBe(2);
    for (const a of signups) expect(a.getAttribute('href')).toBe('/sign-in?next=/start');
  });

  it('signed in: the calls to action open the projects and Sign in is gone', () => {
    h.auth = { status: 'signed-in' };
    render(<Landing />);
    for (const a of screen.getAllByRole('link', { name: /Open (app|your projects)/ }))
      expect(a.getAttribute('href')).toBe('/dashboard');
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Sign up & create' })).toBeNull();
  });

  it('prices come from the config defaults, with on-device marked free', () => {
    h.auth = { status: 'signed-out' };
    render(<Landing />);
    // Quick edits and the export are both free.
    expect(screen.getAllByText('Free').length).toBe(2);
    expect(screen.getByText('15 credits on sign-up')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Buy credit packs' }).getAttribute('href')).toBe(
      '/pricing',
    );
    expect(screen.getAllByText(/^\d+ credits$/).length).toBe(3);
    expect(screen.getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe('/privacy');
    for (const a of screen.getAllByRole('link', { name: 'How it works' })) {
      expect(a.getAttribute('href')).toBe('/how-it-works');
    }
  });
});
