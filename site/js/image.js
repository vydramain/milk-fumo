// The image viewer: the picture drawn in the canvas, and the set of pictures in its folder.
// A picture is shown at its own size, or smaller when the window is smaller; it is never enlarged.
// It is fetched byte-counted; the field stays empty until the download is done.
import { formatSize } from './catalog.js';
import { RV } from './font.js';
import { C } from './theme.js';
import { keyBar, footBar } from './widgets.js';
import { Downloads } from './download.js';
import { IMAGE_KEYS as K, T } from './texts.js';

const BAR = 14;

export class ImageView {
  constructor(ws, dir, set, index) {
    this.ws = ws;
    this.downloads = new Downloads(() => this.changed());
    this.img = new Image();
    this.img.addEventListener('load', () => this.ws.requestDraw());
    this.img.addEventListener('error', () => this.ws.requestDraw());
    this.shown = null; // the path whose object URL is in img.src
    this.open(dir, set, index);
  }

  get entry() { return this.set[this.index]; }

  path(i) { return (this.dir ? this.dir + '/' : '') + this.set[i].name; }

  // Another picture or folder, from pmc or the workspace: the downloads stay, they are kept by path.
  open(dir, set, index) {
    this.dir = dir;
    this.set = set;
    this.load(index);
  }

  // Wants the picture and the next one; a done picture is shown without a new request.
  load(index) {
    this.index = (index + this.set.length) % this.set.length;
    this.downloads.want(this.path(this.index));
    this.downloads.want(this.path((this.index + 1) % this.set.length));
    this.changed();
  }

  changed() {
    const path = this.path(this.index);
    const d = this.downloads.peek(path);
    if (d.state === 'done' && this.shown !== path) {
      this.shown = path;
      this.img.src = d.href;
    }
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

  cells() {
    return [
      { ...K.prev, codes: ['ArrowLeft', 'KeyP'], click: () => this.load(this.index - 1) },
      { ...K.next, codes: ['ArrowRight', 'KeyN'], click: () => this.load(this.index + 1) },
    ];
  }

  draw(p, r, hits) {
    const bar = { x: r.x, y: r.y + r.h - BAR, w: r.w, h: BAR };
    keyBar(p, hits, bar, this.cells(), this.ws.held);
    const foot = { x: r.x, y: bar.y - 4 - BAR, w: r.w, h: BAR };
    const path = this.path(this.index);
    const d = this.downloads.peek(path);
    const area = { x: r.x, y: r.y, w: r.w, h: Math.max(0, foot.y - 4 - r.y) };
    p.fill(area.x, area.y, area.w, area.h, C.cb);
    const img = this.img;
    const ready = d.state === 'done' && this.shown === path && img.complete && img.naturalWidth;
    if (ready) {
      const s = Math.min(1, area.w / img.naturalWidth, area.h / img.naturalHeight);
      const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
      p.image(img, area.x + Math.floor((area.w - w) / 2), area.y + Math.floor((area.h - h) / 2), w, h);
    } else if (d.state === 'errr' || (this.shown === path && img.complete)) {
      p.text(RV, area.x + 6, area.y + 6, T.loadError + this.entry.name, C.red);
    }
    const type = this.entry.name.includes('.') ? this.entry.name.split('.').pop().toUpperCase() : '';
    const size = d.blob ? d.blob.size : this.entry.size;
    const line = [this.entry.name, type, ready ? `${img.naturalWidth}×${img.naturalHeight}` : '',
      size ? formatSize(size) : '', `${this.index + 1} of ${this.set.length}`].filter(Boolean).join(' · ');
    footBar(p, foot, line, d, false);
  }

  dispose() { this.downloads.dispose(); }
}
