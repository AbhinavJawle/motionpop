// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { takesSpace } from './use-editor-keys';

const el = (html: string): HTMLElement => {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.firstElementChild as HTMLElement;
};

describe('takesSpace', () => {
  it('a button or a switch keeps Space, so a keyboard user can press it', () => {
    expect(takesSpace(el('<button>More</button>'))).toBe(true);
    expect(takesSpace(el('<div role="switch"></div>'))).toBe(true);
    expect(takesSpace(el('<div role="menuitem"></div>'))).toBe(true);
  });
  it('the page, a slot card and non-interactive elements leave Space to play/pause', () => {
    expect(takesSpace(document.body)).toBe(false);
    expect(takesSpace(el('<div></div>'))).toBe(false);
    expect(takesSpace(el('<div data-slot-id="s" role="button"></div>'))).toBe(false);
    expect(takesSpace(null)).toBe(false);
  });
});
