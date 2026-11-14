// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Pip } from './pip';
import { PIP_PROPS, PIP_STATES, STATES } from './states';

// happy-dom's Web Animations stub rejects on cancel; without `animate` motion uses its JS driver.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only removal of a DOM API
delete (Element.prototype as any).animate;

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Pip states and props (R3.2)', () => {
  for (const state of PIP_STATES) {
    it(`renders "${state}" bare and with every prop`, () => {
      mockReducedMotion(false);
      const bare = render(<Pip state={state} seed={1} />);
      const root = bare.container.querySelector('[data-pip-state]');
      expect(root?.getAttribute('data-pip-state')).toBe(state);
      expect(root?.getAttribute('role')).toBe('img');
      expect(root?.getAttribute('aria-label')).toBe(STATES[state].label);
      bare.unmount();

      for (const prop of PIP_PROPS) {
        const { container, unmount } = render(<Pip state={state} props={[prop]} seed={1} />);
        const el = container.querySelector('[data-pip-state]');
        expect(el?.getAttribute('data-pip-state')).toBe(state);
        expect(el?.getAttribute('aria-label')).toBe(STATES[state].label);
        unmount();
      }

      const all = render(<Pip state={state} props={PIP_PROPS} seed={1} />);
      expect(all.container.querySelector('[data-pip-state]')?.getAttribute('aria-label')).toBe(
        STATES[state].label,
      );
    });
  }

  it('decorative Pip is aria-hidden with no role or label', () => {
    mockReducedMotion(false);
    for (const state of PIP_STATES) {
      const { container, unmount } = render(<Pip state={state} decorative />);
      const el = container.querySelector('[data-pip-state]');
      expect(el?.getAttribute('aria-hidden')).toBe('true');
      expect(el?.hasAttribute('role')).toBe(false);
      expect(el?.hasAttribute('aria-label')).toBe(false);
      unmount();
    }
  });
});

describe('Pip reduced motion (R2.4)', () => {
  it('draws confetti when motion is allowed', () => {
    mockReducedMotion(false);
    const { container } = render(<Pip state="celebrating" props={['confetti']} />);
    expect(container.querySelectorAll('[data-prop="confetti"] rect').length).toBeGreaterThan(0);
  });

  it('renders the static pose with no confetti rects when reduced motion is on', () => {
    mockReducedMotion(true);
    for (const state of PIP_STATES) {
      const { container, unmount } = render(<Pip state={state} props={['confetti']} />);
      expect(container.querySelector('[data-prop="confetti"]')).toBeNull();
      expect(container.querySelectorAll('rect').length).toBe(0);
      expect(container.querySelector('[data-pip-state]')?.getAttribute('data-pip-state')).toBe(
        state,
      );
      unmount();
    }
  });
});
