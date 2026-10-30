// Texts, constants and the pure layout of the pmc tile. Nothing is drawn or fetched here.
// Text widths come in through measure(). Every cell carries its text rect, so the view computes no coordinates.
import { SPLITTER, ROW_H, PAD, EM, TILE_MIN } from './metrics.js';
import { TEXT_Y } from './chrome.js';

// Texts of the pmc view; they move to texts.js with the other interface texts.
export const TEXTS = Object.freeze({
  nameColumn: 'Name', sizeColumn: 'Size', modifiedColumn: 'Modified',
  up: '..', upKind: 'UP--DIR', folderKind: 'SUB-DIR', empty: '(empty)', quickView: 'quick view', root: '/', total: 'Total',
});
// Labels of the pmc key bar, left to right.
export const KEY_LABELS = Object.freeze(['Enter', 'F3', 'Tab', 'Esc', 'Ctrl+PgUp', 'letters']);
// Size and Modified widths in px, as in the prototype explorer.html (grid-template-columns 1fr 56px 70px); Name is the rest.
export const SIZE_W = 56;
export const DATE_W = 70;
// Name column minimum: 20 em, as in the README.
export const NAME_MIN_W = 20 * EM;
export const PANEL_COUNT = 2;
export const HEAD_ROWS = 2; // path and column names at the top of a panel
export const FOOTER_ROWS = 2; // file info line and key bar at the bottom of the tile
const LINE_W = 1; // vertical line between columns
// The info line reserves the width of this sample for the total: its label and up to ten digits.
const TOTAL_SAMPLE = `${TEXTS.total} 9999999999`;

// A rect is a caller contract: integer x, y, w, h, at least the pmc minimum. Throws with the reason before drawing.
function checkRect(rect) {
  const { x, y, w, h } = rect ?? {};
  if (![x, y, w, h].every(Number.isInteger)) {
    throw new Error(`pmc: rect needs integer x, y, w and h, got ${JSON.stringify(rect)}`);
  }
  if (w < TILE_MIN.pmc.w || h < TILE_MIN.pmc.h) {
    throw new Error(`pmc: rect is ${w}x${h}, minimum is ${TILE_MIN.pmc.w}x${TILE_MIN.pmc.h}`);
  }
}

// A cell: rect for fills, and text rect for drawing. The text sits PAD in from the left and is centred vertically.
function cell(x, y, w, h) {
  return { rect: { x, y, w, h }, text: { x: x + PAD, y: y + TEXT_Y, w: w - 2 * PAD } };
}

// Name, Size and Modified of a panel frame as x and width; Name takes what Size and Modified leave.
function columnsOf(frame) {
  const nameW = frame.w - SIZE_W - DATE_W;
  if (nameW < NAME_MIN_W) {
    throw new Error(`pmc: panel is ${frame.w}px, its Name column would be ${nameW}px, minimum is ${NAME_MIN_W}px`);
  }
  return {
    name: { x: frame.x, w: nameW },
    size: { x: frame.x + nameW, w: SIZE_W },
    date: { x: frame.x + frame.w - DATE_W, w: DATE_W },
  };
}

// One panel: path row, column names, column lines, and one slot per visible list row.
// A slot holds the row cell (the cursor bar) and the name, size and date cells.
function panelOf(frame) {
  const cols = columnsOf(frame);
  const headY = frame.y + ROW_H;
  const head = (col) => cell(col.x, headY, col.w, ROW_H);
  const slotAt = (row) => {
    const y = frame.y + (HEAD_ROWS + row) * ROW_H;
    return {
      row: cell(frame.x, y, frame.w, ROW_H),
      name: cell(cols.name.x, y, cols.name.w, ROW_H),
      size: cell(cols.size.x, y, cols.size.w, ROW_H),
      date: cell(cols.date.x, y, cols.date.w, ROW_H),
    };
  };
  const visible = Math.floor((frame.h - HEAD_ROWS * ROW_H) / ROW_H);
  return {
    frame,
    path: cell(frame.x, frame.y, frame.w, ROW_H),
    head: { name: head(cols.name), size: head(cols.size), date: head(cols.date) },
    lines: [cols.size.x, cols.date.x].map((x) => ({ x, y: headY, w: LINE_W, h: frame.y + frame.h - headY })),
    slots: Array.from({ length: visible }, (_, row) => slotAt(row)),
  };
}

// Each label in a cell of its text width plus PAD on both sides; cells follow each other with PAD between them.
function keyCells(bar, measure) {
  let x = bar.x + PAD;
  return KEY_LABELS.map((label) => {
    const w = measure(label) + 2 * PAD;
    const placed = cell(x, bar.y, w, bar.h);
    x += w + PAD;
    return { label, ...placed };
  });
}

// Two equal halves with SPLITTER between them; the right half takes an odd pixel. measure(text) gives a text width in px.
export function layoutPmc(rect, measure) {
  checkRect(rect);
  const { x, y, w, h } = rect;
  const leftW = Math.floor((w - SPLITTER) / 2);
  const panelH = h - FOOTER_ROWS * ROW_H;
  const frames = [
    { x, y, w: leftW, h: panelH },
    { x: x + leftW + SPLITTER, y, w: w - SPLITTER - leftW, h: panelH },
  ];
  const infoY = y + panelH;
  const totalW = measure(TOTAL_SAMPLE) + 2 * PAD;
  const keyBar = { x, y: y + h - ROW_H, w, h: ROW_H };
  return {
    panels: frames.map((frame) => panelOf(frame)),
    splitter: { x: x + leftW, y, w: SPLITTER, h: panelH },
    info: {
      name: cell(x, infoY, w - totalW, ROW_H),
      total: cell(x + w - totalW, infoY, totalW, ROW_H),
    },
    keys: { bar: keyBar, cells: keyCells(keyBar, measure) },
  };
}
