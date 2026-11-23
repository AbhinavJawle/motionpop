// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorTheme } from './theme';

describe('editor theme (spec 38 R5)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useEditorTheme.setState({ theme: 'dark' });
  });

  it('starts dark when nothing is saved', () => {
    useEditorTheme.getState().hydrate();
    expect(useEditorTheme.getState().theme).toBe('dark');
  });

  it('toggles, remembers the choice and eases the switch', () => {
    useEditorTheme.getState().toggle();
    expect(useEditorTheme.getState().theme).toBe('light');
    expect(document.documentElement.classList.contains('theme-easing')).toBe(true);
    useEditorTheme.setState({ theme: 'dark' });
    useEditorTheme.getState().hydrate();
    expect(useEditorTheme.getState().theme).toBe('light');
  });
});
