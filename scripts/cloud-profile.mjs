#!/usr/bin/env node
/**
 * Local Google Cloud & Firebase profile switcher for Motionpop (dev only).
 *
 * Keeps personal and temporary lab accounts completely isolated and switchable with one command:
 *   pnpm cloud:status
 *   pnpm cloud:use personal | lab
 *   pnpm cloud:save <name> [--email <email>] [--project <id>] [--label <label>]
 *   pnpm cloud:setup-lab [project-id] [--email <email>]
 *
 * Secrets (API keys, App Check debug tokens, ADC refresh tokens) live ONLY in gitignored
 * `apps/web/.env.profile.*` and `~/.config/gcloud/motionpop-profiles/` (chmod 600).
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const WEB_DIR = join(REPO_ROOT, 'apps', 'web');
const ENV_LOCAL_PATH = join(WEB_DIR, '.env.local');
const FIREBASERC_PATH = join(REPO_ROOT, '.firebaserc');
const STORAGE_CORS_PATH = join(REPO_ROOT, 'storage-cors.json');

const GCLOUD_DIR = join(homedir(), '.config', 'gcloud');
const GCLOUD_ADC_PATH = join(GCLOUD_DIR, 'application_default_credentials.json');
const PROFILES_HOME = join(GCLOUD_DIR, 'motionpop-profiles');
const PROFILES_META_PATH = join(PROFILES_HOME, 'profiles.json');
const FIREBASE_CONFIGSTORE_PATH = join(homedir(), '.config', 'configstore', 'firebase-tools.json');

const PROFILE_NAME_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const REQUIRED_WEB_KEYS = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
];

const REQUIRED_APIS = [
  'firebase.googleapis.com',
  'firebasevertexai.googleapis.com',
  'firebaseml.googleapis.com',
  'generativelanguage.googleapis.com',
  'aiplatform.googleapis.com',
  'firebaseremoteconfig.googleapis.com',
  'firebaseappcheck.googleapis.com',
  'firestore.googleapis.com',
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
  'identitytoolkit.googleapis.com',
  'recaptchaenterprise.googleapis.com',
  'run.googleapis.com',
  'cloudbuild.googleapis.com',
  'artifactregistry.googleapis.com',
  'secretmanager.googleapis.com',
];

export function validateProfileName(name) {
  if (typeof name !== 'string' || !PROFILE_NAME_RE.test(name)) {
    throw new Error(
      `Invalid profile name "${String(name)}". Use lowercase letters, digits, or hyphens (e.g. personal, lab).`,
    );
  }
  return name;
}

export function profileEnvPath(name) {
  return join(WEB_DIR, `.env.profile.${validateProfileName(name)}`);
}

export function profileAdcPath(name) {
  return join(PROFILES_HOME, `${validateProfileName(name)}-adc.json`);
}

export function gcloudConfigName(name) {
  return `motionpop-${validateProfileName(name)}`;
}

export function parseEnvFile(text) {
  const entries = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
}

export function formatEnvEntries(entries, headerLines = []) {
  const lines = [...headerLines];
  const preferredOrder = [
    'NEXT_PUBLIC_CLOUD_PROFILE',
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID',
    'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID',
    'NEXT_PUBLIC_RECAPTCHA_SITE_KEY',
    'NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN',
    'NEXT_PUBLIC_AI_BACKEND',
    'NEXT_PUBLIC_USE_FIREBASE_EMULATORS',
    'GOOGLE_CLOUD_PROJECT',
    'MP_GCP_PROJECT',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'MP_CLOUD_ACCOUNT',
    'JUDGE_EMAILS',
    'ANTHROPIC_API_KEY',
  ];
  const seen = new Set();
  for (const key of preferredOrder) {
    if (entries[key] !== undefined && entries[key] !== '') {
      lines.push(`${key}=${entries[key]}`);
      seen.add(key);
    }
  }
  for (const [key, value] of Object.entries(entries)) {
    if (!seen.has(key) && value !== undefined && value !== '') {
      lines.push(`${key}=${value}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!existsSync(filePath)) return fallback;
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeSecretFile(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o600 });
  try {
    chmodSync(filePath, 0o600);
  } catch {
    // Ignore on platforms where chmod is unsupported.
  }
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim();
}

function runSoft(cmd, args, opts = {}) {
  try {
    return { ok: true, stdout: run(cmd, args, opts), error: null };
  } catch (err) {
    const stderr =
      err && typeof err === 'object' && 'stderr' in err ? String(err.stderr ?? '').trim() : '';
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, stdout: '', error: stderr || msg };
  }
}

function readProfilesMeta() {
  const data = readJsonSafe(PROFILES_META_PATH, { profiles: {} });
  if (!data || typeof data !== 'object' || !data.profiles || typeof data.profiles !== 'object') {
    return { profiles: {} };
  }
  return data;
}

function saveProfilesMeta(meta) {
  writeSecretFile(PROFILES_META_PATH, `${JSON.stringify(meta, null, 2)}\n`);
}

function readGcloudState() {
  const configsRes = runSoft('gcloud', ['config', 'configurations', 'list', '--format=json']);
  const configs = configsRes.ok ? JSON.parse(configsRes.stdout || '[]') : [];
  const active = configs.find((c) => c.is_active) ?? null;

  const authRes = runSoft('gcloud', ['auth', 'list', '--format=json']);
  const accounts = authRes.ok ? JSON.parse(authRes.stdout || '[]') : [];

  const adc = readJsonSafe(GCLOUD_ADC_PATH, null);
  return {
    activeConfig: active?.name ?? null,
    activeAccount: active?.properties?.core?.account ?? null,
    activeProject: active?.properties?.core?.project ?? null,
    configs: configs.map((c) => ({
      name: c.name,
      isActive: Boolean(c.is_active),
      account: c.properties?.core?.account ?? null,
      project: c.properties?.core?.project ?? null,
    })),
    credentialedAccounts: accounts.map((a) => ({
      account: a.account,
      status: a.status,
    })),
    adcQuotaProject: adc?.quota_project_id ?? null,
    adcPresent: Boolean(adc),
  };
}

function readFirebaseCliState() {
  const cfg = readJsonSafe(FIREBASE_CONFIGSTORE_PATH, null);
  const rc = readJsonSafe(FIREBASERC_PATH, { projects: {} });
  const activeEmail = cfg?.activeAccounts?.[REPO_ROOT] ?? cfg?.user?.email ?? null;
  const additional = Array.isArray(cfg?.additionalAccounts)
    ? cfg.additionalAccounts.map((a) => a?.user?.email).filter(Boolean)
    : Object.keys(cfg?.additionalAccounts ?? {});
  const allAccounts = [cfg?.user?.email, activeEmail, ...additional].filter(Boolean);
  return {
    activeEmail,
    accounts: [...new Set(allAccounts)],
    aliases: rc?.projects ?? {},
  };
}

function hasRequiredWebKeys(envMap) {
  return REQUIRED_WEB_KEYS.every((k) => Boolean(envMap[k] && envMap[k].trim()));
}

export function getStatus() {
  const meta = readProfilesMeta();
  const gcloud = readGcloudState();
  const firebase = readFirebaseCliState();
  const currentEnv = existsSync(ENV_LOCAL_PATH)
    ? parseEnvFile(readFileSync(ENV_LOCAL_PATH, 'utf8'))
    : {};

  const discovered = new Set(['personal', 'lab', ...Object.keys(meta.profiles)]);
  if (existsSync(WEB_DIR)) {
    for (const file of readdirSync(WEB_DIR)) {
      const m = file.match(/^\.env\.profile\.([a-z0-9][a-z0-9-]{0,31})$/);
      if (m?.[1]) discovered.add(m[1]);
    }
  }

  const profiles = [...discovered].map((name) => {
    const envPath = profileEnvPath(name);
    const envMap = existsSync(envPath) ? parseEnvFile(readFileSync(envPath, 'utf8')) : {};
    const m = meta.profiles[name] ?? {};
    const gcfg = gcloud.configs.find((c) => c.name === gcloudConfigName(name));
    const account = m.account ?? envMap.MP_CLOUD_ACCOUNT ?? gcfg?.account ?? null;
    const projectId =
      envMap.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? m.projectId ?? gcfg?.project ?? null;
    const envReady = hasRequiredWebKeys(envMap);
    const adcReady = existsSync(profileAdcPath(name));
    const gcloudAuthed = account
      ? gcloud.credentialedAccounts.some((a) => a.account === account)
      : false;
    const firebaseAuthed = account ? firebase.accounts.includes(account) : false;

    let state = 'needs-login';
    if (envReady) {
      state = 'ready';
    } else if (gcloudAuthed) {
      state = 'needs-setup';
    }

    return {
      name,
      label: m.label ?? (name === 'personal' ? 'Personal' : name === 'lab' ? 'GCP Lab' : name),
      account,
      projectId,
      aiBackend: envMap.NEXT_PUBLIC_AI_BACKEND || 'vertex',
      envReady,
      adcReady,
      gcloudAuthed,
      firebaseAuthed,
      state,
    };
  });

  const activeProfile =
    currentEnv.NEXT_PUBLIC_CLOUD_PROFILE ||
    profiles.find((p) => p.projectId && p.projectId === currentEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID)
      ?.name ||
    null;

  const warnings = [];
  const activeMeta = profiles.find((p) => p.name === activeProfile);
  if (
    activeMeta?.projectId &&
    gcloud.activeProject &&
    activeMeta.projectId !== gcloud.activeProject
  ) {
    warnings.push(
      `Project drift: .env.local uses "${activeMeta.projectId}" while gcloud active project is "${gcloud.activeProject}". Run "pnpm cloud:use ${activeProfile}".`,
    );
  }
  if (activeMeta?.account && gcloud.activeAccount && activeMeta.account !== gcloud.activeAccount) {
    warnings.push(
      `Account drift: .env.local profile "${activeProfile}" expects "${activeMeta.account}" while gcloud is on "${gcloud.activeAccount}".`,
    );
  }
  if (
    activeMeta?.projectId &&
    gcloud.adcQuotaProject &&
    activeMeta.projectId !== gcloud.adcQuotaProject &&
    !currentEnv.GOOGLE_APPLICATION_CREDENTIALS
  ) {
    warnings.push(
      `ADC drift: default ADC quota project is "${gcloud.adcQuotaProject}" instead of "${activeMeta.projectId}".`,
    );
  }

  return {
    activeProfile,
    currentEnv: {
      projectId: currentEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null,
      authDomain: currentEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? null,
      aiBackend: currentEnv.NEXT_PUBLIC_AI_BACKEND || 'vertex',
      useEmulators: currentEnv.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true',
      hasAppCheckSiteKey: Boolean(currentEnv.NEXT_PUBLIC_RECAPTCHA_SITE_KEY),
      hasAppCheckDebugToken: Boolean(currentEnv.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN),
      googleApplicationCredentials: currentEnv.GOOGLE_APPLICATION_CREDENTIALS ?? null,
    },
    gcloud: {
      activeConfig: gcloud.activeConfig,
      activeAccount: gcloud.activeAccount,
      activeProject: gcloud.activeProject,
      adcQuotaProject: gcloud.adcQuotaProject,
    },
    firebase: {
      activeEmail: firebase.activeEmail,
      accounts: firebase.accounts,
      aliases: firebase.aliases,
    },
    profiles,
    warnings,
  };
}

function ensureGcloudConfig(profileName, { account, projectId, activate = false } = {}) {
  const cfgName = gcloudConfigName(profileName);
  const listRes = runSoft('gcloud', ['config', 'configurations', 'list', '--format=value(name)']);
  const names = listRes.ok ? listRes.stdout.split(/\r?\n/).filter(Boolean) : [];
  if (!names.includes(cfgName)) {
    const createArgs = ['config', 'configurations', 'create', cfgName];
    if (!activate) createArgs.push('--no-activate');
    run('gcloud', createArgs);
  } else if (activate) {
    run('gcloud', ['config', 'configurations', 'activate', cfgName]);
  }
  if (account) {
    run('gcloud', ['config', 'set', 'core/account', account, `--configuration=${cfgName}`]);
  }
  if (projectId) {
    run('gcloud', ['config', 'set', 'core/project', projectId, `--configuration=${cfgName}`]);
  }
  return cfgName;
}

export function saveProfile(name, opts = {}) {
  const profileName = validateProfileName(name);
  const meta = readProfilesMeta();
  const prev = meta.profiles[profileName] ?? {};
  const currentEnv = existsSync(ENV_LOCAL_PATH)
    ? parseEnvFile(readFileSync(ENV_LOCAL_PATH, 'utf8'))
    : {};

  const account =
    opts.email ??
    (opts.metaOnly ? prev.account : (prev.account ?? currentEnv.MP_CLOUD_ACCOUNT)) ??
    null;
  const projectId =
    opts.project ??
    (opts.metaOnly
      ? prev.projectId
      : (currentEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? prev.projectId)) ??
    null;
  const label =
    opts.label ??
    prev.label ??
    (profileName === 'personal' ? 'Personal' : profileName === 'lab' ? 'GCP Lab' : profileName);

  mkdirSync(PROFILES_HOME, { recursive: true, mode: 0o700 });

  if (!opts.metaOnly && existsSync(GCLOUD_ADC_PATH)) {
    copyFileSync(GCLOUD_ADC_PATH, profileAdcPath(profileName));
    chmodSync(profileAdcPath(profileName), 0o600);
  }

  if (!opts.metaOnly && hasRequiredWebKeys(currentEnv)) {
    const nextEnv = {
      ...currentEnv,
      NEXT_PUBLIC_CLOUD_PROFILE: profileName,
      ...(projectId ? { GOOGLE_CLOUD_PROJECT: projectId, MP_GCP_PROJECT: projectId } : {}),
      ...(account ? { MP_CLOUD_ACCOUNT: account } : {}),
      ...(existsSync(profileAdcPath(profileName))
        ? { GOOGLE_APPLICATION_CREDENTIALS: profileAdcPath(profileName) }
        : {}),
    };
    writeSecretFile(
      profileEnvPath(profileName),
      formatEnvEntries(nextEnv, [
        `# Motionpop local cloud profile: ${profileName} (gitignored — never commit)`,
      ]),
    );
  }

  if (account || projectId) {
    ensureGcloudConfig(profileName, { account, projectId, activate: Boolean(opts.activate) });
  }

  meta.profiles[profileName] = {
    label,
    ...(account ? { account } : {}),
    ...(projectId ? { projectId } : {}),
    updatedAt: new Date().toISOString(),
  };
  saveProfilesMeta(meta);
  return getStatus();
}

export function useProfile(name) {
  const profileName = validateProfileName(name);
  const envFile = profileEnvPath(profileName);
  if (!existsSync(envFile)) {
    throw new Error(
      `Profile "${profileName}" is not configured yet (missing ${envFile}).` +
        (profileName === 'lab'
          ? ' Sign in with gcloud + firebase and run "pnpm cloud:setup-lab".'
          : ''),
    );
  }
  const envMap = parseEnvFile(readFileSync(envFile, 'utf8'));
  if (!hasRequiredWebKeys(envMap)) {
    throw new Error(
      `Profile "${profileName}" is missing required NEXT_PUBLIC_FIREBASE_* keys in ${envFile}.`,
    );
  }

  const meta = readProfilesMeta().profiles[profileName] ?? {};
  const projectId = envMap.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const account = meta.account ?? envMap.MP_CLOUD_ACCOUNT ?? null;
  const adcFile = profileAdcPath(profileName);

  const merged = {
    ...envMap,
    NEXT_PUBLIC_CLOUD_PROFILE: profileName,
    GOOGLE_CLOUD_PROJECT: projectId,
    MP_GCP_PROJECT: projectId,
    ...(account ? { MP_CLOUD_ACCOUNT: account } : {}),
    ...(existsSync(adcFile) ? { GOOGLE_APPLICATION_CREDENTIALS: adcFile } : {}),
  };

  writeSecretFile(
    ENV_LOCAL_PATH,
    formatEnvEntries(merged, [
      `# Active Motionpop cloud profile: ${profileName} (switched ${new Date().toISOString()})`,
      '# Switch with: pnpm cloud:use personal | pnpm cloud:use lab',
    ]),
  );

  // Sync ADC file so tools that do not read apps/web/.env.local also use the active profile.
  if (existsSync(adcFile)) {
    copyFileSync(adcFile, GCLOUD_ADC_PATH);
    chmodSync(GCLOUD_ADC_PATH, 0o600);
  }

  // Activate matching gcloud named configuration.
  ensureGcloudConfig(profileName, { account, projectId, activate: true });

  // Switch Firebase CLI account if signed in to it.
  const fbState = readFirebaseCliState();
  const warnings = [];
  if (account && fbState.accounts.includes(account) && fbState.activeEmail !== account) {
const FIREBASE_TOOLS_PKG = 'firebase-tools@13.31.1';
    const fbSwitch = runSoft('npx', ['-y', FIREBASE_TOOLS_PKG, 'login:use', account]);
    if (!fbSwitch.ok) warnings.push(`firebase login:use skipped: ${fbSwitch.error}`);
  }
  if (fbState.aliases[profileName]) {
    const useRes = runSoft('npx', ['-y', 'firebase-tools@latest', 'use', profileName]);
    if (!useRes.ok) warnings.push(`firebase use ${profileName} skipped: ${useRes.error}`);
  }

  const status = getStatus();
  return { ...status, switchWarnings: warnings };
}

async function gcpFetchJson(url, token, projectId, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(projectId ? { 'x-goog-user-project': projectId } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, text };
}

function updateFirebasercAlias(alias, projectId) {
  const rc = readJsonSafe(FIREBASERC_PATH, { projects: {} });
  rc.projects = { ...(rc.projects ?? {}), [alias]: projectId };
  writeFileSync(FIREBASERC_PATH, `${JSON.stringify(rc, null, 2)}\n`, 'utf8');
}

export async function setupLab({ projectId: explicitProjectId, email: explicitEmail } = {}) {
  const meta = readProfilesMeta();
  const labAccount = explicitEmail ?? meta.profiles.lab?.account ?? null;
  const gcloud = readGcloudState();

  const targetAccount =
    labAccount ??
    gcloud.credentialedAccounts.find((a) => a.account.endsWith('@gcplab.me'))?.account ??
    null;

  if (!targetAccount) {
    throw new Error(
      'No lab Google account found in gcloud. Run: gcloud auth login <lab-email> --no-launch-browser (or gcloud auth login)',
    );
  }
  const authed = gcloud.credentialedAccounts.some((a) => a.account === targetAccount);
  if (!authed) {
    throw new Error(
      `Account ${targetAccount} is not authenticated in gcloud yet.\nRun:\n  gcloud config configurations activate motionpop-lab\n  gcloud auth login ${targetAccount}\n  gcloud auth application-default login`,
    );
  }

  ensureGcloudConfig('lab', { account: targetAccount, activate: true });

  // Discover project ID if not explicitly passed.
  let projectId = explicitProjectId ?? meta.profiles.lab?.projectId ?? null;
  if (!projectId) {
    const projRes = runSoft('gcloud', ['projects', 'list', '--format=json']);
    const projects = projRes.ok ? JSON.parse(projRes.stdout || '[]') : [];
    const activeProjects = projects.filter((p) => p.lifecycleState === 'ACTIVE');
    if (activeProjects.length === 1) {
      projectId = activeProjects[0].projectId;
    } else if (activeProjects.length > 1) {
      const list = activeProjects.map((p) => `  - ${p.projectId} (${p.name})`).join('\n');
      throw new Error(
        `Multiple GCP projects found for ${targetAccount}:\n${list}\nRe-run with: pnpm cloud:setup-lab <project-id>`,
      );
    } else {
      throw new Error(
        `No active GCP projects found for ${targetAccount}. Create or open your lab project in Google Cloud Console, then run: pnpm cloud:setup-lab <project-id>`,
      );
    }
  }

  console.log(`\nSetting up lab profile "${targetAccount}" on project "${projectId}"...`);
  ensureGcloudConfig('lab', { account: targetAccount, projectId, activate: true });

  // Capture ADC for lab (ensuring we never clobber personal-adc.json).
  if (!existsSync(profileAdcPath('personal')) && existsSync(GCLOUD_ADC_PATH)) {
    mkdirSync(PROFILES_HOME, { recursive: true, mode: 0o700 });
    copyFileSync(GCLOUD_ADC_PATH, profileAdcPath('personal'));
    chmodSync(profileAdcPath('personal'), 0o600);
  }
  const quotaRes = runSoft('gcloud', [
    'auth',
    'application-default',
    'set-quota-project',
    projectId,
  ]);
  if (!quotaRes.ok) {
    console.warn(`! Could not set ADC quota project (${quotaRes.error})`);
  }
  if (existsSync(GCLOUD_ADC_PATH)) {
    mkdirSync(PROFILES_HOME, { recursive: true, mode: 0o700 });
    copyFileSync(GCLOUD_ADC_PATH, profileAdcPath('lab'));
    chmodSync(profileAdcPath('lab'), 0o600);
  }

  // Enable required APIs.
  console.log('1/7 Enabling GCP & Firebase APIs...');
  const enableRes = runSoft('gcloud', [
    'services',
    'enable',
    ...REQUIRED_APIS,
    `--project=${projectId}`,
  ]);
  if (!enableRes.ok) {
    console.warn(
      `! Some APIs could not be enabled in batch (${enableRes.error}). Trying individually...`,
    );
    for (const api of REQUIRED_APIS) {
      const one = runSoft('gcloud', ['services', 'enable', api, `--project=${projectId}`]);
      if (!one.ok) console.warn(`  - skipped ${api}: ${one.error.split('\n')[0]}`);
    }
  }

  // Firebase CLI account switch.
  const fbState = readFirebaseCliState();
  if (fbState.accounts.includes(targetAccount)) {
    runSoft('npx', ['-y', 'firebase-tools@latest', 'login:use', targetAccount]);
  } else {
    console.warn(
      `! Firebase CLI is not logged in as ${targetAccount} yet (run: npx -y firebase-tools@latest login:add). Continuing with gcloud REST where possible...`,
    );
  }

  const token = run('gcloud', ['auth', 'print-access-token']);

  // Add Firebase to GCP project.
  console.log('2/7 Ensuring Firebase is enabled on the project...');
  const addFb = await gcpFetchJson(
    `https://firebase.googleapis.com/v1beta1/projects/${projectId}:addFirebase`,
    token,
    projectId,
    { method: 'POST', body: '{}' },
  );
  if (!addFb.ok && addFb.status !== 409) {
    console.warn(`! addFirebase returned ${addFb.status}: ${addFb.text.slice(0, 200)}`);
  }

  // Fetch or create Firebase Web App.
  console.log('3/7 Fetching or creating Firebase Web App...');
  let webAppId = null;
  const listApps = await gcpFetchJson(
    `https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`,
    token,
    projectId,
  );
  if (listApps.ok && Array.isArray(listApps.json?.apps) && listApps.json.apps.length > 0) {
    webAppId = listApps.json.apps[0].appId;
  } else {
    const createApp = await gcpFetchJson(
      `https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`,
      token,
      projectId,
      { method: 'POST', body: JSON.stringify({ displayName: 'motionpop-web' }) },
    );
    if (createApp.ok) {
      // Poll operation briefly for appId.
      const opName = createApp.json?.name;
      for (let i = 0; i < 10 && !webAppId && opName; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const op = await gcpFetchJson(
          `https://firebase.googleapis.com/v1beta1/${opName}`,
          token,
          projectId,
        );
        if (op.json?.done) {
          webAppId = op.json?.response?.appId ?? null;
          break;
        }
      }
    }
    if (!webAppId) {
      const retryList = await gcpFetchJson(
        `https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`,
        token,
        projectId,
      );
      webAppId = retryList.json?.apps?.[0]?.appId ?? null;
    }
  }
  if (!webAppId) {
    throw new Error(
      `Could not find or create a Firebase Web App on ${projectId}. Register one in Firebase Console, then re-run pnpm cloud:setup-lab ${projectId}.`,
    );
  }

  const sdkCfgRes = await gcpFetchJson(
    `https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps/${webAppId}/config`,
    token,
    projectId,
  );
  if (!sdkCfgRes.ok || !sdkCfgRes.json?.apiKey) {
    throw new Error(`Could not fetch Firebase Web App SDK config (${sdkCfgRes.status}).`);
  }
  const sdk = sdkCfgRes.json;

  // Ensure Firestore (default) database, Storage bucket, AI Logic identity, and CORS.
  console.log('4/7 Ensuring Firestore, Storage, AI Logic, and CORS...');
  const fsCreate = runSoft('gcloud', [
    'firestore',
    'databases',
    'create',
    '--database=(default)',
    '--location=us-central1',
    '--type=firestore-native',
    `--project=${projectId}`,
  ]);
  if (!fsCreate.ok && !fsCreate.error.includes('ALREADY_EXISTS')) {
    console.warn(`! Firestore create note: ${fsCreate.error.split('\n')[0]}`);
  }

  const bucketCreate = await gcpFetchJson(
    `https://firebasestorage.googleapis.com/v1beta/projects/${projectId}/defaultBucket`,
    token,
    projectId,
    { method: 'POST', body: JSON.stringify({ location: 'US-CENTRAL1' }) },
  );
  if (!bucketCreate.ok && bucketCreate.status !== 409) {
    console.warn(
      `! Default Storage bucket note (${bucketCreate.status}): ${bucketCreate.text.slice(0, 180)}`,
    );
  }

  runSoft('gcloud', [
    'beta',
    'services',
    'identity',
    'create',
    '--service=firebasevertexai.googleapis.com',
    `--project=${projectId}`,
  ]);

  const bucketName = sdk.storageBucket || `${projectId}.firebasestorage.app`;
  if (existsSync(STORAGE_CORS_PATH)) {
    const corsRes = runSoft('gcloud', [
      'storage',
      'buckets',
      'update',
      `gs://${bucketName}`,
      `--cors-file=${STORAGE_CORS_PATH}`,
      `--project=${projectId}`,
    ]);
    if (!corsRes.ok) {
      console.warn(`! Storage CORS note: ${corsRes.error.split('\n')[0]}`);
    }
  }

  // Enable Email/Password auth + authorize localhost.
  console.log('5/7 Configuring Auth (email/password + localhost)...');
  const authCfg = await gcpFetchJson(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`,
    token,
    projectId,
  );
  const existingDomains = Array.isArray(authCfg.json?.authorizedDomains)
    ? authCfg.json.authorizedDomains
    : ['localhost', `${projectId}.firebaseapp.com`, `${projectId}.web.app`];
  const authorizedDomains = [...new Set([...existingDomains, 'localhost', '127.0.0.1'])];
  const patchAuth = await gcpFetchJson(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config?updateMask=signIn.email.enabled,authorizedDomains`,
    token,
    projectId,
    {
      method: 'PATCH',
      body: JSON.stringify({
        signIn: { email: { enabled: true, passwordRequired: true } },
        authorizedDomains,
      }),
    },
  );
  if (!patchAuth.ok) {
    console.warn(
      `! Auth config patch returned ${patchAuth.status} (you can enable Email/Password + Google in Firebase Console -> Authentication).`,
    );
  }

  // App Check: reCAPTCHA Enterprise site key + local debug token.
  console.log('6/7 Configuring reCAPTCHA Enterprise & App Check debug token...');
  let recaptchaSiteKey = '';
  let debugToken = '';
  const listKeys = await gcpFetchJson(
    `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/keys`,
    token,
    projectId,
  );
  const existingKey = (listKeys.json?.keys ?? []).find((k) =>
    k.webSettings?.allowedDomains?.includes('localhost'),
  );
  if (existingKey?.name) {
    recaptchaSiteKey = existingKey.name.split('/').pop() ?? '';
  } else {
    const createdKey = await gcpFetchJson(
      `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/keys`,
      token,
      projectId,
      {
        method: 'POST',
        body: JSON.stringify({
          displayName: 'motionpop-web-lab',
          webSettings: {
            integrationType: 'SCORE',
            allowAmpTraffic: false,
            allowedDomains: ['localhost', '127.0.0.1', `${projectId}.firebaseapp.com`],
          },
        }),
      },
    );
    if (createdKey.ok && createdKey.json?.name) {
      recaptchaSiteKey = createdKey.json.name.split('/').pop() ?? '';
    } else {
      console.warn(
        `! Could not create reCAPTCHA Enterprise key (${createdKey.status}). App Check will be optional until configured.`,
      );
    }
  }

  if (recaptchaSiteKey) {
    await gcpFetchJson(
      `https://firebaseappcheck.googleapis.com/v1/projects/${projectId}/apps/${webAppId}/recaptchaEnterpriseConfig?updateMask=siteKey`,
      token,
      projectId,
      {
        method: 'PATCH',
        body: JSON.stringify({ siteKey: recaptchaSiteKey }),
      },
    );
    const existingLabEnv = existsSync(profileEnvPath('lab'))
      ? parseEnvFile(readFileSync(profileEnvPath('lab'), 'utf8'))
      : {};
    if (existingLabEnv.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN) {
      debugToken = existingLabEnv.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN;
    } else {
      const candidate = randomUUID();
      const dbg = await gcpFetchJson(
        `https://firebaseappcheck.googleapis.com/v1/projects/${projectId}/apps/${webAppId}/debugTokens`,
        token,
        projectId,
        {
          method: 'POST',
          body: JSON.stringify({ displayName: 'motionpop-local-lab', token: candidate }),
        },
      );
      if (dbg.ok) {
        // App Check treats `token` as input-only and omits it from the 200 response.
        debugToken = dbg.json?.token || candidate;
      } else {
        console.warn(
          `! Could not register App Check debug token (${dbg.status}): ${dbg.text.slice(0, 180)}`,
        );
      }
    }
  }

  // Deploy rules via Firebase CLI if logged in to lab account.
  console.log('7/7 Saving lab profile & deploying rules...');
  updateFirebasercAlias('lab', projectId);
  if (readFirebaseCliState().accounts.includes(targetAccount)) {
    const deployRules = runSoft('npx', [
      '-y',
      'firebase-tools@13.31.1',
      'deploy',
      '--only',
      'firestore:rules,firestore:indexes,storage',
      '--project',
      projectId,
    ]);
    if (!deployRules.ok) {
      console.warn(`! Rules deploy warning: ${deployRules.error.split('\n')[0]}`);
    }
  }

  const labEnv = {
    NEXT_PUBLIC_CLOUD_PROFILE: 'lab',
    NEXT_PUBLIC_FIREBASE_API_KEY: sdk.apiKey,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: sdk.authDomain || `${projectId}.firebaseapp.com`,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: bucketName,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: sdk.messagingSenderId || '',
    NEXT_PUBLIC_FIREBASE_APP_ID: sdk.appId || webAppId,
    ...(sdk.measurementId ? { NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: sdk.measurementId } : {}),
    ...(recaptchaSiteKey ? { NEXT_PUBLIC_RECAPTCHA_SITE_KEY: recaptchaSiteKey } : {}),
    ...(debugToken ? { NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN: debugToken } : {}),
    NEXT_PUBLIC_AI_BACKEND: 'vertex',
    GOOGLE_CLOUD_PROJECT: projectId,
    MP_GCP_PROJECT: projectId,
    MP_CLOUD_ACCOUNT: targetAccount,
    ...(existsSync(profileAdcPath('lab'))
      ? { GOOGLE_APPLICATION_CREDENTIALS: profileAdcPath('lab') }
      : {}),
  };

  writeSecretFile(
    profileEnvPath('lab'),
    formatEnvEntries(labEnv, [
      `# Motionpop local cloud profile: lab (${targetAccount} · gitignored — never commit)`,
    ]),
  );

  meta.profiles.lab = {
    label: 'GCP Lab',
    account: targetAccount,
    projectId,
    updatedAt: new Date().toISOString(),
  };
  saveProfilesMeta(meta);

  const switched = useProfile('lab');
  console.log(`\nLab profile ready and active on project "${projectId}" (${targetAccount}).`);
  console.log('Switch back anytime with: pnpm cloud:use personal');
  return switched;
}

function parseFlags(args) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function printHumanStatus(status) {
  console.log(`Active profile: ${status.activeProfile ?? '(none / custom)'}`);
  console.log(
    `  .env.local  : project=${status.currentEnv.projectId ?? '-'} backend=${status.currentEnv.aiBackend} appCheck=${status.currentEnv.hasAppCheckSiteKey ? 'yes' : 'no'}`,
  );
  console.log(
    `  gcloud      : config=${status.gcloud.activeConfig ?? '-'} account=${status.gcloud.activeAccount ?? '-'} project=${status.gcloud.activeProject ?? '-'}`,
  );
  console.log(`  ADC quota   : ${status.gcloud.adcQuotaProject ?? '-'}`);
  console.log(
    `  Firebase CLI: active=${status.firebase.activeEmail ?? '-'} accounts=[${status.firebase.accounts.join(', ')}]`,
  );
  console.log('\nProfiles:');
  for (const p of status.profiles) {
    const marker = p.name === status.activeProfile ? '*' : ' ';
    console.log(
      `  ${marker} ${p.name.padEnd(10)} ${p.state.padEnd(12)} account=${p.account ?? '-'} project=${p.projectId ?? '-'} env=${p.envReady ? 'ok' : 'missing'} adc=${p.adcReady ? 'ok' : 'missing'}`,
    );
  }
  if (status.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of status.warnings) console.log(`  ! ${w}`);
  }
}

async function main() {
  const [cmd = 'status', ...rest] = process.argv.slice(2);
  const { positional, flags } = parseFlags(rest);

  if (cmd === 'status') {
    const status = getStatus();
    if (flags.json) {
      console.log(JSON.stringify(status, null, 2));
    } else {
      printHumanStatus(status);
    }
    return;
  }

  if (cmd === 'save') {
    const name = positional[0];
    if (!name)
      throw new Error('Usage: pnpm cloud:save <personal|lab> [--email ...] [--project ...]');
    const status = saveProfile(name, {
      email: typeof flags.email === 'string' ? flags.email : undefined,
      project: typeof flags.project === 'string' ? flags.project : undefined,
      label: typeof flags.label === 'string' ? flags.label : undefined,
      metaOnly: Boolean(flags['meta-only']),
      activate: Boolean(flags.activate),
    });
    if (flags.json) console.log(JSON.stringify(status, null, 2));
    else printHumanStatus(status);
    return;
  }

  if (cmd === 'use') {
    const name = positional[0];
    if (!name) throw new Error('Usage: pnpm cloud:use <personal|lab>');
    const status = useProfile(name);
    if (flags.json) {
      console.log(JSON.stringify(status, null, 2));
    } else {
      printHumanStatus(status);
      if (status.switchWarnings?.length) {
        for (const w of status.switchWarnings) console.log(`  ! ${w}`);
      }
      console.log(
        '\nNote: Next.js dev server reloads .env.local automatically (if a server route still holds an old Firebase Admin instance, restart pnpm dev). Sign in again for the switched Firebase project.',
      );
    }
    return;
  }

  if (cmd === 'setup-lab') {
    const status = await setupLab({
      projectId: positional[0],
      email: typeof flags.email === 'string' ? flags.email : undefined,
    });
    if (flags.json) console.log(JSON.stringify(status, null, 2));
    else printHumanStatus(status);
    return;
  }

  throw new Error(`Unknown command "${cmd}". Use: status | use | save | setup-lab`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
