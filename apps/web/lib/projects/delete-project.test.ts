import { describe, expect, it, vi } from 'vitest';
import { deleteProject, type DeleteProjectDeps } from './delete-project.server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/verify.server', () => ({
  HttpError: class extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));

function deps(owner: string | null): DeleteProjectDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    ownerOf: async () => owner,
    deleteSubCollections: async (id) => void calls.push(`subs:${id}`),
    deleteRelated: async (uid, id) => void calls.push(`related:${uid}:${id}`),
    deletePrefix: async (p) => void calls.push(`prefix:${p}`),
    deleteProjectDoc: async (id) => void calls.push(`doc:${id}`),
  };
}

describe('deleteProject (spec 11 task 6b)', () => {
  it('deletes everything under the project, the project document last', async () => {
    const d = deps('u1');
    await expect(deleteProject(d, 'u1', 'p-1')).resolves.toEqual({ deleted: true });
    expect(d.calls).toEqual([
      'subs:p-1',
      'related:u1:p-1',
      'prefix:users/u1/audio/p-1/',
      'prefix:users/u1/video/p-1/',
      'prefix:users/u1/projects/p-1/',
      'doc:p-1',
    ]);
  });

  it('refuses another owner and touches nothing', async () => {
    const d = deps('someone-else');
    await expect(deleteProject(d, 'u1', 'p-1')).rejects.toMatchObject({ status: 403 });
    expect(d.calls).toEqual([]);
  });

  it('is a success when the project is already gone, and rejects a bad id', async () => {
    const d = deps(null);
    await expect(deleteProject(d, 'u1', 'p-1')).resolves.toEqual({ deleted: true });
    await expect(deleteProject(d, 'u1', '../x')).rejects.toMatchObject({ status: 400 });
    expect(d.calls).toEqual([]);
  });
});
