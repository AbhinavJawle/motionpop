import { describe, expect, it } from 'vitest';
import { illustrationPrompt, logoSlugs, splitLogoQuery } from './media-query';

describe('media queries', () => {
  it('derives icon-set slugs from spoken names and domain hints', () => {
    expect(logoSlugs('Three.js')[0]).toBe('threedotjs');
    expect(logoSlugs('Framer Motion')).toContain('framer');
    expect(logoSlugs('Acme|acme.test')).toContain('acme');
    expect(logoSlugs('https://www.example.com/x')[0]).toBe('example');
    expect(splitLogoQuery('Acme|acme.test')).toEqual({ name: 'Acme', domain: 'acme.test' });
  });

  it('asks for an illustration on plain paper with no text', () => {
    const p = illustrationPrompt('cream', 'a half-built bridge');
    expect(p).toContain('a half-built bridge');
    expect(p).toMatch(/No text/);
  });
});
