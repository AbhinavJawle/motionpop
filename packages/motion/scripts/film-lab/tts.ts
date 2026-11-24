// Film lab: one voiceover from a script with Gemini TTS on the `global` endpoint (developer's
// gcloud login, like gemini.ts). Not product code: the product speaks through packages/ai/speech.ts.
// Usage: node scripts/run-film-lab.ts tts <script.txt> <out.wav> [--voice Charon]
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const [scriptPath, out] = args;
if (!scriptPath || !out) throw new Error('usage: tts <script.txt> <out.wav> [--voice Charon]');
const vi = args.indexOf('--voice');
const voice = vi >= 0 ? (args[vi + 1] ?? 'Charon') : 'Charon';
const model = 'gemini-3.8-flash-tts';
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

const project = resolveProject();
const text = readFileSync(scriptPath, 'utf8').trim();
const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
const started = Date.now();
const res = await fetch(
  `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    }),
  },
);
if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 400)}`);
const json = (await res.json()) as {
  candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};
const chunks = (json.candidates?.[0]?.content?.parts ?? [])
  .map((p) => p.inlineData)
  .filter((d): d is { mimeType: string; data: string } => !!d?.data && !!d.mimeType?.startsWith('audio/'))
  .map((d) => Buffer.from(d.data, 'base64'));
const pcm = Buffer.concat(chunks);
if (pcm.length < 24_000) throw new Error('empty voice');
const rate = 24_000;
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(rate, 24);
header.writeUInt32LE(rate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);
writeFileSync(out, Buffer.concat([header, pcm]));
const u = json.usageMetadata ?? {};
// TTS list price (rough): $0.50 / M input text tokens, $10 / M output audio tokens.
const usd = ((u.promptTokenCount ?? 0) * 0.5 + (u.candidatesTokenCount ?? 0) * 10) / 1e6;
const pkgDir = process.env['MOTION_PKG_DIR'] ?? process.cwd();
appendFileSync(
  join(pkgDir, '.check', 'film-lab', 'ledger.jsonl'),
  `${JSON.stringify({ at: new Date().toISOString(), model, inTokens: u.promptTokenCount, outTokens: u.candidatesTokenCount, usd: Number(usd.toFixed(5)), latencyMs: Date.now() - started })}\n`,
);
console.log(`${out}: ${Math.round((pcm.length / 2 / rate) * 1000)} ms, ~$${usd.toFixed(4)}, ${Date.now() - started} ms`);
