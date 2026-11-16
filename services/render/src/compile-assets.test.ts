import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { motionDistDir } from './compile-assets';

describe('motionDistDir', () => {
  it('MOTION_DIST_DIR wins', () => {
    expect(motionDistDir({ MOTION_DIST_DIR: '/somewhere/dist' })).toBe('/somewhere/dist');
  });

  it('finds packages/motion/dist from the workspace package', () => {
    const dir = motionDistDir({});
    expect(dir.endsWith(join('packages', 'motion', 'dist'))).toBe(true);
    // Built by `build:runtime`; the folder only has to be where the package says.
    expect(existsSync(join(dir, '..', 'package.json'))).toBe(true);
  });
});
