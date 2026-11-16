import { describe, expect, it } from 'vitest';
import { projectIdFrom, storageBucketFrom } from './project-env';

describe('project-env', () => {
  it('reads App Hosting FIREBASE_CONFIG when no project variable is set (production)', () => {
    const env = {
      FIREBASE_CONFIG: JSON.stringify({
        projectId: 'p-1',
        storageBucket: 'p-1.firebasestorage.app',
      }),
    };
    expect(projectIdFrom(env)).toBe('p-1');
    expect(storageBucketFrom(env)).toBe('p-1.firebasestorage.app');
  });
  it('prefers explicit variables, survives a bad FIREBASE_CONFIG and falls back to the project', () => {
    expect(projectIdFrom({ GOOGLE_CLOUD_PROJECT: 'a', FIREBASE_CONFIG: '{"projectId":"b"}' })).toBe(
      'a',
    );
    expect(projectIdFrom({ FIREBASE_CONFIG: 'not json' })).toBeUndefined();
    expect(storageBucketFrom({ GCLOUD_PROJECT: 'c' })).toBe('c.firebasestorage.app');
    expect(storageBucketFrom({})).toBeUndefined();
  });
});
