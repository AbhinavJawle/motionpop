import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsBlobStore } from './fs-blobs';
import { BlobNotFoundError } from './ports';

const make = async () => new FsBlobStore(await mkdtemp(join(tmpdir(), 'mp-blobs-')));

describe('FsBlobStore', () => {
  it('reads, downloads and uploads objects', async () => {
    const b = await make();
    await b.put('users/u/a.txt', 'hello');
    expect((await b.read('users/u/a.txt')).toString()).toBe('hello');
    const dest = join(await mkdtemp(join(tmpdir(), 'mp-dl-')), 'sub', 'a.txt');
    await b.download('users/u/a.txt', dest);
    expect(await readFile(dest, 'utf8')).toBe('hello');
    await b.upload('users/u/out/b.txt', dest, { contentType: 'text/plain' });
    expect(await b.paths()).toEqual(['users/u/a.txt', 'users/u/out/b.txt']);
    expect(b.meta.get('users/u/out/b.txt')?.contentType).toBe('text/plain');
  });

  it('throws BlobNotFoundError for a missing object', async () => {
    const b = await make();
    await expect(b.read('nope')).rejects.toBeInstanceOf(BlobNotFoundError);
    await expect(b.download('nope', join(tmpdir(), 'mp-never'))).rejects.toBeInstanceOf(
      BlobNotFoundError,
    );
  });

  it('refuses paths that leave the root', async () => {
    const b = await make();
    const f = join(await mkdtemp(join(tmpdir(), 'mp-src-')), 'f');
    await writeFile(f, 'x');
    for (const bad of ['../x', 'a/../../x', '/etc/passwd', 'a\0b']) {
      await expect(b.read(bad), bad).rejects.toThrow(/unsafe/);
      await expect(b.upload(bad, f, { contentType: 'x' }), bad).rejects.toThrow(/unsafe/);
      await expect(b.deletePrefix(bad), bad).rejects.toThrow(/unsafe/);
    }
  });

  it('deletes by string prefix, like an object store', async () => {
    const b = await make();
    for (const p of [
      'r/1/input/project.json',
      'r/1/video.mp4',
      'r/1/video.mp4.bak',
      'r/10/video.mp4',
    ])
      await b.put(p, 'x');
    await b.deletePrefix('r/1/input/');
    expect(await b.paths()).toEqual(['r/1/video.mp4', 'r/1/video.mp4.bak', 'r/10/video.mp4']);
    await b.deletePrefix('r/1/video.mp4');
    expect(await b.paths()).toEqual(['r/10/video.mp4']);
    await b.deletePrefix('nothing/here/');
    expect(await b.paths()).toEqual(['r/10/video.mp4']);
  });
});
