// Draws the favicon Mf: the M button of the title bar (raised 1 px bevel C.hi/C.lo on C.win) with M and f of
// rv_font in C.bright, and writes it as site/favicon-16.png and a nearest x2 copy, site/favicon-32.png.
// Usage: node tools/favicon.js
import { writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { C } from '../site/js/theme.js';
import { RV_FONT } from '../site/js/font_data.js';

const N = 16;
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const px = Array.from({ length: N * N }, () => rgb(C.win));
const fill = (x, y, w, h, color) => {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px[j * N + i] = rgb(color);
};

// The bevel as Paint.bevel draws it: light top and left first, then dark bottom and right over the corners.
fill(0, 0, N, 1, C.hi);
fill(0, 0, 1, N, C.hi);
fill(0, N - 1, N, 1, C.lo);
fill(N - 1, 0, 1, N, C.lo);

// Two glyphs of 5x7 ink, advance 6: 11 px across, centered.
const x0 = Math.floor((N - 11) / 2), y0 = Math.floor((N - 7) / 2);
[...'Mf'].forEach((ch, k) => {
  RV_FONT[ch.codePointAt(0)].forEach((row, j) => {
    for (let c = 0; c < 8; c++) if ((row >> (7 - c)) & 1) fill(x0 + 6 * k + c, y0 + j, 1, 1, C.bright);
  });
});

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

// An 8-bit RGB PNG of the picture scaled by s, nearest neighbour.
function png(s) {
  const size = N * s;
  const raw = Buffer.alloc(size * (1 + 3 * size));
  for (let y = 0; y < size; y++) {
    const at = y * (1 + 3 * size);
    for (let x = 0; x < size; x++) Buffer.from(px[Math.floor(y / s) * N + Math.floor(x / s)]).copy(raw, at + 1 + 3 * x);
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0);
  head.writeUInt32BE(size, 4);
  head.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const site = new URL('../site/', import.meta.url);
writeFileSync(new URL('favicon-16.png', site), png(1));
writeFileSync(new URL('favicon-32.png', site), png(2));
