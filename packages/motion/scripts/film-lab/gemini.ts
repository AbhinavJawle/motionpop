// Film lab: a small Vertex AI caller for experiments (docs/research/film-mode.md). Not product
// code: the product calls models through packages/ai and Firebase AI Logic. This talks to the
// same models on the same `global` endpoint with the developer's own gcloud login, so a lab run
// needs no App Check token and no browser.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const PROJECT = process.env['MP_GCP_PROJECT'] ?? 'motionpop-48409';
let token: { value: string; at: number } | null = null;

function accessToken(): string {
  // gcloud tokens last an hour; refresh after 40 minutes.
  if (!token || Date.now() - token.at > 40 * 60_000) {
    const value = execFileSync('gcloud', ['auth', 'print-access-token'], {
      encoding: 'utf8',
    }).trim();
    token = { value, at: Date.now() };
  }
  return token.value;
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
  'gemini-3.8-flash': [0.3, 2.5],
  'gemini-3.5-flash': [0.3, 2.5],
  'gemini-3.5-flash-lite': [0.1, 0.4],
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
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
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
        `${JSON.stringify({ at: new Date().toISOString(), model: req.model, inTokens, outTokens, usd: Number(usd.toFixed(5)), latencyMs, finish: json.candidates?.[0]?.finishReason })}\n`,
      );
    if (!text)
      throw new Error(
        `${req.model}: empty answer (${json.candidates?.[0]?.finishReason ?? 'no candidate'})`,
      );
    return { text, latencyMs, inTokens, outTokens, thoughtTokens };
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
