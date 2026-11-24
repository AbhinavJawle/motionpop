// Film lab: a small Vertex AI caller for experiments (docs/research/film-mode.md). Not product
// code: the product calls models through packages/ai and Firebase AI Logic. This talks to the
// same models on the same `global` endpoint with the developer's own gcloud login, so a lab run
// needs no App Check token and no browser.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { request } from 'node:https';
import { dirname } from 'node:path';

/**
 * POST with a 20-minute limit. Node's fetch gives up after 300 s without response headers
 * ("fetch failed"), and frontier models thinking at HIGH answer later than that.
 */
function postJson(
  url: string,
  token: string,
  body: string,
): Promise<{ status: number; ok: boolean; text: () => Promise<string>; json: () => Promise<unknown> }> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 20 * 60_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode ?? 0;
          resolve({
            status,
            ok: status >= 200 && status < 300,
            text: () => Promise.resolve(text),
            json: () => Promise.resolve(JSON.parse(text) as unknown),
          });
        });
        res.on('error', reject);
      },
    );
    // TCP keepalive probes, so a router doesn't drop the silent connection while the model thinks
    // (both Gemini 4 frontier calls died with read ETIMEDOUT at 191 s without them).
    req.on('socket', (s) => s.setKeepAlive(true, 15_000));
    req.on('timeout', () => req.destroy(new Error('request timed out after 20 min')));
    req.on('error', reject);
    req.end(body);
  });
}

function resolveProject(): string {
  const fromEnv = process.env['MP_GCP_PROJECT'] ?? process.env['GOOGLE_CLOUD_PROJECT'];
  if (fromEnv?.trim()) return fromEnv.trim();
  try {
    const active = execFileSync('gcloud', ['config', 'get-value', 'project'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (active && active !== '(unset)') return active;
  } catch {
    // Fall back to default project.
  }
  return 'motionpop-48409';
}

const PROJECT = resolveProject();
let auth: { value: string; at: number } | null = null;

function accessToken(): string {
  // gcloud tokens last an hour (and gcloud may hand back a cached one that's already old), so
  // refresh after 20 minutes; a 401 also forces a refresh (see generate).
  if (!auth || Date.now() - auth.at > 20 * 60_000) {
    const value = execFileSync('gcloud', ['auth', 'print-access-token'], {
      encoding: 'utf8',
    }).trim();
    auth = { value, at: Date.now() };
  }
  return auth.value;
}

export interface GenRequest {
  model: string;
  system: string;
  prompt: string;
  jsonSchema?: Record<string, unknown>;
  thinking?: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';
  temperature?: number;
  media?: { mimeType: string; base64: string }[];
  maxOutputTokens?: number;
  /** Earlier turns, for a repair: the model's answer and the problems sent back. */
  history?: { role: 'user' | 'model'; text: string }[];
}

export interface GenResult {
  text: string;
  latencyMs: number;
  inTokens: number;
  outTokens: number;
  thoughtTokens: number;
}

/** USD per million tokens (input, output). Rough list prices, used only for the lab's cost log. */
const PRICE: Record<string, [number, number]> = {
  // Official list prices checked 2026-11-18 (AI Studio pricing page). 3.8 Flash is the intro
  // price through Dec 31; Argon and Carbon double on Dec 1.
  'gemini-3.8-flash': [0.75, 3.75],
  'gemini-4-hydrogen': [1.5, 7.5],
  'gemini-4-argon': [2.0, 10.0],
  'gemini-4-carbon': [2.0, 10.0],
  'gemini-3.5-flash': [0.3, 2.5],
  'gemini-3.5-flash-lite': [0.1, 0.4],
  // Assumed Pro list price (≤ 200k prompt); token counts are logged so cost can be recomputed.
  // (gemini-3.8-pro is not served to the project on `global`; the newest Pro is 3.1 preview.)
  'gemini-3.1-pro-preview': [2.0, 12.0],
};

export const usage = { calls: 0, inTokens: 0, outTokens: 0, usd: 0 };
let ledgerPath: string | null = null;
export function setLedger(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  ledgerPath = path;
}

export async function generate(req: GenRequest): Promise<GenResult> {
  const url = `https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/global/publishers/google/models/${req.model}:generateContent`;
  const contents = [
    ...(req.history ?? []).map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
  ];
  const userParts: unknown[] = [{ text: req.prompt }];
  for (const m of req.media ?? [])
    userParts.push({ inlineData: { mimeType: m.mimeType, data: m.base64 } });
  // A repair keeps the first prompt first; the new prompt goes last.
  contents.push({ role: 'user', parts: userParts as never });
  const body = {
    systemInstruction: { parts: [{ text: req.system }] },
    contents,
    generationConfig: {
      temperature: req.temperature ?? 0.2,
      maxOutputTokens: req.maxOutputTokens ?? 32_000,
      ...(req.jsonSchema
        ? { responseMimeType: 'application/json', responseJsonSchema: req.jsonSchema }
        : {}),
      ...(req.thinking ? { thinkingConfig: { thinkingLevel: req.thinking } } : {}),
    },
  };
  const started = Date.now();
  let lastErr = '';
  // Gemini 4 long decode: a hop that hits the per-request cap ends with finishReason
  // CONTINUATION and a continuationToken; the same request is sent again with the token
  // (top level), without the partial output, and the hops' text is joined.
  let token: string | undefined;
  let reauthed = false;
  let joined = '';
  let total = { inTokens: 0, outTokens: 0, thoughtTokens: 0 };
  for (let attempt = 0; attempt < 12; attempt++) {
    const res = await postJson(
      url,
      accessToken(),
      JSON.stringify(token ? { ...body, continuationToken: token } : body),
    );
    if (res.status === 401 && !reauthed) {
      // An expired access token: fetch a fresh one and send the same request again.
      reauthed = true;
      auth = null;
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      lastErr = `${res.status} ${(await res.text()).slice(0, 200)}`;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`${req.model}: ${res.status} ${(await res.text()).slice(0, 400)}`);
    const json = (await res.json()) as {
      candidates?: {
        content?: { parts?: { text?: string; thought?: boolean }[] };
        finishReason?: string;
        continuationToken?: string;
      }[];
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        thoughtsTokenCount?: number;
      };
    };
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('');
    const u = json.usageMetadata ?? {};
    const inTokens = u.promptTokenCount ?? 0;
    const thoughtTokens = u.thoughtsTokenCount ?? 0;
    const outTokens = (u.candidatesTokenCount ?? 0) + thoughtTokens;
    const [pi, po] = PRICE[req.model] ?? [0.3, 2.5];
    const usd = (inTokens * pi + outTokens * po) / 1e6;
    usage.calls++;
    usage.inTokens += inTokens;
    usage.outTokens += outTokens;
    usage.usd += usd;
    const latencyMs = Date.now() - started;
    if (ledgerPath)
      appendFileSync(
        ledgerPath,
        `${JSON.stringify({ at: new Date().toISOString(), model: req.model, inTokens, outTokens, usd: Number(usd.toFixed(5)), latencyMs, finish: json.candidates?.[0]?.finishReason, hop: token ? 'continuation' : 'first' })}\n`,
      );
    joined += text;
    total = {
      inTokens: total.inTokens + inTokens,
      outTokens: total.outTokens + outTokens,
      thoughtTokens: total.thoughtTokens + thoughtTokens,
    };
    const cand = json.candidates?.[0];
    if (cand?.finishReason === 'CONTINUATION' && cand.continuationToken) {
      token = cand.continuationToken;
      continue;
    }
    if (!joined)
      throw new Error(`${req.model}: empty answer (${cand?.finishReason ?? 'no candidate'})`);
    return { text: joined, latencyMs, ...total };
  }
  throw new Error(`${req.model}: gave up after retries (${lastErr})`);
}

/** The first JSON object in a model answer (tolerates code fences and stray prose). */
export function parseJson(text: string): unknown {
  const t = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error('answer is not JSON');
  }
}
