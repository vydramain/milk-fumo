// Drawing on the canvas. Coordinates are CSS pixels; every rectangle is snapped to whole device pixels,
// so nothing is smoothed. Text is drawn from the bitmap tables in font.js, pixel by pixel.
import { C } from './theme.js';
import { glyphOf } from './font.js';

export class Paint {
  constructor(ctx, dpr) {
    this.ctx = ctx;
    this.dpr = dpr;
    this.patterns = new Map();
  }

  fill(x, y, w, h, color) {
    const d = this.dpr;
    const x0 = Math.round(x * d), y0 = Math.round(y * d);
    const x1 = Math.round((x + w) * d), y1 = Math.round((y + h) * d);
    if (x1 <= x0 || y1 <= y0) return;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  // A bevel `width` px wide: light on the top and left, dark on the bottom and right; sunken swaps them.
  bevel(r, width, raised) {
    const hi = raised ? C.hi : C.lo;
    const lo = raised ? C.lo : C.hi;
    this.fill(r.x, r.y, r.w, width, hi);
    this.fill(r.x, r.y, width, r.h, hi);
    this.fill(r.x, r.y + r.h - width, r.w, width, lo);
    this.fill(r.x + r.w - width, r.y, width, r.h, lo);
  }

  // A checkerboard of two colors, one pixel per cell: the dither of the title bars and the scroll tracks.
  dither(r, a, b) {
    const d = this.dpr;
    const x0 = Math.round(r.x * d), y0 = Math.round(r.y * d);
    const x1 = Math.round((r.x + r.w) * d), y1 = Math.round((r.y + r.h) * d);
    if (x1 <= x0 || y1 <= y0) return;
    this.ctx.fillStyle = this.pattern(a, b);
    this.ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  pattern(a, b) {
    const key = a + b;
    if (!this.patterns.has(key)) {
      const c = document.createElement('canvas');
      c.width = 2;
      c.height = 2;
      const g = c.getContext('2d');
      g.fillStyle = a;
      g.fillRect(0, 0, 1, 1);
      g.fillRect(1, 1, 1, 1);
      g.fillStyle = b;
      g.fillRect(1, 0, 1, 1);
      g.fillRect(0, 1, 1, 1);
      this.patterns.set(key, this.ctx.createPattern(c, 'repeat'));
    }
    return this.patterns.get(key);
  }

  // Text at a top-left corner, at an integer scale: a font pixel is `scale` CSS pixels.
  text(font, x, y, s, color, scale = 1) {
    let cx = x;
    for (const ch of s) {
      const rows = glyphOf(font, ch);
      for (let row = 0; row < font.rows; row++) {
        const bits = rows[row] || 0;
        let c = 0;
        while (c < font.cols) {
          if (!font.bit(bits, c)) { c++; continue; }
          const start = c;
          while (c < font.cols && font.bit(bits, c)) c++;
          this.fill(cx + start * scale, y + row * scale, (c - start) * scale, scale, color);
        }
      }
      cx += font.advance * scale;
    }
    return cx;
  }

  // A slanted tab, as the prototype's skewed tab: each row is shifted by whole pixels, so its edges are steps,
  // never anti-aliased. The top row is shifted right by `skew` pixels, the bottom row not at all.
  // Returns the x of each row's left edge, for the caller's borders.
  slant(x, y, w, h, skew, color) {
    const rows = [];
    for (let r = 0; r < h; r++) {
      const shift = Math.round(skew * (h - 1 - r) / (h - 1));
      rows.push(x + shift);
      this.fill(x + shift, y + r, w, 1, color);
    }
    return rows;
  }

  // A picture or a video frame, scaled to a rectangle without smoothing.
  image(src, x, y, w, h) {
    const d = this.dpr;
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(src, Math.round(x * d), Math.round(y * d), Math.round(w * d), Math.round(h * d));
  }

  clip(r) {
    const d = this.dpr;
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(Math.round(r.x * d), Math.round(r.y * d), Math.round(r.w * d), Math.round(r.h * d));
    this.ctx.clip();
  }

  unclip() {
    this.ctx.restore();
  }
}
