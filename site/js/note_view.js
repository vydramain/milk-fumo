// Paints with fillRect and drawText, clipped to rect.
import { drawText } from './font.js';
import { describe } from './note_inline.js';

const FRAME_W = 1;
// Dotted rule: a lit pixel every DOT_STEP.
const DOT_STEP = 2;

// Rectangles go through here: a filled rect at integer pixels; text is drawn by drawText.
function paint(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// One-pixel frame drawn as four bars.
function frame(ctx, color, x, y, w, h) {
  paint(ctx, color, x, y, w, FRAME_W);
  paint(ctx, color, x, y + h - FRAME_W, w, FRAME_W);
  paint(ctx, color, x, y, FRAME_W, h);
  paint(ctx, color, x + w - FRAME_W, y, FRAME_W, h);
}

function dotted(ctx, color, x, y, w) {
  for (let dx = 0; dx < w; dx += DOT_STEP) paint(ctx, color, x + dx, y, 1, 1);
}

// A closed spoiler is its box; an open one is its text in place, without the box.
function drawSpoiler(ctx, item, x, y, openSpoilers) {
  if (openSpoilers.has(item.id)) {
    drawText(ctx, item.text, x + item.dx, y + item.dy, item.font, item.color, item.scale);
    return;
  }
  paint(ctx, item.boxColor, x, y, item.w, item.h);
  frame(ctx, item.frameColor, x, y, item.w, item.h);
}

const ITEM_DRAWERS = {
  rect: (ctx, item, x, y) => paint(ctx, item.color, x, y, item.w, item.h),
  frame: (ctx, item, x, y) => frame(ctx, item.color, x, y, item.w, item.h),
  dotted: (ctx, item, x, y) => dotted(ctx, item.color, x, y, item.w),
  text: (ctx, item, x, y) => drawText(ctx, item.text, x, y, item.font, item.color, item.scale),
  spoiler: drawSpoiler,
};

// Paints items shifted up by scrollY inside rect. The canvas is clipped to rect; items that do not reach rect are skipped.
export function drawNote(ctx, items, rect, scrollY, openSpoilers) {
  if (!Array.isArray(items)) throw new TypeError(`drawNote: items must be an array, got ${describe(items)}`);
  if (![rect?.x, rect?.y, rect?.w, rect?.h, scrollY].every(Number.isInteger)) {
    throw new Error(`drawNote: rect needs integer x, y, w, h and scrollY, got ${JSON.stringify(rect)}, ${scrollY}`);
  }
  if (!(openSpoilers instanceof Set)) {
    throw new TypeError(`drawNote: openSpoilers must be a Set, got ${describe(openSpoilers)}`);
  }
  for (const item of items) {
    if (!Object.hasOwn(ITEM_DRAWERS, item?.kind)) throw new Error(`drawNote: unknown item kind ${JSON.stringify(item?.kind)}`);
  }
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    for (const item of items) {
      const x = rect.x + item.x;
      const y = rect.y + item.y - scrollY;
      if (x + item.w <= rect.x || x >= rect.x + rect.w || y + item.h <= rect.y || y >= rect.y + rect.h) continue;
      ITEM_DRAWERS[item.kind](ctx, item, x, y, openSpoilers);
    }
  } finally {
    ctx.restore();
  }
}
