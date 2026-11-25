import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';

const execFileAsync = promisify(execFile);

const SCRIPT_PATH = resolve(process.cwd(), '..', '..', 'scripts', 'cloud-profile.mjs');

const SwitchBodySchema = z.object({
  profile: z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/),
});

export const CloudProfileEntrySchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  account: z.string().nullable(),
  projectId: z.string().nullable(),
  aiBackend: z.string().min(1),
  envReady: z.boolean(),
  adcReady: z.boolean(),
  gcloudAuthed: z.boolean(),
  firebaseAuthed: z.boolean(),
  state: z.enum(['ready', 'needs-setup', 'needs-login']),
});

export const CloudProfileStatusSchema = z.object({
  activeProfile: z.string().nullable(),
  currentEnv: z.object({
    projectId: z.string().nullable(),
    authDomain: z.string().nullable(),
    aiBackend: z.string(),
    useEmulators: z.boolean(),
    hasAppCheckSiteKey: z.boolean(),
    hasAppCheckDebugToken: z.boolean(),
  }),
  gcloud: z.object({
    activeConfig: z.string().nullable(),
    activeAccount: z.string().nullable(),
    activeProject: z.string().nullable(),
    adcQuotaProject: z.string().nullable(),
  }),
  firebase: z.object({
    activeEmail: z.string().nullable(),
    accounts: z.array(z.string()),
  }),
  profiles: z.array(CloudProfileEntrySchema),
  warnings: z.array(z.string()),
});

const LOOPBACK_HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/i;

function isLoopbackHost(host: string | null): boolean {
  return Boolean(host && LOOPBACK_HOST_RE.test(host.trim()));
}

function guardDevRequest(req: Request, requirePostCsrf: boolean): Response | null {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  if (!isLoopbackHost(req.headers.get('host'))) {
    return Response.json({ error: 'Forbidden host' }, { status: 403 });
  }
  const secFetchSite = req.headers.get('sec-fetch-site');
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    return Response.json({ error: 'Cross-site request blocked' }, { status: 403 });
  }
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      const u = new URL(origin);
      if (!isLoopbackHost(u.host)) {
        return Response.json({ error: 'Forbidden origin' }, { status: 403 });
      }
    } catch {
      return Response.json({ error: 'Forbidden origin' }, { status: 403 });
    }
  }
  if (requirePostCsrf) {
    const ct = (req.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
    if (ct !== 'application/json') {
      return Response.json({ error: 'Content-Type must be application/json' }, { status: 415 });
    }
    if (req.headers.get('x-motionpop-dev') !== '1') {
      return Response.json({ error: 'Missing dev confirmation header' }, { status: 403 });
    }
  }
  return null;
}

async function runProfileScript(args: string[]) {
  const { stdout } = await execFileAsync(process.execPath, [SCRIPT_PATH, ...args, '--json'], {
    timeout: 20_000,
  });
  return CloudProfileStatusSchema.parse(JSON.parse(stdout));
}

export async function GET(req: Request): Promise<Response> {
  const blocked = guardDevRequest(req, false);
  if (blocked) return blocked;
  try {
    const status = await runProfileScript(['status']);
    return Response.json(status);
  } catch {
    return Response.json({ error: 'Failed to inspect cloud profiles' }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const blocked = guardDevRequest(req, true);
  if (blocked) return blocked;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = SwitchBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid profile name' }, { status: 400 });
  }
  try {
    const status = await runProfileScript(['use', parsed.data.profile]);
    return Response.json(status);
  } catch {
    return Response.json({ error: 'Failed to switch cloud profile' }, { status: 400 });
  }
}
