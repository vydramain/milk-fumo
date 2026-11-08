// A web app: a folder whose name ends in .exe and that holds index.html. It runs in an iframe that lies over
// the canvas, in the rectangle of its tile. The iframe is created once; a rearranged tile only moves or hides
// its wrapper, and the wrapper never moves in the page, so the app keeps its state.
// The app talks to the site by postMessage: APP_READY, TITLE and ERROR, from its own address only. An app that
// sends nothing is running once its page has loaded.
import { PANE_MIN } from './metrics.js';
import { C } from './theme.js';
import { RV, fitText } from './font.js';
import { urlOf } from './catalog.js';
import { APP_KEYS as K, T } from './texts.js';
import { view } from './view.js';
import { keyBar, footBar } from './widgets.js';
import { Download } from './download.js';

const BAR = 14, STATUS = 14;
const MESSAGES = new Set(['APP_READY', 'TITLE', 'ERROR']);

// Reads a message from an app. Anything else is ignored; text is cut to a sane length.
export function parseMessage(data) {
  if (!data || typeof data !== 'object' || !MESSAGES.has(data.type)) return null;
  if (data.type === 'APP_READY') return { type: data.type };
  const text = typeof data.text === 'string' ? data.text.slice(0, 200) : '';
  return { type: data.type, text };
}

export class AppPane {
  constructor(ws, dir, name) {
    this.ws = ws;
    this.dir = dir;
    this.name = name;
    this.path = (dir ? dir + '/' : '') + name;
    this.status = 'loading';
    this.error = '';
    this.drawnAt = -1;
    this.wrap = document.createElement('div');
    this.wrap.style.cssText = 'position:absolute;overflow:hidden;display:none;';
    this.frame = document.createElement('iframe');
    this.frame.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;border:0;';
    this.frame.allowFullscreen = true;
    this.frame.addEventListener('load', () => this.attach());
    this.wrap.appendChild(this.frame);
    document.body.appendChild(this.wrap);
    this.fetch();
  }

  fetch() {
    this.load = new Download(urlOf(this.path + '/index.html'), () => this.loaded());
  }

  // Called on every chunk: when index.html is whole, the frame loads it (from the cache).
  loaded() {
    if (this.load.state === 'done' && !this.frame.getAttribute('src')) this.frame.src = urlOf(this.path + '/index.html');
    else if (this.load.state === 'errr') { this.status = 'error'; this.error = T.appNoIndex; }
    this.ws.requestDraw();
  }

  get minimum() { return PANE_MIN.app; }

  // A message from the app's window, checked against this app's own frame.
  message(event) {
    if (event.source !== this.frame.contentWindow) return;
    const msg = parseMessage(event.data);
    if (!msg) return;
    if (msg.type === 'APP_READY') this.status = 'ready';
    else if (msg.type === 'ERROR') { this.status = 'error'; this.error = msg.text; }
    this.ws.requestDraw();
  }

  // Shift+Q closes its tile, Shift+0 restarts it and Shift+F toggles its fullscreen, inside the app: the page can see
  // the app's keys because the app has the same address. The app never sees these keys, down or up.
  attach() {
    if (!this.frame.getAttribute('src')) return; // the blank page of a frame without src
    try {
      const win = this.frame.contentWindow;
      const ours = (e) => e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && ['KeyQ', 'Digit0', 'KeyF'].includes(e.code);
      const swallow = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
      win.addEventListener('keydown', (e) => {
        if (!ours(e)) return;
        swallow(e);
        if (e.repeat) return;
        if (e.code === 'KeyQ') this.ws.closeApp(this);
        else if (e.code === 'Digit0') this.restart();
        else this.fullscreen();
      }, true);
      win.addEventListener('keyup', (e) => { if (ours(e)) swallow(e); }, true);
      if (this.status === 'loading') this.status = 'ready';
    } catch (err) {
      this.status = 'error';
      this.error = T.loadError + this.path;
    }
    this.ws.requestDraw();
  }

  // The browser's fullscreen for the app's frame; a second request leaves it. Refusals are ignored.
  fullscreen() {
    const done = document.fullscreenElement === this.frame ? document.exitFullscreen() : this.frame.requestFullscreen();
    if (done) done.catch(() => {});
  }

  restart() {
    this.status = 'loading';
    this.error = '';
    if (this.load.state === 'done') this.frame.src = urlOf(this.path + '/index.html');
    else { this.load.abort(); this.fetch(); }
    this.ws.requestDraw();
  }

  // Puts the wrapper over the well; the iframe fills the wrapper. The well is in layout pixels; a layout pixel is
  // view.ui device pixels, and the page's CSS pixels are the device pixels divided by the ratio.
  place(well) {
    const k = view.ui / view.dpr;
    const st = this.wrap.style;
    st.display = 'block';
    st.left = `${well.x * k}px`;
    st.top = `${well.y * k}px`;
    st.width = `${well.w * k}px`;
    st.height = `${well.h * k}px`;
  }

  // Hides the iframe when its tile is not drawn (another tile is maximized, or it is not the front tab).
  hide() {
    this.wrap.style.display = 'none';
  }

  cells() {
    return [
      { ...K.close, codes: ['KeyQ'], click: () => this.ws.closeApp(this) },
      { ...K.restart, codes: ['Digit0'], click: () => this.restart() },
      { ...K.full, codes: ['KeyF'], click: () => this.fullscreen() },
    ];
  }

  // Drawing: the navy well with a status line and the app, then the foot (index.html, its bytes, keys) and the key bar.
  draw(p, r, hits, focused = false) {
    this.drawnAt = this.ws.frame;
    const bar = { x: r.x, y: r.y + r.h - BAR, w: r.w, h: BAR };
    keyBar(p, hits, bar, this.cells(), this.ws.drawHeld);
    const foot = { x: r.x, y: bar.y - 4 - BAR, w: r.w, h: BAR };
    footBar(p, foot, 'index.html', this.load, focused && this.status === 'ready');

    const well = { x: r.x, y: r.y, w: r.w, h: Math.max(0, foot.y - 4 - r.y) };
    p.fill(well.x, well.y, well.w, well.h, C.cb);
    p.bevel(well, 1, false);
    const inner = { x: well.x + 1, y: well.y + 1, w: well.w - 2, h: well.h - 2 };
    const status = this.status === 'error' ? this.error || T.appNoIndex : this.status === 'loading' ? T.appLoading : T.appRunning;
    p.text(RV, inner.x + 6, inner.y + 3, fitText(RV, status, inner.w - 12), this.status === 'error' ? C.red : C.ct);
    const area = { x: inner.x, y: inner.y + STATUS, w: inner.w, h: inner.h - STATUS };
    if (this.status === 'error') this.hide();
    else this.place(area);
  }

  dispose() {
    this.load.abort();
    this.wrap.remove();
  }
}
