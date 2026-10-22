#!/usr/bin/env node
/**
 * Generates the app icons from one vector mark (A1 "Switchboard Soft": indigo-cobalt to violet
 * gradient, soft rounded tile, a white "P" whose top is a roof and whose counter is a little house,
 * with two call waves at its shoulder).
 *
 * Run from apps/web:  node scripts/generate-icons.mjs
 * Needs `sharp`, which Next installs as an optional dependency. Output is committed:
 *   public/icons/icon.svg            favicon for modern browsers (rounded tile)
 *   public/icons/icon-192.png        manifest, purpose "any" (rounded tile, transparent corners)
 *   public/icons/icon-512.png        manifest, purpose "any"
 *   public/icons/icon-maskable-512.png  manifest, purpose "maskable" (full bleed, mark in the safe zone)
 *   public/icons/apple-touch-icon.png   180, full bleed (iOS rounds it)
 *   public/favicon.ico               16/32/48 PNG-in-ICO
 *
 * The two colours are the light-theme --primary and --primary-end tokens in src/app/globals.css.
 * An icon file can't read CSS variables, so keep them in step if the tokens ever change.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRIMARY = '#3446f0';
const PRIMARY_END = '#5b4df5';
const MARK_COLOUR = '#ffffff';

/** The mark, drawn on a 512 grid and centred on (256, 256). */
const MARK = `
  <g transform="translate(-50 8)">
    <path fill="${MARK_COLOUR}" stroke="${MARK_COLOUR}" stroke-width="24" stroke-linejoin="round"
      fill-rule="evenodd"
      d="M172 380 V178 L262 118 L352 178 V262 C352 290 330 312 302 312 H232 V380 Z
         M228 202 L262 178 L296 202 V266 H228 Z" />
    <g fill="none" stroke="${MARK_COLOUR}" stroke-width="22" stroke-linecap="round">
      <path d="M392 150 A60 60 0 0 1 418 214" opacity="0.92" />
      <path d="M408 102 A112 112 0 0 1 462 222" opacity="0.6" />
    </g>
  </g>`;

/**
 * @param {{ rounded: boolean, markScale: number }} options
 *   rounded: a soft tile with transparent corners (favicon, "any"); otherwise full bleed.
 *   markScale: how much of the tile the mark fills (maskable icons keep it inside the safe zone).
 */
function iconSvg({ rounded, markScale }) {
  const radius = rounded ? 116 : 0;
  const offset = 256 * (1 - markScale);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${PRIMARY}" />
      <stop offset="1" stop-color="${PRIMARY_END}" />
    </linearGradient>
    <radialGradient id="sheen" cx="0.22" cy="0.12" r="0.9">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.22" />
      <stop offset="0.6" stop-color="#ffffff" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="${radius}" fill="url(#g)" />
  <rect width="512" height="512" rx="${radius}" fill="url(#sheen)" />
  <g transform="translate(${offset} ${offset}) scale(${markScale})">${MARK}</g>
</svg>
`;
}

const png = (svg, size) =>
  sharp(Buffer.from(svg), { density: 72 * (size / 512) * 4 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();

/** An .ico whose entries are PNGs (supported by every browser that still asks for one). */
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

async function out(path, data) {
  const file = join(WEB, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, data);
  console.log(`wrote ${path}`);
}

const rounded = iconSvg({ rounded: true, markScale: 1 });
const fullBleed = iconSvg({ rounded: false, markScale: 1 });
// Maskable: the safe zone is a circle of 80% diameter; 0.74 keeps the waves inside it.
const maskable = iconSvg({ rounded: false, markScale: 0.74 });
// Small sizes: the far wave turns to mush at 16px, a slightly larger mark reads better.
const small = iconSvg({ rounded: true, markScale: 1.06 });

await out('public/icons/icon.svg', rounded);
await out('public/icons/icon-192.png', await png(rounded, 192));
await out('public/icons/icon-512.png', await png(rounded, 512));
await out('public/icons/icon-maskable-512.png', await png(maskable, 512));
await out('public/icons/apple-touch-icon.png', await png(fullBleed, 180));
await out(
  'public/favicon.ico',
  ico(
    await Promise.all(
      [16, 32, 48].map(async (size) => ({
        size,
        data: await png(small, size),
      })),
    ),
  ),
);
