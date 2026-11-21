// Reel media lab (spec 26, dev only): fetches every picture a reel plan asks for, so contact
// sheets and renders show real logos, illustrations, photos and site screenshots before the
// product resolver exists. Uses the developer's gcloud login for the image model.
//
//   npx tsx scripts/reel-media-lab.ts <plan.json> <outDir> [--look mono|cream]
//
// Writes <outDir>/plan.json (requests carry asset ids) and <outDir>/images.json
// ({ assetId: { file, w, h } }) for `reel-dev.ts --images`.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  ReelPlanSchema,
  reelMediaKey,
  reelMediaOf,
  setReelMediaAssets,
  type ReelMedia,
} from '@motionpop/schemas';
import sharp from 'sharp';
import { illustrationPrompt, logoSlugs, splitLogoQuery } from '../src/reel/media-query';

const [planArg, outArg, ...rest] = process.argv.slice(2);
if (!planArg || !outArg) throw new Error('usage: reel-media-lab <plan.json> <outDir>');
const flag = (n: string, d: string) => {
  const i = rest.indexOf(`--${n}`);
  return i >= 0 ? (rest[i + 1] ?? d) : d;
};
const plan = ReelPlanSchema.parse(JSON.parse(readFileSync(planArg, 'utf8')));
const look = (flag('look', plan.look) as 'mono' | 'cream') ?? plan.look;
const out = resolve(outArg);
const imgDir = join(out, 'images');
mkdirSync(imgDir, { recursive: true });

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/139 Safari/537.36';

async function fetchBuf(url: string): Promise<{ buf: Buffer; type: string } | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    if (!r.ok) return null;
    return { buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') ?? '' };
  } catch {
    return null;
  }
}

async function logo(q: string): Promise<Buffer | null> {
  for (const slug of logoSlugs(q)) {
    const r = await fetchBuf(`https://cdn.simpleicons.org/${slug}`);
    if (r && r.type.includes('svg')) {
      return sharp(r.buf, { density: 600 }).resize(512, 512, { fit: 'inside' }).png().toBuffer();
    }
  }
  const hint = splitLogoQuery(q);
  const domain =
    hint.domain ??
    (/\./.test(hint.name)
      ? hint.name.replace(/^https?:\/\//, '').split('/')[0]!
      : `${logoSlugs(q)[0]}.com`);
  const fav = await fetchBuf(`https://www.google.com/s2/favicons?domain=${domain}&sz=256`);
  if (fav && fav.buf.length > 1500)
    return sharp(fav.buf).resize(256, 256, { fit: 'inside' }).png().toBuffer();
  return null;
}

let tokenCache = '';
const token = () =>
  (tokenCache ||= execFileSync('gcloud', ['auth', 'print-access-token'], {
    encoding: 'utf8',
  }).trim());
const project =
  process.env['MP_GCP_PROJECT'] ??
  execFileSync('gcloud', ['config', 'get-value', 'project'], { encoding: 'utf8' }).trim();
let imageCalls = 0;

async function generateImage(prompt: string, aspect: string): Promise<Buffer | null> {
  const model = flag('image-model', 'gemini-nano-banana-2.1');
  const url = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['IMAGE'],
          imageConfig: { aspectRatio: aspect, imageSize: '1K' },
        },
      }),
    });
    imageCalls++;
    if (r.status === 429) {
      await new Promise((res) => setTimeout(res, 4000 * (attempt + 1)));
      continue;
    }
    const j = (await r.json()) as {
      candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[];
      error?: { message?: string };
    };
    const data = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData
      ?.data;
    if (data) return Buffer.from(data, 'base64');
    console.error('image failed', r.status, j.error?.message ?? JSON.stringify(j).slice(0, 300));
    return null;
  }
  return null;
}

async function photo(q: string): Promise<Buffer | null> {
  const api = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=8&gsrsearch=${encodeURIComponent(`${q} filetype:bitmap`)}&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1280`;
  const r = await fetchBuf(api);
  if (r) {
    const j = JSON.parse(r.buf.toString()) as {
      query?: {
        pages?: Record<
          string,
          { imageinfo?: { thumburl?: string; width?: number; height?: number; mime?: string }[] }
        >;
      };
    };
    const cands = Object.values(j.query?.pages ?? {})
      .map((p) => p.imageinfo?.[0])
      .filter((i) => i?.thumburl && i.mime === 'image/jpeg' && (i.width ?? 0) >= 900);
    for (const c of cands) {
      const b = await fetchBuf(c!.thumburl!);
      if (b) return b.buf;
    }
  }
  // No usable stock picture: a generated photograph.
  return generateImage(
    `${q}, documentary photograph, natural light, shallow depth of field, no text, no logos, no identifiable people`,
    '4:3',
  );
}

async function screenshot(q: string): Promise<Buffer | null> {
  const puppeteer = await import('puppeteer');
  const url = /^https?:/.test(q) ? q : `https://${q.replace(/^www\./, '')}`;
  const browser = await puppeteer.default.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 1200));
    const buf = (await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: 1280, height: 2000 },
      captureBeyondViewport: true,
    })) as Uint8Array;
    return Buffer.from(buf);
  } catch (e) {
    console.error('screenshot failed', url, e);
    return null;
  } finally {
    await browser.close();
  }
}

const requests = new Map<string, ReelMedia>();
for (const m of reelMediaOf(plan)) requests.set(reelMediaKey(m), m);
const assets: Record<string, string> = {};
const images: Record<string, { file: string; w: number; h: number }> = {};
for (const [key, m] of requests) {
  const id = `rm-${createHash('sha256').update(`${look}|${key}`).digest('hex').slice(0, 12)}`;
  const file = join(imgDir, `${id}.png`);
  let buf: Buffer | null = existsSync(file) ? readFileSync(file) : null;
  const t0 = Date.now();
  if (!buf) {
    if (m.kind === 'logo') buf = await logo(m.query);
    else if (m.kind === 'illustration')
      buf = await generateImage(illustrationPrompt(look, m.query), '1:1');
    else if (m.kind === 'photo') buf = await photo(m.query);
    else buf = await screenshot(m.query);
    if (buf) {
      buf = await sharp(buf).png().toBuffer();
      writeFileSync(file, buf as Buffer);
    }
  }
  if (!buf) {
    console.log(`✗ ${key}`);
    continue;
  }
  const meta = await sharp(buf).metadata();
  assets[key] = id;
  images[id] = { file, w: meta.width ?? 512, h: meta.height ?? 512 };
  console.log(`✓ ${key} → ${id} ${meta.width}x${meta.height} (${Date.now() - t0} ms)`);
}
writeFileSync(join(out, 'plan.json'), JSON.stringify(setReelMediaAssets(plan, assets), null, 1));
writeFileSync(join(out, 'images.json'), JSON.stringify(images, null, 1));
console.log(
  `${Object.keys(images).length}/${requests.size} pictures, ${imageCalls} image-model calls`,
);
