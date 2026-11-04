// A Markdown note as a view: it loads the file, lays it out for the width and draws the part in the window.
// The same view serves a note tile, the start notes and the quick view of pmc.
import { parse, layout } from './markdown.js';
import { urlOf, formatSize } from './catalog.js';
import { RV } from './font.js';
import { C } from './theme.js';
import { bitmap, scrollbar, footBar, keyBar } from './widgets.js';
import { Download } from './download.js';
import { NOTE_KEYS as K, T } from './texts.js';

const STEP = 12;
const PAD_X = 10, PAD_Y = 8;
const BAR_H = 14;

export class NoteBody {
  constructor(ws, path) {
    this.ws = ws;
    this.path = path;
    this.blocks = null;
    this.error = false;
    this.top = 0;
    this.view = null; // the text window of the last draw: its height gives the page step
    this.download = new Download(urlOf(path), () => this.changed());
  }

  // On done the Blob is parsed; the bar and the foot follow the bytes.
  async changed() {
    const d = this.download;
    if (d.state === 'done' && !this.blocks) {
      try { this.blocks = parse(await d.blob.text()); } catch { this.error = true; }
    } else if (d.state === 'errr') this.error = true;
    this.ws.requestDraw();
  }

  // The key bar: a click presses the key.
  cells() {
    const press = (code) => () => this.key({ code });
    return [
      { ...K.scroll, codes: ['ArrowUp', 'ArrowDown'], click: press('ArrowDown') },
      { ...K.page, codes: ['PageUp', 'PageDown'], click: press('PageDown') },
      { ...K.edge, codes: ['Home', 'End'], click: press('End') },
    ];
  }

  // Keys of a focused note: arrows, Page Up and Page Down, Home and End scroll it.
  key(e) {
    const page = (this.view ? this.view.h : 0) - STEP;
    const k = e.code;
    if (k === 'ArrowDown') this.top += STEP;
    else if (k === 'ArrowUp') this.top -= STEP;
    else if (k === 'PageDown') this.top += page;
    else if (k === 'PageUp') this.top -= page;
    else if (k === 'Home') this.top = 0;
    else if (k === 'End') this.top = Infinity;
    else return false;
    this.ws.requestDraw();
    return true;
  }

  wheel(dy) {
    this.top += (dy > 0 ? 3 : -3) * STEP;
    this.ws.requestDraw();
  }

  // The note is a sunken well with the text inside it, padded as the prototype's .md (8 px by 10 px).
  draw(p, r, hits) {
    const bar = { x: r.x, y: r.y + r.h - BAR_H, w: r.w, h: BAR_H };
    keyBar(p, hits, bar, this.cells(), this.ws.drawHeld);
    const foot = { x: r.x, y: bar.y - 4 - BAR_H, w: r.w, h: BAR_H };
    const d = this.download;
    const size = d.blob ? d.blob.size : d.total;
    const name = this.path.split('/').pop();
    footBar(p, foot, [name, T.noteType, size ? formatSize(size) : ''].filter(Boolean).join(' · '), d, false);
    r = { x: r.x, y: r.y, w: r.w, h: Math.max(0, foot.y - 4 - r.y) };
    p.fill(r.x, r.y, r.w, r.h, C.inset);
    p.bevel(r, 2, false);
    const well = { x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4 };
    if (this.error) {
      p.text(RV, well.x + PAD_X, well.y + PAD_Y, `${T.loadError}${this.path}`, C.red);
      return;
    }
    if (!this.blocks) return;
    const view = { x: well.x + PAD_X, y: well.y + PAD_Y, w: well.w - 2 * PAD_X, h: well.h - 2 * PAD_Y };
    let lay = layout(this.blocks, view.w, (a) => this.ws.progressOf(a));
    const scroll = lay.height > view.h;
    if (scroll) lay = layout(this.blocks, view.w - 14, (a) => this.ws.progressOf(a));
    this.view = view;
    this.top = Math.max(0, Math.min(this.top, lay.height - view.h));
    // The wheel over the note scrolls it; the links and the scroll bar are added after, so they lie on top.
    hits.add(view, { wheel: (dy) => this.wheel(dy) });
    p.clip(view);
    for (const op of lay.ops) this.drawOp(p, op, view, this.top);
    p.unclip();
    for (const h of lay.hits) {
      const y = view.y + h.y - this.top;
      if (y < view.y || y + h.h > view.y + view.h) continue;
      hits.add({ x: view.x + h.x, y, w: h.w, h: h.h }, { click: () => window.open(h.href, '_blank', 'noopener,noreferrer') });
    }
    if (scroll) {
      scrollbar(p, hits, well, {
        top: this.top, view: view.h, total: lay.height,
        onTop: (t) => { this.top = t; this.ws.requestDraw(); },
      });
    }
  }

  drawOp(p, op, view, top) {
    const y = view.y + op.y - top;
    const x = view.x + op.x;
    if (y + (op.h || 16) < view.y || y > view.y + view.h) return;
    if (op.op === 'text') p.text(op.font, x, y, op.s, op.color, op.scale);
    else if (op.op === 'rect') p.fill(x, y, op.w, op.h, op.color);
    else if (op.op === 'bevel') p.bevel({ x, y, w: op.w, h: op.h }, op.width, op.raised);
    else if (op.op === 'dither') p.dither({ x, y, w: op.w, h: op.h }, op.a, op.b);
    else if (op.op === 'icon') bitmap(p, x, y, op.rows, 5, op.color);
  }

  dispose() { this.download.abort(); }
}
