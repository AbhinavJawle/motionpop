// Seeded, dependency-free texture tiles (greyscale PNG) for the compiler's grain and paper layers.
import { deflateSync } from 'node:zlib';
// @ts-expect-error TS5097: Node runs these scripts with type stripping and needs the .ts extension
import { mulberry32 } from '../src/core/rng.ts';

const GRAIN_SIZE = 256;
const PAPER_SIZE = 512;
const PAPER_CELL = 8;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Encodes 8-bit greyscale pixels (row-major, width*height bytes) as a PNG. */
function encodeGreyPng(width: number, height: number, pixels: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // colour type: greyscale
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // no interlace
  const raw = Buffer.alloc((width + 1) * height); // filter byte 0 per scanline
  for (let y = 0; y < height; y++) {
    raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from(PNG_SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

/** 256×256 greyscale noise, each pixel uniform 0–255. Seamless by construction. */
export function grainTile(seed: number): Buffer {
  const rng = mulberry32(seed);
  const pixels = new Uint8Array(GRAIN_SIZE * GRAIN_SIZE);
  for (let i = 0; i < pixels.length; i++) pixels[i] = Math.floor(rng() * 256);
  return encodeGreyPng(GRAIN_SIZE, GRAIN_SIZE, pixels);
}

/** 512×512 value noise in 200–255 on an 8 px grid, bilinear and wrapping (seamless). */
export function paperTile(seed: number): Buffer {
  const rng = mulberry32(seed);
  const cells = PAPER_SIZE / PAPER_CELL;
  const lattice = new Float64Array(cells * cells);
  for (let i = 0; i < lattice.length; i++) lattice[i] = 200 + Math.floor(rng() * 56);
  const at = (cx: number, cy: number): number =>
    lattice[(cy % cells) * cells + (cx % cells)] as number;
  const pixels = new Uint8Array(PAPER_SIZE * PAPER_SIZE);
  for (let y = 0; y < PAPER_SIZE; y++) {
    const cy = Math.floor(y / PAPER_CELL);
    const fy = (y % PAPER_CELL) / PAPER_CELL;
    for (let x = 0; x < PAPER_SIZE; x++) {
      const cx = Math.floor(x / PAPER_CELL);
      const fx = (x % PAPER_CELL) / PAPER_CELL;
      const top = at(cx, cy) * (1 - fx) + at(cx + 1, cy) * fx;
      const bottom = at(cx, cy + 1) * (1 - fx) + at(cx + 1, cy + 1) * fx;
      pixels[y * PAPER_SIZE + x] = Math.round(top * (1 - fy) + bottom * fy);
    }
  }
  return encodeGreyPng(PAPER_SIZE, PAPER_SIZE, pixels);
}

function dataUrl(png: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
}

export function textureDataUrls(seed = 1): { grain: string; paper: string } {
  return { grain: dataUrl(grainTile(seed)), paper: dataUrl(paperTile(seed)) };
}
