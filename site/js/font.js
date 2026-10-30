// Bitmap text drawn with fillRect, one call per lit pixel: no browser text engine, so glyphs stay pixel-perfect.
import { RV_FONT, EGA_8X14, VGA_9X16 } from './font_data.js';

// Code of the space glyph; a character without a glyph is drawn as a space.
const SPACE_CODE = 32;

// Glyph width in pixels: 8 columns, one bit each, leftmost column is the highest bit of the byte.
const GLYPH_COLS = 8;
const LEFT_BIT = 0x80;

// Advance rv = 6 px, as in tools/build_rvfont.py.
const RV_ADVANCE = 6;
const RV_HEIGHT = 8;
// EGA and VGA advance is 8 px: the full 8 columns of the table.
const EGA_ADVANCE = 8;
const EGA_HEIGHT = 14;
// VGA glyphs are 9 columns wide in the editor; the 9th column is not drawn (owner decision pending).
const VGA_ADVANCE = 8;
const VGA_HEIGHT = 16;

// Font keys used by callers; table is the bitmap, height is bytes per glyph.
export const FONTS = {
  rv: { table: RV_FONT, advance: RV_ADVANCE, height: RV_HEIGHT },
  ega: { table: EGA_8X14, advance: EGA_ADVANCE, height: EGA_HEIGHT },
  vga: { table: VGA_9X16, advance: VGA_ADVANCE, height: VGA_HEIGHT },
};

// Unknown font key is a caller error: throw with the reason instead of drawing nothing.
function fontOf(name) {
  if (!Object.hasOwn(FONTS, name)) {
    throw new Error(`font: unknown font "${name}", expected one of ${Object.keys(FONTS).join(', ')}`);
  }
  return FONTS[name];
}

// Draws one glyph row by row; each lit bit is a scale x scale square at integer coordinates.
function drawGlyph(ctx, glyph, x, y, height, scale) {
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < GLYPH_COLS; col++) {
      if (glyph[row] & (LEFT_BIT >> col)) {
        ctx.fillRect(x + col * scale, y + row * scale, scale, scale);
      }
    }
  }
}

// Codes already reported as missing a glyph; each code is warned once, not on every call.
const warnedCodes = new Set();

// A missing glyph is drawn as a space and reported once per code.
function glyphOf(table, code) {
  if (table[code]) {
    return table[code];
  }
  if (!warnedCodes.has(code)) {
    warnedCodes.add(code);
    console.warn(`font: no glyph for code ${code}, drawn as a space`);
  }
  return table[SPACE_CODE];
}

// Scale is an integer multiple of the font's native size (README «Fonts»); anything else is a caller error.
function checkScale(scale) {
  if (!Number.isInteger(scale) || scale < 1) {
    throw new Error(`font: scale must be an integer >= 1, got ${scale}`);
  }
}

// Width in pixels of a text in the given font; one advance per code point, times scale.
export function measureText(text, font, scale = 1) {
  checkScale(scale);
  return [...text].length * fontOf(font).advance * scale;
}

// Draws text with its top-left corner at (x, y); color is a CSS color string.
// Coordinates must be integers, otherwise canvas smooths the pixels.
// Scale is applied to every pixel; the line height in pixels is height * scale, computed by the caller.
export function drawText(ctx, text, x, y, font, color, scale = 1) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new Error(`font: drawText needs integer coordinates, got x=${x}, y=${y}`);
  }
  checkScale(scale);
  const { table, advance, height } = fontOf(font);
  ctx.fillStyle = color;
  let pen = x;
  for (const ch of text) {
    drawGlyph(ctx, glyphOf(table, ch.codePointAt(0)), pen, y, height, scale);
    pen += advance * scale;
  }
}
