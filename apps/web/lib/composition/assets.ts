import type { CompileAssets } from '@motionpop/motion/compiler';
import { z } from 'zod';

const AssetsSchema = z.object({
  runtimeJs: z.string().min(1),
  hyperframesRuntimeJs: z.string().min(1),
  fonts: z.record(z.string(), z.string().min(1)), // family → base64 woff2
  textures: z.object({
    grain: z.string().startsWith('data:image/png;base64,'),
    paper: z.string().startsWith('data:image/png;base64,'),
  }),
});

let cached: Promise<CompileAssets> | undefined;

/** Fetches (once per page) the assets `compileProject` inlines. Parsed with zod. */
export function loadCompositionAssets(): Promise<CompileAssets> {
  cached ??= fetch('/api/composition/assets')
    .then(async (r) => {
      if (!r.ok) throw new Error(`composition assets: HTTP ${r.status}`);
      return AssetsSchema.parse(await r.json());
    })
    .catch((e: unknown) => {
      cached = undefined;
      throw e;
    });
  return cached;
}
