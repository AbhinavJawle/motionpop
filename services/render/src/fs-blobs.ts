// A BlobStore on the local filesystem (offline mode and tests). Object paths map under one root.
// A path that would leave the root (`..`, absolute, NUL) is refused.
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { BlobNotFoundError, type BlobStore, type UploadMeta } from './ports';

export class FsBlobStore implements BlobStore {
  private readonly root: string;
  /** What each upload was stored with, for tests and the offline download route. */
  readonly meta = new Map<string, UploadMeta>();

  constructor(root: string) {
    this.root = resolve(root);
  }

  private file(path: string): string {
    if (
      !path ||
      path === '.' ||
      path.includes('\0') ||
      path.includes('\\') ||
      path.startsWith('/') ||
      path.split('/').includes('..')
    ) {
      throw new Error(`unsafe object path: ${JSON.stringify(path)}`);
    }
    const full = resolve(this.root, path);
    if (full === this.root || !full.startsWith(this.root + sep)) {
      throw new Error(`unsafe object path: ${JSON.stringify(path)}`);
    }
    return full;
  }

  /** The local file behind an object (for the offline download route). */
  localPath(path: string): string {
    return this.file(path);
  }

  async read(path: string): Promise<Buffer> {
    try {
      return await readFile(this.file(path));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new BlobNotFoundError(path);
      throw e;
    }
  }

  async download(path: string, destFile: string): Promise<void> {
    await mkdir(dirname(destFile), { recursive: true });
    try {
      await copyFile(this.file(path), destFile);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new BlobNotFoundError(path);
      throw e;
    }
  }

  async upload(path: string, srcFile: string, meta: UploadMeta): Promise<void> {
    const dest = this.file(path);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(srcFile, dest);
    this.meta.set(path, meta);
  }

  /** Test helper: writes bytes straight into the store. */
  async put(path: string, bytes: Uint8Array | string): Promise<void> {
    const dest = this.file(path);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, bytes);
  }

  async deletePrefix(prefix: string): Promise<void> {
    this.file(prefix); // refuses an unsafe prefix before anything is listed
    // Object stores match by string prefix, not by folder: "a/b" also matches "a/bc.txt".
    const dir = prefix.endsWith('/') ? prefix.slice(0, -1) : dirname(prefix);
    const base = !dir || dir === '.' ? this.root : this.file(dir);
    const all = await this.list(base);
    for (const f of all) {
      const objectPath = relative(this.root, f).split(sep).join('/');
      if (objectPath.startsWith(prefix)) {
        await rm(f, { force: true });
        this.meta.delete(objectPath);
      }
    }
  }

  /** Every object path in the store, sorted (tests). */
  async paths(): Promise<string[]> {
    const files = await this.list(this.root);
    return files.map((f) => relative(this.root, f).split(sep).join('/')).sort();
  }

  private async list(dir: string): Promise<string[]> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
    const out: string[] = [];
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) out.push(...(await this.list(p)));
      else out.push(p);
    }
    return out;
  }
}
