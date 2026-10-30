// Note layout: parsed Markdown blocks become positioned items in (0, 0, width, height). Pure, no drawing.
// Inline pieces are placed by note_inline.js.
import { TEXT, TEXT_BRIGHT, TEXT_DIM, WELL_BG, WELL_TEXT, BEVEL_DARK, BEVEL_LIGHT } from './theme.js';
import { PAD } from './metrics.js';
import { GLYPH_H, BODY_FONT, BOX_PAD_Y, RULE_H, describe, newFlow, newLine, placeInlines, placeWords } from './note_inline.js';

// First-level heading is drawn at scale 2; the second level at scale 1.
const H1_SCALE = 2;
const H2_SCALE = 1;
const CODE_FONT = 'ega';
const BLOCK_GAP = 6;
// List marker: a square on the margin (x = 0), centred on the body line; the text starts at LIST_INDENT.
const LIST_MARK = 2;
const LIST_INDENT = 12;
const LIST_MARK_DY = BOX_PAD_Y + (GLYPH_H[BODY_FONT] - LIST_MARK) / 2;
// Quote: a bar of PAD / 2 pixels, then QUOTE_GAP to the text.
const QUOTE_BAR_W = PAD / 2;
const QUOTE_GAP = 6;
// Code well: padding around the code lines.
const CODE_PAD = 4;
// EGA glyph advance in px.
const CODE_ADVANCE = 8;
// Widths below this value are refused: an EGA glyph must fit between the CODE_PAD margins,
// and the list and quote indents must fit too.
const MIN_WIDTH = Math.max(LIST_INDENT, QUOTE_BAR_W + QUOTE_GAP, 2 * CODE_PAD + CODE_ADVANCE);

// Places heading text; returns the y under its line and the width of the text.
function placeHeading(block, at, scale, color) {
  const start = at.items.length;
  // A key in the heading gets BOX_PAD_Y above and below its label; a heading without keys keeps its height.
  const pad = block.inlines.some(node => node.type === 'key') ? BOX_PAD_Y : 0;
  const flow = newFlow({ ...at, scale, left: 0, color, lineH: GLYPH_H[BODY_FONT] * scale + 2 * pad, textDy: pad });
  placeInlines(flow, block.inlines);
  const extent = Math.max(0, ...at.items.slice(start).map(item => item.x + item.w));
  return { ruleY: flow.y + flow.lineH, extent };
}

// h1: text, then a groove of two one-pixel rows under it, dark above and light below,
// as wide as the widest line of the heading.
function layoutH1(block, at) {
  const { ruleY, extent } = placeHeading(block, at, H1_SCALE, TEXT_BRIGHT);
  at.items.push(
    { kind: 'rect', x: 0, y: ruleY, w: extent, h: RULE_H, color: BEVEL_DARK },
    { kind: 'rect', x: 0, y: ruleY + RULE_H, w: extent, h: RULE_H, color: BEVEL_LIGHT },
  );
  return ruleY + 2 * RULE_H;
}

// h2: text, then a dotted rule across the note width.
function layoutH2(block, at) {
  const { ruleY } = placeHeading(block, at, H2_SCALE, TEXT);
  at.items.push({ kind: 'dotted', x: 0, y: ruleY, w: at.width, h: RULE_H, color: TEXT_DIM });
  return ruleY + RULE_H;
}

function layoutParagraph(block, at) {
  const flow = newFlow({ ...at, left: 0, color: TEXT });
  placeInlines(flow, block.inlines);
  return flow.y + flow.lineH;
}

function layoutList(block, at) {
  let y = at.y;
  for (const inlines of block.items) {
    at.items.push({ kind: 'rect', x: 0, y: y + LIST_MARK_DY, w: LIST_MARK, h: LIST_MARK, color: TEXT });
    const flow = newFlow({ ...at, y, left: LIST_INDENT, width: at.width - LIST_INDENT, color: TEXT });
    placeInlines(flow, inlines);
    y = flow.y + flow.lineH;
  }
  return y;
}

function layoutQuote(block, at) {
  const left = QUOTE_BAR_W + QUOTE_GAP;
  const flow = newFlow({ ...at, left, width: at.width - left, color: TEXT });
  placeInlines(flow, block.inlines);
  const bottom = flow.y + flow.lineH;
  at.items.push({ kind: 'rect', x: 0, y: at.y, w: QUOTE_BAR_W, h: bottom - at.y, color: TEXT_DIM });
  return bottom;
}

// The well is pushed before its text, so it is drawn underneath; its height is known once the lines are placed.
// Code keeps its spaces: indentation and double spaces are part of the code.
function layoutCode(block, at) {
  const well = { kind: 'rect', x: 0, y: at.y, w: at.width, h: 0, color: WELL_BG };
  at.items.push(well);
  const flow = newFlow({
    items: at.items, font: CODE_FONT, left: CODE_PAD, width: at.width - 2 * CODE_PAD, y: at.y + CODE_PAD,
    color: WELL_TEXT, lineH: GLYPH_H[CODE_FONT], textDy: 0,
  });
  for (const line of block.lines) {
    placeWords(flow, line, WELL_TEXT, false, true);
    newLine(flow);
  }
  well.h = flow.y + CODE_PAD - at.y;
  return flow.y + CODE_PAD;
}

function layoutRule(_block, at) {
  at.items.push({ kind: 'rect', x: 0, y: at.y, w: at.width, h: RULE_H, color: TEXT_DIM });
  return at.y + RULE_H;
}

const BLOCK_LAYOUTS = {
  h1: layoutH1,
  h2: layoutH2,
  paragraph: layoutParagraph,
  list: layoutList,
  quote: layoutQuote,
  code: layoutCode,
  rule: layoutRule,
};

// Positions the blocks in (0, 0, width, height); text wraps at width, the height is not limited.
// An atomic piece (key, spoiler, one glyph) wider than the line starts at the left margin and runs past the right edge;
// drawNote clips to the note rect.
// Spoiler ids count from 1 in document order across all blocks; the counter does not depend on width.
export function noteLayout(blocks, width) {
  if (!Array.isArray(blocks)) throw new TypeError(`noteLayout: blocks must be an array, got ${describe(blocks)}`);
  if (!Number.isInteger(width) || width < MIN_WIDTH) {
    throw new RangeError(`noteLayout: width must be an integer of at least ${MIN_WIDTH} px, got ${width}`);
  }
  const items = [];
  const spoilers = { next: 1 };
  let y = 0;
  blocks.forEach((block, index) => {
    if (index > 0) y += BLOCK_GAP;
    if (!Object.hasOwn(BLOCK_LAYOUTS, block?.type)) throw new Error(`noteLayout: unknown block type ${describe(block?.type)}`);
    y = BLOCK_LAYOUTS[block.type](block, { items, y, width, font: BODY_FONT, spoilers });
  });
  return { items, height: y };
}
