// The generated glyph tables: the letter A has its known rows, and every glyph has the full cell height.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RV_FONT, VGA_9X16 } from '../site/js/font_data.js';
import { RV, VGA, wrapText, textWidth } from '../site/js/font.js';

test('rv_font: the letter A is the 5x7 glyph of pdklib, in an 8x8 cell', () => {
  assert.deepEqual(RV_FONT[65], [0x20, 0x50, 0x88, 0x88, 0xF8, 0x88, 0x88, 0x00]);
  assert.equal(RV_FONT[0].length, 8);
});

test('VGA 9x16: every glyph has 16 rows and the cell is 9 columns wide', () => {
  for (const [code, rows] of Object.entries(VGA_9X16)) {
    assert.equal(rows.length, 16, `glyph ${code}`);
    assert.ok(rows.every((r) => r < 512), `glyph ${code} has a bit beyond 9 columns`);
  }
});

test('text width is the advance times the characters; wrapping keeps words whole', () => {
  assert.equal(textWidth(RV, 'abc', 1), 18);
  assert.equal(textWidth(RV, 'ab', 2), 24);
  assert.deepEqual(wrapText(RV, 'one two three', 42), ['one two', 'three']);
  assert.equal(VGA.advance, 9);
});
