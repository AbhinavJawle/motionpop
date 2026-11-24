// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock('@/components/paper/app-bar', () => ({ AppBar: () => <header data-testid="app-bar" /> }));

import { StylesGallery } from './styles-gallery';

afterEach(() => {
  cleanup();
  h.push.mockClear();
});

describe('StylesGallery', () => {
  it('categorises styles into Reel styles and Motion graphic looks and filters cleanly', () => {
    render(<StylesGallery />);
    expect(screen.getByRole('heading', { name: 'Reel styles' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Motion graphic looks' })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Reel styles/ }));
    expect(screen.getByRole('heading', { name: 'Reel styles' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Motion graphic looks' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /Motion graphic looks/ }));
    expect(screen.queryByRole('heading', { name: 'Reel styles' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Motion graphic looks' })).toBeTruthy();
  });

  it('routes reel styles with recipe+style and motion looks with style only', () => {
    render(<StylesGallery />);
    const reelButtons = screen.getAllByRole('button', { name: 'Start reel with this style' });
    fireEvent.click(reelButtons[0]!);
    expect(h.push).toHaveBeenCalledWith('/start?recipe=tech-explainer&style=mono-grid');

    h.push.mockClear();
    const motionButtons = screen.getAllByRole('button', { name: 'Start with this look' });
    fireEvent.click(motionButtons[0]!);
    expect(h.push).toHaveBeenCalledWith(expect.stringMatching(/^\/start\?style=/));
  });
});
