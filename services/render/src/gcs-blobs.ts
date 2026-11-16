// A BlobStore on Cloud Storage (and its emulator) through the Admin SDK bucket. The job's service
// account is the only caller; paths are checked by `runRender` before they get here.
import type { getStorage } from 'firebase-admin/storage';
import { BlobNotFoundError, type BlobStore, type UploadMeta } from './ports';

type Bucket = ReturnType<ReturnType<typeof getStorage>['bucket']>;

/** The part of a Storage bucket this adapter uses, so tests can fake it. */
export type BucketLike = Pick<Bucket, 'file' | 'upload' | 'deleteFiles'>;

const isNotFound = (e: unknown): boolean => (e as { code?: unknown } | null)?.code === 404;

export class GcsBlobStore implements BlobStore {
  constructor(private readonly bucket: BucketLike) {}

  async read(path: string): Promise<Buffer> {
    try {
      const [bytes] = await this.bucket.file(path).download();
      return bytes;
    } catch (e) {
      if (isNotFound(e)) throw new BlobNotFoundError(path);
      throw e;
    }
  }

  async download(path: string, destFile: string): Promise<void> {
    try {
      await this.bucket.file(path).download({ destination: destFile });
    } catch (e) {
      if (isNotFound(e)) throw new BlobNotFoundError(path);
      throw e;
    }
  }

  async upload(path: string, srcFile: string, meta: UploadMeta): Promise<void> {
    await this.bucket.upload(srcFile, {
      destination: path,
      resumable: false,
      metadata: {
        contentType: meta.contentType,
        ...(meta.contentDisposition ? { contentDisposition: meta.contentDisposition } : {}),
        ...(meta.cacheControl ? { cacheControl: meta.cacheControl } : {}),
      },
    });
  }

  async deletePrefix(prefix: string): Promise<void> {
    // `force` keeps going past a single failed object; a missing prefix is not an error.
    await this.bucket.deleteFiles({ prefix, force: true });
  }
}
