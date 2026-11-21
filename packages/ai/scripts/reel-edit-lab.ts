// Lab: the cloud editor's review of a transcript's retake cuts (spec 28 R3).
// npx tsx scripts/reel-edit-lab.ts <phrases.json> <model> [thinking]
import { readFileSync } from 'node:fs';
import {
  REEL_EDIT_SYSTEM_V1,
  ReelEditOutputSchema,
  reelEditJsonSchema,
  reelEditPromptV1,
} from '../src/reel/edit';
import { generate, parseJson } from '../../motion/scripts/film-lab/gemini';

const [file, model, thinking] = process.argv.slice(2) as [string, string, string?];
const phrases = JSON.parse(readFileSync(file, 'utf8')) as [number, string, boolean][];
const res = await generate({
  model,
  system: REEL_EDIT_SYSTEM_V1,
  prompt: reelEditPromptV1({ phrases }),
  jsonSchema: reelEditJsonSchema(),
  ...(thinking ? { thinking: thinking as 'LOW' } : {}),
  maxOutputTokens: 4096,
});
console.log(JSON.stringify(ReelEditOutputSchema.parse(parseJson(res.text))), res.latencyMs, 'ms');
