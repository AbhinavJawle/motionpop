// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeSettingsPanel,
  openSettingsPanel,
  useSettingsPanel,
} from '@/lib/editor/settings-panel';
import { LeftPanel } from './left-panel';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only removal of a DOM API
delete (Element.prototype as any).animate;
afterEach(() => {
  cleanup();
  closeSettingsPanel();
});

describe('LeftPanel', () => {
  it('renders its content and a collapse chevron only while open', () => {
    const { rerender } = render(
      <LeftPanel open={false} label="Settings" onClose={() => {}}>
        <p>inside</p>
      </LeftPanel>,
    );
    expect(screen.queryByText('inside')).toBeNull();
    rerender(
      <LeftPanel open label="Settings" onClose={() => {}}>
        <p>inside</p>
      </LeftPanel>,
    );
    expect(screen.getByRole('complementary', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByText('inside')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Collapse panel' })).toBeTruthy();
  });

  it('closes with the chevron and with Escape, but leaves Escape to an open menu or dialog', () => {
    const onClose = vi.fn();
    render(
      <LeftPanel open label="Settings" onClose={onClose}>
        <p>inside</p>
      </LeftPanel>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Collapse panel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    menu.remove();
  });
});

describe('settings panel state', () => {
  it('opens at a section, asking again bumps the nonce, and closing keeps nothing open', () => {
    expect(useSettingsPanel.getState().open).toBe(false);
    act(() => openSettingsPanel('credits'));
    const a = useSettingsPanel.getState();
    expect(a).toMatchObject({ open: true, section: 'credits' });
    act(() => openSettingsPanel('credits'));
    expect(useSettingsPanel.getState().nonce).toBe(a.nonce + 1);
    act(() => openSettingsPanel());
    expect(useSettingsPanel.getState().section).toBeNull();
    act(() => closeSettingsPanel());
    expect(useSettingsPanel.getState().open).toBe(false);
  });
});
