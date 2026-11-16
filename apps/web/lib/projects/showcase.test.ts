import { isRenderable } from '@motionpop/motion';
import { describe, expect, it } from 'vitest';
import { showcaseProject } from './fixture';

describe('showcaseProject (/editor/demo)', () => {
  it('renders every ready slot in every format', () => {
    const p = showcaseProject();
    const ready = p.slots.filter((s) => s.status === 'ready');
    expect(ready.map((s) => s.componentId)).toEqual([
      'hook-statement',
      'stat-punch',
      'hook-statement',
    ]);
    for (const f of ['16:9', '9:16', '1:1'] as const) {
      for (const s of ready) expect(isRenderable(s, f), `${s.id} in ${f}`).toBe(true);
    }
  });
});
