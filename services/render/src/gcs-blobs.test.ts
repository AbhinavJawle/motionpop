import { describe, expect, it } from 'vitest';
import { GcsBlobStore, type BucketLike } from './gcs-blobs';
import { BlobNotFoundError } from './ports';

/** A bucket that records calls; `files` are objects it "has". */
function fakeBucket(files: Record<string, string> = {}) {
  const calls: { op: string; args: unknown[] }[] = [];
  const notFound = Object.assign(new Error('No such object'), { code: 404 });
  const bucket = {
    file: (path: string) => ({
      download: async (opts?: { destination?: string }) => {
        calls.push({ op: 'download', args: [path, opts] });
        if (path === 'boom') throw Object.assign(new Error('permission denied'), { code: 403 });
        if (!(path in files)) throw notFound;
        return [Buffer.from(files[path] ?? '')];
      },
    }),
    upload: async (src: string, opts: unknown) => {
      calls.push({ op: 'upload', args: [src, opts] });
    },
    deleteFiles: async (opts: unknown) => {
      calls.push({ op: 'deleteFiles', args: [opts] });
    },
  } as unknown as BucketLike;
  return { bucket, calls };
}

describe('GcsBlobStore', () => {
  it('reads an object, and maps a 404 to BlobNotFoundError', async () => {
    const { bucket } = fakeBucket({ 'users/u/a.json': '{"a":1}' });
    const store = new GcsBlobStore(bucket);
    expect((await store.read('users/u/a.json')).toString()).toBe('{"a":1}');
    await expect(store.read('users/u/missing')).rejects.toBeInstanceOf(BlobNotFoundError);
    await expect(store.read('boom')).rejects.not.toBeInstanceOf(BlobNotFoundError);
  });

  it('downloads to a file and maps a 404', async () => {
    const { bucket, calls } = fakeBucket({ 'users/u/v.wav': 'x' });
    const store = new GcsBlobStore(bucket);
    await store.download('users/u/v.wav', '/tmp/v.wav');
    expect(calls[0]).toEqual({
      op: 'download',
      args: ['users/u/v.wav', { destination: '/tmp/v.wav' }],
    });
    await expect(store.download('nope', '/tmp/n')).rejects.toBeInstanceOf(BlobNotFoundError);
  });

  it('uploads with the content type, disposition and cache control, and no resumable session', async () => {
    const { bucket, calls } = fakeBucket();
    const store = new GcsBlobStore(bucket);
    await store.upload('users/u/video.mp4', '/tmp/video.mp4', {
      contentType: 'video/mp4',
      contentDisposition: 'attachment; filename="a.mp4"',
      cacheControl: 'private, max-age=0',
    });
    await store.upload('users/u/thumb.jpg', '/tmp/thumb.jpg', { contentType: 'image/jpeg' });
    expect(calls[0]).toEqual({
      op: 'upload',
      args: [
        '/tmp/video.mp4',
        {
          destination: 'users/u/video.mp4',
          resumable: false,
          metadata: {
            contentType: 'video/mp4',
            contentDisposition: 'attachment; filename="a.mp4"',
            cacheControl: 'private, max-age=0',
          },
        },
      ],
    });
    expect(calls[1]?.args[1]).toMatchObject({ metadata: { contentType: 'image/jpeg' } });
    expect(calls[1]?.args[1]).not.toHaveProperty('metadata.contentDisposition');
  });

  it('deletes by prefix', async () => {
    const { bucket, calls } = fakeBucket();
    await new GcsBlobStore(bucket).deletePrefix('users/u/renders/r/input/');
    expect(calls[0]).toEqual({
      op: 'deleteFiles',
      args: [{ prefix: 'users/u/renders/r/input/', force: true }],
    });
  });
});
