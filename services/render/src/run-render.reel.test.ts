import { access, readFile, writeFile } from 'node:fs/promises';
import { fixtureProject } from '@motionpop/motion/testing/project-fixture';
import { EditorProjectSchema, type EditorProject } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { runRender } from './run-render';
import { OWNER, makeHarness } from './testing/harness';

const REEL_ASSETS = {
  reelRuntimeJs: '/* reel */',
  hyperframesRuntimeJs: '/* hyperframes */',
  fonts: new Proxy({}, { get: () => 'AAAA' }) as Record<string, string>,
};

function reelProject(): EditorProject {
  const base = fixtureProject({ slots: [], durationMs: 9_000 });
  return EditorProjectSchema.parse({
    ...base,
    format: '9:16',
    video: {
      src: 'idb:v',
      width: 1080,
      height: 1920,
      originalDurationMs: 10_000,
      cuts: [
        { id: 'c1', startMs: 4_000, endMs: 5_000, kind: 'silence', reason: 'Pause', enabled: true },
      ],
      punchIns: [],
      defaultOverlayAnchor: 'top-right',
    },
    reel: {
      v: 1,
      look: 'mono',
      scenes: [
        {
          id: 'r1',
          startMs: 0,
          endMs: 4_000,
          layout: 'split',
          content: { template: 'headline', title: 'Finish what you start' },
        },
        {
          id: 'r2',
          startMs: 4_000,
          endMs: 9_000,
          layout: 'speaker',
          content: { template: 'none' },
        },
      ],
    },
  });
}

// Spec 25 R2.2: a reel exports as one composition holding the speaker clips (one per kept
// segment), with no slot preflight and no FFmpeg composite.
describe('runRender: a talking-head reel (spec 25)', () => {
  it('copies the source video into the composition and compiles timed speaker clips', async () => {
    const project = reelProject();
    const videoPath = `users/${OWNER}/video/${project.id}/source-0123456789abcdef.mp4`;
    const h = await makeHarness({ project, format: '9:16', doc: { videoPath } });
    await h.blobs.put(videoPath, 'fake video');
    h.deps.reelAssets = REEL_ASSETS;
    let html = '';
    h.fakes.preflight = async () => {
      throw new Error('a reel has no slot preflight');
    };
    h.fakes.produce = async (args) => {
      html = await readFile(`${args.compDir}/index.html`, 'utf8');
      await access(`${args.compDir}/assets/speaker.mp4`);
      await writeFile(args.outPath, 'x');
      return {};
    };

    expect(await runRender(h.renderId, h.deps)).toBe('done');
    expect(html).toContain('id="reel-root"');
    expect(html).toContain('data-no-timeline');
    expect(html).toMatch(
      /id="spk0" class="clip" data-start="0" data-duration="4" data-media-start="0"/,
    );
    expect(html).toMatch(
      /id="spk1" class="clip" data-start="4" data-duration="5" data-media-start="5"/,
    );
    expect(html).toContain('Finish what you start');
  });

  it('fails clearly when the source video is missing', async () => {
    const project = reelProject();
    const h = await makeHarness({ project, format: '9:16' });
    h.deps.reelAssets = REEL_ASSETS;
    expect(await runRender(h.renderId, h.deps)).toBe('error');
    expect((await h.store.get(h.renderId))?.error).toBe('input-missing');
  });
});
