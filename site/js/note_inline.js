// Inline layout: words, keys and spoilers placed in a flow of lines. Pure: positions and kinds only, no drawing.
import { measureText } from './font.js';
import { TEXT, TEXT_BRIGHT, TEXT_DIM, SUNKEN, BLUE } from './theme.js';

// Glyph heights: 'rv' is the body font, 'ega' the code font.
export const GLYPH_H = { rv: 8, ega: 14 };
export const BODY_FONT = 'rv';
// Body line and key/spoiler box: BOX_PAD_X at the sides, BOX_PAD_Y above and below the glyphs.
export const BOX_PAD_X = 2;
export const BOX_PAD_Y = 2;
export const LINE_H = GLYPH_H[BODY_FONT] + 2 * BOX_PAD_Y;
// Underlines and rules are one pixel high.
export const RULE_H = 1;

export const describe = value => (value === null ? 'null' : typeof value);

// A flow places pieces left to right inside [left, left + width) and wraps them to the next line of lineH.
// An atomic piece (key, spoiler, one glyph) wider than the line starts at the left margin and runs past the right edge;
// drawNote clips to the note rect.
// spoilers is the counter of the whole note: each spoiler takes the next id.
export function newFlow({ items, font, scale = 1, left, width, y, color, spoilers, lineH = LINE_H, textDy = BOX_PAD_Y }) {
  return {
    items, font, scale, color, spoilers, left, right: left + width, lineH, textDy,
    glyphH: GLYPH_H[font] * scale, x: left, y,
  };
}

export function newLine(flow) {
  flow.x = flow.left;
  flow.y += flow.lineH;
}

const advance = (flow, text) => measureText(text, flow.font, flow.scale);

// A word moves to the next line when it does not fit; a word wider than the line is cut by characters.
// Each piece is drawn at the cursor; a link piece also gets a rule under it.
function placeWord(flow, word, color, underline) {
  const pieces = advance(flow, word) <= flow.right - flow.left ? [word] : [...word];
  for (const piece of pieces) {
    if (flow.x > flow.left && flow.x + advance(flow, piece) > flow.right) newLine(flow);
    const w = advance(flow, piece);
    const y = flow.y + flow.textDy;
    flow.items.push({ kind: 'text', x: flow.x, y, w, h: flow.glyphH, text: piece, color, font: flow.font, scale: flow.scale });
    if (underline) flow.items.push({ kind: 'rect', x: flow.x, y: y + flow.glyphH, w, h: RULE_H, color });
    flow.x += w;
  }
}

// Words are split at spaces. A space at a line start is dropped, unless keepSpaces (code): then every space advances.
export function placeWords(flow, text, color, underline, keepSpaces = false) {
  text.split(' ').forEach((word, index) => {
    if (index > 0 && (keepSpaces || flow.x > flow.left)) flow.x += advance(flow, ' ');
    if (word) placeWord(flow, word, color, underline);
  });
}

// A key or spoiler is one box that does not wrap: it moves to the next line as a whole.
function startBox(flow, label) {
  const w = advance(flow, label) + 2 * BOX_PAD_X;
  if (flow.x > flow.left && flow.x + w > flow.right) newLine(flow);
  const box = { x: flow.x, y: flow.y, w, h: flow.lineH };
  flow.x += w;
  return box;
}

function placeKey(flow, label) {
  const { x, y, w, h } = startBox(flow, label);
  const text = {
    kind: 'text', x: x + BOX_PAD_X, y: y + flow.textDy, w: w - 2 * BOX_PAD_X, h: flow.glyphH, text: label,
    color: TEXT_BRIGHT, font: flow.font, scale: flow.scale,
  };
  flow.items.push({ kind: 'rect', x, y, w, h, color: SUNKEN }, { kind: 'frame', x, y, w, h, color: TEXT_DIM }, text);
}

// Spoiler item: its box geometry, its text, and an id from the note counter.
function placeSpoiler(flow, label) {
  const { x, y, w, h } = startBox(flow, label);
  flow.items.push({
    kind: 'spoiler', id: flow.spoilers.next++, x, y, w, h, text: label, color: TEXT, font: flow.font, scale: flow.scale,
    dx: BOX_PAD_X, dy: flow.textDy, boxColor: SUNKEN, frameColor: TEXT_DIM,
  });
}

const INLINE_PLACERS = {
  text: (flow, node) => placeWords(flow, node.value, flow.color, false),
  link: (flow, node) => placeWords(flow, node.value, BLUE, true),
  key: (flow, node) => placeKey(flow, node.value),
  spoiler: (flow, node) => placeSpoiler(flow, node.value),
};

export function placeInlines(flow, inlines) {
  for (const node of inlines) {
    if (!Object.hasOwn(INLINE_PLACERS, node?.type)) throw new Error(`noteLayout: unknown inline type ${describe(node?.type)}`);
    INLINE_PLACERS[node.type](flow, node);
  }
}
