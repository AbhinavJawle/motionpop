import { readFile } from 'node:fs/promises';
import { compileProject, projectCompileInput } from '@motionpop/motion/compiler';
import { filmProject } from '@motionpop/motion/testing/project-fixture';
import { describe, expect, it } from 'vitest';
import { runRender } from './run-render';
import { FAKE_ASSETS, makeHarness } from './testing/harness';

// Spec 07b R7.1: a film exports the same composition HTML the preview compiles, tails and
// stacking included. The job's own compile input is rebuilt here with the options it uses.
describe('runRender: a film (spec 07b R7.1)', () => {
  it('writes the composition the preview compiles, tails and stacking included', async () => {
    const project = filmProject();
    const h = await makeHarness({ project, format: '16:9' });
    let html = '';
    h.fakes.produce = async (args) => {
      html = await readFile(`${args.compDir}/index.html`, 'utf8');
      await import('node:fs/promises').then((fs) => fs.writeFile(args.outPath, 'x'));
      return {};
    };

    expect(await runRender(h.renderId, h.deps)).toBe('done');

    const expected = compileProject(
      projectCompileInput(project, {
        mode: 'render',
        format: '16:9',
        background: 'style',
        voiceSrc: 'assets/voice.wav',
        captions: false,
        images: {},
      }),
      FAKE_ASSETS,
    );
    expect(html).toBe(expected);
    // The film markers: the handover tails lengthen beats 2 and 3, and the grain sits over them.
    expect(html).toContain('"film":true');
    expect(html).toContain('mp-texture-top');
    expect(html).toMatch(/id="film-2" class="clip mp-slot" data-start="5.4" data-duration="6.1"/);
    expect(html).toMatch(/id="film-3" class="clip mp-slot" data-start="11" data-duration="7"/);
  });
});
