// Reel music lab (spec 27, dev only): generates a soundtrack from a brief with the developer's
// gcloud login (same provider and looping as the product route) and writes a stereo WAV.
// Usage: npx tsx scripts/reel-music-lab.ts "<brief>" <durationMs> <out.wav> [project]
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { decodeWavStereo16, encodeWavStereo16, loopReelMusic } from '../../motion/src/reel/music';
import { generateMusicClip, MUSIC_CLIP_USD } from '../src/providers/music';

const [brief, dur, out, project] = process.argv.slice(2) as [string, string, string, string?];
const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
const projectId =
  project ??
  execFileSync('gcloud', ['config', 'get-value', 'project'], { encoding: 'utf8' }).trim();
const clip = await generateMusicClip(brief, { projectId, accessToken: token });
const pcm = decodeWavStereo16(clip.wav);
if (!pcm) throw new Error('unreadable music');
writeFileSync(out.replace(/\.wav$/, '.clip.wav'), clip.wav);
writeFileSync(out, encodeWavStereo16(loopReelMusic(pcm, Number(dur))));
console.log(
  `${clip.model}: ${(pcm.left.length / pcm.sampleRate).toFixed(1)} s clip in ${clip.latencyMs} ms (~$${MUSIC_CLIP_USD}) -> ${out}`,
);
