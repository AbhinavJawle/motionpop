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

function notAvailableInProd(): Response | null {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  return null;
}

async function runProfileScript(args: string[]) {
  const { stdout } = await execFileAsync(process.execPath, [SCRIPT_PATH, ...args, '--json'], {
    timeout: 20_000,
  });
  return CloudProfileStatusSchema.parse(JSON.parse(stdout));
}

export async function GET(): Promise<Response> {
  const blocked = notAvailableInProd();
  if (blocked) return blocked;
  try {
    const status = await runProfileScript(['status']);
    return Response.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to inspect cloud profiles';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const blocked = notAvailableInProd();
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
  } catch (err) {
    const message =
      err && typeof err === 'object' && 'stderr' in err && typeof err.stderr === 'string'
        ? err.stderr.trim()
        : err instanceof Error
          ? err.message
          : 'Failed to switch cloud profile';
    return Response.json({ error: message || 'Failed to switch cloud profile' }, { status: 400 });
  }
}
