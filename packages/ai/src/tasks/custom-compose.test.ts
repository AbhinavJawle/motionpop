import { customExample, lintCustom } from '@motionpop/motion';
import { describe, expect, it } from 'vitest';
import { createRouter, type AIProvider, type ProviderRequest, type RouterConfig } from '../router';
import { customComposeTask, type CustomComposeInput } from './custom-compose';

const CONFIG: RouterConfig = {
  routingOverrides: {},
  routingSlotsDetectDeviceMaxWords: 400,
  modelFast: 'fast',
  modelStrong: 'strong',
  modelFilmBuild: 'strong',
  killSwitch: false,
};
const ex = customExample();
const INPUT: CustomComposeInput = {
  brief: 'A three-step timeline from idea to launch',
  words: 'We went from idea to build to launch in a year',
  durationMs: 4000,
  format: '16:9',
  look: { name: 'Editorial Explainer' },
  example: { html: ex.html, css: ex.css, script: ex.script },
};
const GOOD = { title: ex.title, html: ex.html, css: ex.css, script: ex.script, keyMomentMs: 500 };

function scripted(answers: string[]): AIProvider & { calls: ProviderRequest[] } {
  const calls: ProviderRequest[] = [];
  return {
    calls,
    generate(req) {
      calls.push(req);
      const text = answers[calls.length - 1];
      if (text === undefined) return Promise.reject(new Error('unexpected call'));
      return Promise.resolve({ text, ranOn: 'cloud' as const });
    },
  };
}
const run = (answers: string[]) => {
  const provider = scripted(answers);
  const router = createRouter({ provider, config: () => CONFIG });
  return { provider, result: router.run(customComposeTask(lintCustom), INPUT) };
};

describe('custom.compose (spec 15)', () => {
  it('runs in the cloud on the strong model with the example in the prompt', async () => {
    const { provider, result } = run([JSON.stringify(GOOD)]);
    const r = await result;
    expect(r.output.title).toBe(ex.title);
    expect(r.ranOn).toBe('cloud');
    expect(r.costCredits).toBe(3);
    expect(provider.calls[0]?.model).toBe('strong');
    expect(provider.calls[0]?.prompt).toContain('return {');
  });

  it('sends lint problems back once, then accepts the fixed answer', async () => {
    const cheating = { ...GOOD, script: `const n = Date.now();\n${GOOD.script}` };
    const { provider, result } = run([JSON.stringify(cheating), JSON.stringify(GOOD)]);
    await expect(result).resolves.toMatchObject({ output: { title: ex.title } });
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1]?.prompt).toContain('clock');
  });

  it('fails after two bad answers', async () => {
    const bad = JSON.stringify({ ...GOOD, css: '.a { transition: all 1s }' });
    const { provider, result } = run([bad, bad]);
    await expect(result).rejects.toMatchObject({ reason: 'invalid-output' });
    expect(provider.calls).toHaveLength(2);
  });
});
