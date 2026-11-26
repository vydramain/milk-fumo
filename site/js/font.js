// Bitmap fonts for the default theme and a proportional browser font for win-55.
import { RV_FONT, VGA_9X16 } from './font_data.js';
import { theme } from './theme.js';

// rv_font: 8x8 cell, 5x7 ink, advance 6. Row bit 7 is the leftmost column.
export const RV = { glyphs: RV_FONT, cols: 8, rows: 8, advance: 6, bit: (row, c) => (row >> (7 - c)) & 1 };
// PxPlus IBM VGA 9x16: 9 columns, advance 9. Row bit 8 is the leftmost column.
export const VGA = { glyphs: VGA_9X16, cols: 9, rows: 16, advance: 9, bit: (row, c) => (row >> (8 - c)) & 1 };

// The line box leaves room for accents, descenders and an underline.
const win55 = { lineHeight: 18, lineTop: 3, family: '"Win55 UI Bitmap", sans-serif', rows: 12, ascent: 10 };
const measure = document.createElement('canvas').getContext('2d');
let win55Font = RV;

const url = new URL('../fonts/win55/Win55-Regular-12.ttf', import.meta.url);
async function loadWin55Font() {
  try {
    document.fonts.add(await new FontFace('Win55 UI Bitmap', `url("${url}")`).load());
    measure.font = `${win55.rows}px ${win55.family}`;
    measure.fontKerning = 'none';
    win55Font = win55;
    return true;
  } catch {
    return false;
  }
}

export const win55FontReady = loadWin55Font();

export function uiFont() {
  return theme === 'win-55' ? win55Font : RV;
}

// Box and rule characters that rv_font lacks, drawn as rows of its 8x8 cell: a middle dot, a vertical bar, and
// horizontal rules on the middle row (row 3 of the 7-row ink), in the same pixel weight as the letters.
const RULES = {
  0x00b7: [0, 0, 0, 0, 0b01000000, 0, 0, 0],                       // ·
  0x2502: [0b00100000, 0b00100000, 0b00100000, 0b00100000, 0b00100000, 0b00100000, 0b00100000, 0b00100000], // │
  0x2500: [0, 0, 0, 0b11111000, 0, 0, 0, 0],                       // ─
  0x2014: [0, 0, 0, 0b11111100, 0, 0, 0, 0],                       // —
};

// Characters the tables do not have, drawn as their nearest ASCII form. A glyph is one cell, so the width holds.
const SUBSTITUTE = {
  '│': '|', '─': '-', '—': '-', '·': '.', '–': '-', '…': '.', '×': 'x',
  '“': '"', '”': '"', '‘': "'", '’': "'", '→': '>', '←': '<', '›': '>', '‹': '<',
};

export function glyphOf(font, ch) {
  const code = ch.codePointAt(0);
  if (font.glyphs[code]) return font.glyphs[code];
  if (font === RV && RULES[code]) return RULES[code];
  const sub = SUBSTITUTE[ch];
  return (sub && font.glyphs[sub.codePointAt(0)]) || font.glyphs[0];
}

// Width in CSS pixels of a string drawn with the font at an integer scale.
export function textWidth(font, text, scale = 1) {
  if (font === win55) return Math.ceil(measure.measureText(text).width * scale);
  return [...text].length * font.advance * scale;
}

// The text cut to the longest prefix that fits the width.
export function fitText(font, text, width, scale = 1) {
  const chars = [...text];
  if (font !== win55) {
    const n = Math.max(0, Math.floor(width / (font.advance * scale)));
    return chars.slice(0, n).join('');
  }
  let lo = 0, hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textWidth(font, chars.slice(0, mid).join(''), scale) <= width) lo = mid;
    else hi = mid - 1;
  }
  return chars.slice(0, lo).join('');
}

// Cuts text into the longest pieces that fit the width; a piece never starts with a space.
export function wrapText(font, text, width, scale = 1) {
  const fixedMax = Math.max(1, Math.floor(width / (font.advance * scale)));
  const lines = [];
  for (const para of text.split('\n')) {
    let rest = para;
    do {
      const chars = [...rest];
      const max = font === win55 ? Math.max(1, [...fitText(font, rest, width, scale)].length) : fixedMax;
      if (chars.length <= max) { lines.push(rest); break; }
      let cut = max;
      while (cut > 0 && chars[cut] !== ' ') cut--;
      if (cut === 0) cut = max;
      lines.push(chars.slice(0, cut).join('').replace(/\s+$/, ''));
      rest = chars.slice(cut).join('').replace(/^\s+/, '');
    } while (rest.length);
  }
  return lines;
}
