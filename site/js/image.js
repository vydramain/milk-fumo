// The image viewer: the picture drawn in the canvas, and the set of pictures in its folder.
// A picture is shown at its own size, or smaller when the window is smaller; it is never enlarged.
import { urlOf, formatSize } from './catalog.js';
import { RV, textWidth } from './font.js';
import { C } from './theme.js';
import { box } from './widgets.js';

const BAR = 16;

export class ImageView {
  constructor(ws, dir, set, index) {
    this.ws = ws;
    this.dir = dir;
    this.set = set;
    this.index = index;
    this.img = new Image();
    this.img.addEventListener('load', () => this.ws.requestDraw());
    this.img.addEventListener('error', () => this.ws.requestDraw());
    this.load(index);
  }

  get entry() { return this.set[this.index]; }

  load(index) {
    this.index = (index + this.set.length) % this.set.length;
    this.img.src = urlOf((this.dir ? this.dir + '/' : '') + this.entry.name);
    this.ws.requestDraw();
  }

  // Keys of a focused picture: arrows, N and P go to the next and previous picture.
  key(e) {
    const k = e.code;
    if (k === 'ArrowRight' || k === 'KeyN') this.load(this.index + 1);
    else if (k === 'ArrowLeft' || k === 'KeyP') this.load(this.index - 1);
    else return false;
    return true;
  }

  draw(p, r, hits) {
    const area = { x: r.x, y: r.y, w: r.w, h: r.h - BAR - 4 };
    p.fill(area.x, area.y, area.w, area.h, C.cb);
    const img = this.img;
    if (img.complete && img.naturalWidth) {
      const s = Math.min(1, area.w / img.naturalWidth, area.h / img.naturalHeight);
      const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
      p.image(img, area.x + Math.floor((area.w - w) / 2), area.y + Math.floor((area.h - h) / 2), w, h);
    } else {
      const t = img.complete ? 'Could not load the picture' : 'Loading';
      p.text(RV, area.x + 6, area.y + 6, t, C.cov);
    }
    const bar = { x: r.x, y: r.y + r.h - BAR, w: r.w, h: BAR };
    const prev = { x: bar.x, y: bar.y, w: 30, h: BAR };
    const next = { x: bar.x + 34, y: bar.y, w: 30, h: BAR };
    this.button(p, hits, prev, 'Pv', () => this.load(this.index - 1));
    this.button(p, hits, next, 'Nx', () => this.load(this.index + 1));
    const caption = `${this.entry.name} · ${formatSize(this.entry.size)} · ${this.index + 1} of ${this.set.length}`;
    p.text(RV, next.x + next.w + 8, bar.y + 4, caption, C.ct);
  }

  button(p, hits, r, label, click) {
    box(p, r, true);
    p.text(RV, r.x + Math.floor((r.w - textWidth(RV, label)) / 2), r.y + 4, label, C.blue);
    hits.add(r, { click });
  }

  dispose() {}
}
