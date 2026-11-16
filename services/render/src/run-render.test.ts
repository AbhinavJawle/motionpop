import { readFile, stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { bigNumberSlot, fixtureProject } from '@motionpop/motion/testing/project-fixture';
import { expectedSize } from './output';
import { RenderAbortedError, RenderTimeoutError } from './ports';
import { demuxerFor, runRender } from './run-render';
import { makeHarness, OWNER, RENDER_ID, type Harness } from './testing/harness';

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  );

/** The render ended with nothing left behind, whatever the outcome. */
async function expectClean(h: Harness, { keepOutput }: { keepOutput: boolean }) {
  expect(await exists(h.workDir)).toBe(false);
  const left = (await h.leftovers()).blobs;
  expect(left.filter((p) => p.startsWith(h.paths.inputDir))).toEqual([]);
  if (!keepOutput) {
    expect(left.filter((p) => p === h.paths.output || p === h.paths.thumb)).toEqual([]);
  }
  expect(h.clock.timers.size).toBe(0); // the heartbeat is stopped
}

describe('runRender: the happy path', () => {
  it('renders, uploads the video and the thumbnail, marks the render done and cleans up', async () => {
    const h = await makeHarness({ title: 'My: great video' });
    const progress: number[] = [];
    const original = h.store.progress.bind(h.store);
    h.store.progress = async (id, stage, p) => {
      const r = await original(id, stage, p);
      progress.push((await h.store.get(id))!.progress);
      return r;
    };

    expect(await runRender(h.renderId, h.deps)).toBe('done');

    const doc = (await h.store.get(h.renderId))!;
    expect(doc).toMatchObject({
      status: 'done',
      progress: 100,
      outputPath: h.paths.output,
      thumbPath: h.paths.thumb,
      sizeBytes: 'fake mp4 bytes'.length,
    });
    expect(doc.error).toBeUndefined();
    expect(h.store.ledger).toEqual([]);

    // Progress only goes up, stays below 100 until done, and reaches the encoding band.
    expect(progress.length).toBeGreaterThan(2);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(Math.max(...progress)).toBeLessThan(100);
    expect(Math.max(...progress)).toBeGreaterThanOrEqual(85);

    expect((await h.leftovers()).blobs).toEqual(
      [h.paths.output, h.paths.thumb, expect.stringContaining('voice-')].sort(),
    );
    expect(h.blobs.meta.get(h.paths.output)).toMatchObject({
      contentType: 'video/mp4',
      cacheControl: 'private, max-age=0',
    });
    expect(h.blobs.meta.get(h.paths.output)?.contentDisposition).toContain(
      'filename="My great video.mp4"',
    );
    expect(h.blobs.meta.get(h.paths.thumb)?.contentType).toBe('image/jpeg');
    await expectClean(h, { keepOutput: true });
  });

  it('logs one structured line with timings and no transcript or URLs', async () => {
    const h = await makeHarness();
    await runRender(h.renderId, h.deps);
    const lines = h.logs.filter((l) => l.fields['event'] === 'render');
    expect(lines).toHaveLength(1);
    expect(lines[0]?.fields).toMatchObject({
      renderId: h.renderId,
      outcome: 'done',
      format: '16:9',
      resolution: '1080p',
      perfTotalMs: 4321,
      sizeBytes: 14,
    });
    expect(typeof lines[0]?.fields['wallMs']).toBe('number');
    expect(JSON.stringify(h.logs)).not.toMatch(/word\d|https?:/);
  });

  it('compiles the snapshot in render mode for the chosen format, with the re-encoded voice', async () => {
    const h = await makeHarness({ format: '9:16', resolution: '720p' });
    let html = '';
    let seenSize: unknown;
    h.fakes.produce = async (args) => {
      html = await readFile(`${args.compDir}/index.html`, 'utf8');
      seenSize = { format: args.format, resolution: args.resolution };
      await import('node:fs/promises').then((fs) => fs.writeFile(args.outPath, 'x'));
      return {};
    };
    h.fakes.outputProbe = () => ({
      durationMs: h.project.durationMs,
      audioStreams: 1,
      videoStreams: 1,
      ...expectedSize('9:16', '720p'),
      frames: Math.round((h.project.durationMs * 30) / 1000),
    });
    expect(await runRender(h.renderId, h.deps)).toBe('done');
    expect(html).toContain('assets/voice.wav');
    expect(html).toContain('"format":"9:16"');
    expect(html).toContain('"mode":"render"');
    expect(seenSize).toEqual({ format: '9:16', resolution: '720p' });
  });

  it('runs the preflight before the producer, and the steps in the designed order', async () => {
    const h = await makeHarness();
    await runRender(h.renderId, h.deps);
    const order = h.calls.filter((c) => !c.startsWith('ffmpeg.probe:voice'));
    expect(order).toEqual([
      'ffmpeg.toWav',
      'preflight.check',
      'producer.render',
      'ffmpeg.probe:video.mp4',
      'ffmpeg.frame',
      'blobs.upload:video.mp4',
      'blobs.upload:thumb.jpg',
    ]);
  });
});

describe('runRender: duplicate and bad starts', () => {
  it('skips a render that is not queued (a duplicate execution)', async () => {
    const h = await makeHarness();
    expect(await runRender(h.renderId, h.deps)).toBe('done');
    const before = (await h.store.get(h.renderId))!;
    expect(await runRender(h.renderId, h.deps)).toBe('skipped');
    expect(await h.store.get(h.renderId)).toEqual(before);
    expect(h.calls.filter((c) => c === 'producer.render')).toHaveLength(1);
  });

  it('skips a missing render and an id that is not a safe id, touching nothing', async () => {
    const h = await makeHarness();
    expect(await runRender('r-does-not-exist', h.deps)).toBe('skipped');
    expect(await runRender('../../etc/passwd', h.deps)).toBe('skipped');
    expect(h.calls).toEqual([]);
  });
});

describe('runRender: inputs are checked before they are read (R3.9)', () => {
  it("fails a voice path that is another owner's, without reading it", async () => {
    const h = await makeHarness({
      doc: { voicePath: 'users/someone-else/audio/fixture/voice-0123456789abcdef.wav' },
    });
    let downloads = 0;
    const download = h.blobs.download.bind(h.blobs);
    h.blobs.download = async (...a) => (downloads++, download(...a));
    expect(await runRender(h.renderId, h.deps)).toBe('error');
    const doc = (await h.store.get(h.renderId))!;
    expect(doc).toMatchObject({ status: 'error', error: 'input-missing' });
    expect(downloads).toBe(0);
    expect(h.calls).toEqual([]);
    await expectClean(h, { keepOutput: false });
  });

  it('fails a voice path that is not the voice-<hash>.<ext> shape', async () => {
    const h = await makeHarness({
      doc: { voicePath: `users/${OWNER}/audio/fixture/../../other/voice-0123456789abcdef.wav` },
    });
    expect(await runRender(h.renderId, h.deps)).toBe('error');
    expect((await h.store.get(h.renderId))?.error).toBe('input-missing');
  });

  it('fails an input path that is not this render’s snapshot, without reading it', async () => {
    const h = await makeHarness({
      doc: { inputPath: `users/${OWNER}/projects/fixture/renders/other/input/project.json` },
    });
    let reads = 0;
    const read = h.blobs.read.bind(h.blobs);
    h.blobs.read = async (p) => (reads++, read(p));
    expect(await runRender(h.renderId, h.deps)).toBe('error');
    expect((await h.store.get(h.renderId))?.error).toBe('input-missing');
    expect(reads).toBe(0);
  });

  it('fails when the snapshot or the voice is missing', async () => {
    const noSnapshot = await makeHarness({ skipSnapshot: true });
    expect(await runRender(noSnapshot.renderId, noSnapshot.deps)).toBe('error');
    expect((await noSnapshot.store.get(RENDER_ID))?.error).toBe('input-missing');

    const noVoice = await makeHarness({ skipVoice: true });
    expect(await runRender(noVoice.renderId, noVoice.deps)).toBe('error');
    expect((await noVoice.store.get(RENDER_ID))?.error).toBe('input-missing');
  });

  it('fails a snapshot that is not a valid project, or that belongs to another project', async () => {
    const h = await makeHarness();
    await h.blobs.put(h.paths.input, '{"nope": true}');
    expect(await runRender(h.renderId, h.deps)).toBe('error');
    expect((await h.store.get(h.renderId))?.error).toBe('input-missing');

    const other = await makeHarness();
    await other.blobs.put(other.paths.input, JSON.stringify({ ...other.project, id: 'another' }));
    expect(await runRender(other.renderId, other.deps)).toBe('error');
    expect((await other.store.get(RENDER_ID))?.error).toBe('input-missing');
  });

  it('fails a voice that is not decodable audio', async () => {
    const h = await makeHarness();
    h.fakes.voiceProbe = () => {
      throw new Error('Invalid data found when processing input');
    };
    expect(await runRender(h.renderId, h.deps)).toBe('error');
    expect((await h.store.get(h.renderId))?.error).toBe('input-missing');
    expect(h.calls).not.toContain('producer.render');
    await expectClean(h, { keepOutput: false });
  });

  it('fails a voice with no audio stream or with two', async () => {
    for (const audioStreams of [0, 2]) {
      const h = await makeHarness();
      h.fakes.voiceProbe = () => ({ durationMs: 1000, audioStreams, videoStreams: 0 });
      expect(await runRender(h.renderId, h.deps)).toBe('error');
      expect((await h.store.get(h.renderId))?.error).toBe('input-missing');
    }
  });

  it('fails a voice much longer than the project, judged on the re-encoded WAV', async () => {
    const h = await makeHarness();
    // The container does not know its length (0), the WAV does.
    h.fakes.voiceProbe = (file) => ({
      durationMs: file.endsWith('.wav') ? h.project.durationMs + 60_000 : 0,
      audioStreams: 1,
      videoStreams: 0,
    });
    expect(await runRender(h.renderId, h.deps)).toBe('error');
    expect((await h.store.get(h.renderId))?.error).toBe('input-missing');
  });

  it('accepts a voice a few seconds longer than the project', async () => {
    const h = await makeHarness();
    h.fakes.voiceProbe = () => ({
      durationMs: h.project.durationMs + 3000,
      audioStreams: 1,
      videoStreams: 0,
    });
    expect(await runRender(h.renderId, h.deps)).toBe('done');
  });
});

describe('runRender: failures end in `error` with the step’s code, one refund and no leftovers', () => {
  const expectFailed = async (h: Harness, code: string) => {
    const doc = (await h.store.get(h.renderId))!;
    expect(doc).toMatchObject({ status: 'error', error: code });
    expect(doc.errorMessage?.length ?? 0).toBeGreaterThan(0);
    expect(h.store.refundsOf(h.renderId)).toHaveLength(1);
    expect(h.store.balances.get(OWNER)).toBe(15 + h.doc.costCredits);
    await expectClean(h, { keepOutput: false });
  };

  it('compile: nothing in the project can be rendered', async () => {
    const h = await makeHarness({
      project: fixtureProject({
        slots: [{ ...bigNumberSlot('a', 0, 3000), status: 'suggested' }],
      }),
    });
    expect(await runRender(h.renderId, h.deps)).toBe('error');
    await expectFailed(h, 'compile-failed');
    expect(h.calls).not.toContain('producer.render');
  });

  it('preflight: a slot error fails the render as slot-failed and names the slot', async () => {
    const h = await makeHarness();
    h.fakes.preflight = async () => [{ slotId: 'b', message: 'build: boom' }];
    expect(await runRender(h.renderId, h.deps)).toBe('error');
    await expectFailed(h, 'slot-failed');
    expect((await h.store.get(h.renderId))?.errorMessage).toContain('slot b');
    expect(h.calls).not.toContain('producer.render');
  });

  it('preflight: Chrome failing to start is a render failure', async () => {
    const h = await makeHarness();
    h.fakes.preflight = async () => {
      throw new Error('no chrome');
    };
    expect(await runRender(h.renderId, h.deps)).toBe('error');
    await expectFailed(h, 'render-failed');
  });

  it('producer: a failure is render-failed and a time limit is timeout', async () => {
    const failing = await makeHarness();
    failing.fakes.produce = async () => {
      throw new Error('ffmpeg exited 1');
    };
    await runRender(failing.renderId, failing.deps);
    await expectFailed(failing, 'render-failed');

    const slow = await makeHarness();
    slow.fakes.produce = async () => {
      throw new RenderTimeoutError();
    };
    await runRender(slow.renderId, slow.deps);
    await expectFailed(slow, 'timeout');
  });

  it('output check: a wrong size or frame count is render-failed', async () => {
    const wrongSize = await makeHarness();
    wrongSize.fakes.outputProbe = () => ({
      durationMs: wrongSize.project.durationMs,
      audioStreams: 1,
      videoStreams: 1,
      width: 1280,
      height: 720,
      frames: Math.round((wrongSize.project.durationMs * 30) / 1000),
    });
    await runRender(wrongSize.renderId, wrongSize.deps);
    await expectFailed(wrongSize, 'render-failed');

    const shortVideo = await makeHarness();
    shortVideo.fakes.outputProbe = () => ({
      durationMs: 1000,
      audioStreams: 1,
      videoStreams: 1,
      ...expectedSize('16:9', '1080p'),
      frames: 30,
    });
    await runRender(shortVideo.renderId, shortVideo.deps);
    await expectFailed(shortVideo, 'render-failed');
  });

  it('thumbnail: ffmpeg failing is render-failed', async () => {
    const h = await makeHarness();
    h.fakes.frame = async () => {
      throw new Error('no frame');
    };
    await runRender(h.renderId, h.deps);
    await expectFailed(h, 'render-failed');
  });

  it('upload: a failed upload is upload-failed and no half-uploaded video stays', async () => {
    const h = await makeHarness();
    h.fakes.upload = async (path) => {
      if (path.endsWith('thumb.jpg')) throw new Error('503');
    };
    await runRender(h.renderId, h.deps);
    await expectFailed(h, 'upload-failed');
  });
});

describe('runRender: a render that is stopped from outside', () => {
  it('aborts and cleans up when the render was swept while the producer ran', async () => {
    const h = await makeHarness();
    h.fakes.produce = async ({ signal, onProgress }) => {
      // The sweep marks it stalled and refunds; our next progress write finds it inactive.
      await h.store.fail(h.renderId, 'stalled', 'no heartbeat');
      h.clock.t += 5000;
      onProgress({ stage: 'rendering', percent: 50 });
      await new Promise((r) => setTimeout(r, 10));
      if (signal.aborted) throw new RenderAbortedError();
      throw new Error('the abort signal never fired');
    };
    expect(await runRender(h.renderId, h.deps)).toBe('error');
    const doc = (await h.store.get(h.renderId))!;
    expect(doc).toMatchObject({ status: 'error', error: 'stalled' });
    expect(h.store.refundsOf(h.renderId)).toHaveLength(1);
    expect(h.calls).not.toContain('ffmpeg.frame');
    await expectClean(h, { keepOutput: false });
  });

  it('aborts when a heartbeat finds the render no longer active', async () => {
    const h = await makeHarness();
    h.fakes.produce = async ({ signal }) => {
      await h.store.fail(h.renderId, 'stalled', 'no heartbeat');
      h.clock.tick(10_000);
      await new Promise((r) => setTimeout(r, 10));
      if (signal.aborted) throw new RenderAbortedError();
      throw new Error('the abort signal never fired');
    };
    expect(await runRender(h.renderId, h.deps)).toBe('error');
    expect((await h.store.get(h.renderId))?.error).toBe('stalled');
    expect(h.store.refundsOf(h.renderId)).toHaveLength(1);
  });

  it('writes heartbeats every 10 s while it runs', async () => {
    const h = await makeHarness();
    let beats = 0;
    const heartbeat = h.store.heartbeat.bind(h.store);
    h.store.heartbeat = async (id) => (beats++, heartbeat(id));
    h.fakes.produce = async ({ outPath }) => {
      h.clock.tick(35_000);
      await new Promise((r) => setTimeout(r, 10));
      await import('node:fs/promises').then((fs) => fs.writeFile(outPath, 'x'));
      return {};
    };
    expect(await runRender(h.renderId, h.deps)).toBe('done');
    expect(beats).toBe(3);
  });

  it('rejects, after cleaning up, when it cannot even record the failure', async () => {
    const h = await makeHarness();
    h.fakes.produce = async () => {
      throw new Error('boom');
    };
    h.store.fail = async () => {
      throw new Error('firestore is down');
    };
    await expect(runRender(h.renderId, h.deps)).rejects.toThrow('firestore is down');
    await expectClean(h, { keepOutput: false });
  });
});

describe('demuxerFor', () => {
  it('forces a demuxer from the extension the path already matched', () => {
    expect(demuxerFor('users/u/audio/p/voice-0123456789abcdef.wav')).toBe('wav');
    expect(demuxerFor('users/u/audio/p/voice-0123456789abcdef.mp3')).toBe('mp3');
    expect(demuxerFor('users/u/audio/p/voice-0123456789abcdef.m4a')).toBe('mov');
    expect(demuxerFor('users/u/audio/p/voice-0123456789abcdef.webm')).toBe('matroska');
    expect(demuxerFor('users/u/audio/p/voice-0123456789abcdef.ogg')).toBe('ogg');
  });
});
