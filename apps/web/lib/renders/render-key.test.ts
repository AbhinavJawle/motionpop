import { describe, expect, it } from 'vitest';
import type { RenderOptions } from '@motionpop/schemas';
import { demoProject } from '@/lib/projects/fixture';
import { RUNTIME_VERSION, renderKeyOf } from './render-key';

// Spec 13b follow-up (Kiro run 20): an export made by another composition runtime must not be reused.

const options: RenderOptions = {
  format: '16:9',
  resolution: '1080p',
  captions: false,
  music: false,
};
const input = (runtimeVersion?: string) => ({
  project: demoProject(),
  options,
  voicePath: 'voice/v1.mp3',
  ...(runtimeVersion !== undefined ? { runtimeVersion } : {}),
});

describe('renderKeyOf', () => {
  it('is the same for the same project, options, voice and runtime', () => {
    expect(renderKeyOf(input())).toBe(renderKeyOf(input()));
    expect(renderKeyOf(input(RUNTIME_VERSION))).toBe(renderKeyOf(input()));
  });

  it('changes when the composition runtime version changes', () => {
    expect(renderKeyOf(input('07c-engine-v2'))).not.toBe(renderKeyOf(input('07b-film-mode')));
    expect(renderKeyOf(input('07c-engine-v2'))).not.toBe(renderKeyOf(input('other')));
  });

  it('defaults to the current RUNTIME_VERSION', () => {
    expect(renderKeyOf(input())).toBe(renderKeyOf(input(RUNTIME_VERSION)));
    expect(renderKeyOf(input())).not.toBe(renderKeyOf(input('not-the-runtime')));
  });
});
