// Bitmap text. The glyph tables come from font_data.js; text is drawn bit by bit, never by the browser's text engine.
import { RV_FONT, VGA_9X16 } from './font_data.js';

// rv_font: 8x8 cell, 5x7 ink, advance 6. Row bit 7 is the leftmost column.
export const RV = { glyphs: RV_FONT, cols: 8, rows: 8, advance: 6, bit: (row, c) => (row >> (7 - c)) & 1 };
// PxPlus IBM VGA 9x16: 9 columns, advance 9. Row bit 8 is the leftmost column.
export const VGA = { glyphs: VGA_9X16, cols: 9, rows: 16, advance: 9, bit: (row, c) => (row >> (8 - c)) & 1 };

// Characters the tables do not have, drawn as their nearest ASCII form. A glyph is one cell, so the width holds.
const SUBSTITUTE = {
  '│': '|', '─': '-', '—': '-', '–': '-', '·': '.', '…': '.', '×': 'x',
  '“': '"', '”': '"', '‘': "'", '’': "'", '→': '>', '←': '<', '›': '>', '‹': '<',
};

export function glyphOf(font, ch) {
  const code = ch.codePointAt(0);
  if (font.glyphs[code]) return font.glyphs[code];
  const sub = SUBSTITUTE[ch];
  return (sub && font.glyphs[sub.codePointAt(0)]) || font.glyphs[0];
}

// Width in CSS pixels of a string drawn with the font at an integer scale.
export function textWidth(font, text, scale = 1) {
  return [...text].length * font.advance * scale;
}

// The text cut to the longest prefix that fits the width.
export function fitText(font, text, width, scale = 1) {
  const chars = [...text];
  let n = chars.length;
  while (n > 0 && textWidth(font, chars.slice(0, n).join(''), scale) > width) n--;
  return chars.slice(0, n).join('');
}

// Cuts text into the longest pieces that fit the width; a piece never starts with a space.
export function wrapText(font, text, width, scale = 1) {
  const max = Math.max(1, Math.floor(width / (font.advance * scale)));
  const lines = [];
  for (const para of text.split('\n')) {
    let rest = para;
    do {
      if ([...rest].length <= max) { lines.push(rest); break; }
      const chars = [...rest];
      let cut = max;
      while (cut > 0 && chars[cut] !== ' ') cut--;
      if (cut === 0) cut = max;
      lines.push(chars.slice(0, cut).join('').replace(/\s+$/, ''));
      rest = chars.slice(cut).join('').replace(/^\s+/, '');
    } while (rest.length);
  }
  return lines;
}
