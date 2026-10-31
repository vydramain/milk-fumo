// Widgets of the immediate-mode UI. A widget draws itself and, in the same call, registers its rectangle
// with the frame's hit list. A click is checked against the list from the top down.
import { C } from './theme.js';
import { RV, textWidth } from './font.js';

// The hits of one frame. A later hit is on top of an earlier one, so a widget is added after its container.
export class Hits {
  constructor() { this.list = []; }

  // on: { click(x, y), wheel(dy), press(x, y) -> { move, up } | move | undefined }
  add(r, on) { this.list.push({ r, on }); }

  // The topmost hit under a point that has the handler `key`, or null.
  find(x, y, key) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i];
      if (h.on[key] && x >= h.r.x && y >= h.r.y && x < h.r.x + h.r.w && y < h.r.y + h.r.h) return h;
    }
    return null;
  }

  // The topmost hit under a point, whatever its handlers are.
  at(x, y) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i];
      if (x >= h.r.x && y >= h.r.y && x < h.r.x + h.r.w && y < h.r.y + h.r.h) return h;
    }
    return null;
  }
}

// A raised or sunken 1px box, as the small buttons and fields of the prototype.
export function box(p, r, raised, color = C.btn) {
  p.fill(r.x, r.y, r.w, r.h, color);
  p.bevel(r, 1, raised);
}

// Text centered in a rectangle: x and y of the text.
export function centerText(font, r, s, scale = 1) {
  return {
    x: r.x + Math.floor((r.w - textWidth(font, s, scale)) / 2),
    y: r.y + Math.floor((r.h - font.rows * scale) / 2),
  };
}

// A button: a raised box with a label. `on` makes it pressed.
export function button(p, hits, r, label, { on = false, color = C.text, click } = {}) {
  box(p, r, !on, on ? C.inset : C.btn);
  if (on) p.bevel(r, 1, false);
  const at = centerText(RV, r, label);
  p.text(RV, at.x, at.y, label, on ? C.bright : color);
  if (click) hits.add(r, { click });
}

// A scroll bar at the right of a rectangle: arrows at both ends, a dithered track, a thumb.
// Returns the width it takes. `top` is the first visible item, `view` the number of visible items.
export function scrollbar(p, hits, r, { top, view, total, onTop }) {
  const w = 14;
  const x = r.x + r.w - w;
  p.dither({ x, y: r.y, w, h: r.h }, C.inset, C.lo);
  const up = { x, y: r.y, w, h: 14 }, dn = { x, y: r.y + r.h - 14, w, h: 14 };
  box(p, up, true);
  box(p, dn, true);
  arrow(p, up, true);
  arrow(p, dn, false);
  const track = { x, y: r.y + 14, w, h: r.h - 28 };
  if (total > view && track.h > 0) {
    const th = Math.max(8, Math.floor(track.h * view / total));
    const max = total - view;
    const ty = track.y + Math.floor((track.h - th) * top / max);
    box(p, { x, y: ty, w, h: th }, true);
  }
  hits.add(up, { click: () => onTop(Math.max(0, top - 1)) });
  hits.add(dn, { click: () => onTop(Math.min(Math.max(0, total - view), top + 1)) });
  hits.add(track, {
    press: (px, py) => {
      const pos = (py - track.y) / track.h;
      onTop(Math.round(pos * Math.max(0, total - view)));
      return (qx, qy) => onTop(Math.round((qy - track.y) / track.h * Math.max(0, total - view)));
    },
  });
  return w;
}

// A 7-pixel triangle in a 14-pixel button: the apex is up or down.
function arrow(p, r, upward) {
  for (let i = 0; i < 4; i++) {
    const y = r.y + 5 + i;
    if (upward) p.fill(r.x + 7 - i, y, 1 + 2 * i, 1, C.bright);
    else p.fill(r.x + 4 + i, y, 7 - 2 * i, 1, C.bright);
  }
}

// A small bitmap: rows of bits, the leftmost bit first.
export function bitmap(p, x, y, rows, cols, color, scale = 1) {
  rows.forEach((bits, row) => {
    for (let c = 0; c < cols; c++) {
      if ((bits >> (cols - 1 - c)) & 1) p.fill(x + c * scale, y + row * scale, scale, scale, color);
    }
  });
}

// A slanted tab of the tile strip: the prototype's tab, a parallelogram with its own bevel.
export function tabShape(r) {
  const skew = 6;
  return [[r.x + skew, r.y], [r.x + r.w + skew, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
}
