import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * P10 (spec 09 task 18): credits are spent in exactly two places, the Generate flow
 * (`lib/slots/generate.ts`) and the edit/note flows, and a spend sits behind a check that the
 * route is the cloud. Anything else that calls `spend(` or `spendWithUi(` fails here, so a new
 * caller has to be added to the list on purpose (and reviewed against "no surprise spend").
 */
const WEB = fileURLToPath(new URL('../..', import.meta.url));

const ALLOWED = new Set([
  'lib/slots/generate.ts',
  'lib/slots/quick-edit.ts',
  // The frame-note flow (spec 09 task 20).
  'lib/notes/note-fix.ts',
  // Film mode's own spend sites: each is refunded when no beat or film comes back.
  'lib/film/film.ts',
  'lib/film/rebuild.ts',
  // Pip's cloud plan (spec 10): 2 credits, refunded when the call fails.
  'lib/pip/use-pip.ts',
  // Script → voice (spec 11): per started minute, refunded when it fails.
  'lib/tts/generate-voice.ts',
  // Custom graphic (spec 15): 3 credits, refunded on any failure.
  'lib/slots/custom.ts',
  // A painted picture (spec 07 R4): imageCredits each, refunded when it fails.
  'lib/images/generate.ts',
  // Spec 26: the cloud reel director and reel illustrations.
  'lib/reel/media.ts',
  'lib/slots/custom.ts',
  // The credits layer itself.
  'lib/credits/spend-with-ui.ts',
  'lib/credits/server-credits.ts',
  'lib/credits/local-credits.ts',
  'lib/credits/client.ts',
  'lib/credits/fake-credits-server.ts',
  // Test hook for the credits e2e (mounted only under the test flag).
  'components/credits/credits-test-hooks.tsx',
  // The HTTP route that the server client calls.
  'app/api/credits/spend/route.ts',
]);

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.next') || name === 'e2e-output') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield full;
  }
}

const CALL = /(?<![A-Za-z_])(?:\.spend|spendWithUi|reserve)\(/;

describe('P10 who spends credits', () => {
  const sources = [...walk(WEB)].map((p) => ({
    rel: p.slice(WEB.length),
    text: readFileSync(p, 'utf8'),
  }));

  it('only the allowed files call spend', () => {
    const callers = sources.filter((s) => CALL.test(s.text)).map((s) => s.rel);
    const unexpected = callers.filter((c) => !ALLOWED.has(c));
    expect(unexpected).toEqual([]);
    // And the two flows really do spend.
    expect(callers).toContain('lib/slots/generate.ts');
    expect(callers).toContain('lib/slots/quick-edit.ts');
    expect(callers).toContain('lib/notes/note-fix.ts');
  });

  it('Generate spends only after it has checked that the route is the cloud', () => {
    const text = sources.find((s) => s.rel === 'lib/slots/generate.ts')!.text;
    const check = text.indexOf("route.kind !== 'cloud'");
    const spend = text.indexOf('await reserve(');
    expect(check).toBeGreaterThan(-1);
    expect(spend).toBeGreaterThan(check);
  });

  it.each(['lib/slots/quick-edit.ts', 'lib/notes/note-fix.ts'])(
    '%s spends only inside its cloud branch',
    (file) => {
      const text = sources.find((s) => s.rel === file)!.text;
      const branch = text.indexOf("route.kind === 'cloud'");
      expect(branch).toBeGreaterThan(-1);
      expect(text.indexOf('spendWithUi(')).toBeGreaterThan(branch);
    },
  );
});
