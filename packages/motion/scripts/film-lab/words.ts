// Film lab: word timings from local whisper.cpp (free, offline), written as a lab voiceover
// fixture. Usage: node scripts/run-film-lab.ts words <voice.wav> <id> "<title>"
// Writes docs/research/experiments/film-mode/<id>-voiceover.json and <id>-voice.m4a.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { FIXTURES } from './data';

const [wav, id, title] = process.argv.slice(2);
if (!wav || !id) throw new Error('usage: words <voice.wav> <id> "<title>"');
const model = join(homedir(), '.cache/hyperframes/whisper/models/ggml-small.en.bin');
if (!existsSync(model)) throw new Error(`no whisper model at ${model}`);
const tmp = mkdtempSync(join(tmpdir(), 'mp-words-'));
const wav16 = join(tmp, 'in.wav');
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', wav, '-ar', '16000', '-ac', '1', wav16]);
// -ml 1 -sow: one word per segment, split on words; -oj: JSON with offsets in ms.
execFileSync('whisper-cli', ['-m', model, '-f', wav16, '-ml', '1', '-sow', '-oj', '-of', join(tmp, 'out'), '-np']);
const j = JSON.parse(readFileSync(join(tmp, 'out.json'), 'utf8')) as {
  transcription: { text: string; offsets: { from: number; to: number } }[];
};
const words = j.transcription
  .map((s) => ({ text: s.text.trim(), startMs: s.offsets.from, endMs: s.offsets.to }))
  .filter((w) => w.text.length > 0 && !/^\[.*\]$/.test(w.text));
const durationMs = Math.round(
  Number(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav], {
      encoding: 'utf8',
    }).trim(),
  ) * 1000,
);
const audio = `${id}-voice.m4a`;
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', wav, '-c:a', 'aac', '-b:a', '128k', join(FIXTURES, audio)]);
writeFileSync(
  join(FIXTURES, `${id}-voiceover.json`),
  JSON.stringify({ id, title: title ?? id, durationMs, audio, words }, null, 1),
);
// The reel reads { words, durationMs }; same file works.
console.log(`${words.length} words, ${durationMs} ms → ${join(FIXTURES, `${id}-voiceover.json`)}`);
