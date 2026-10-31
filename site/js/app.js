// A web app: a folder whose name ends in .exe and that holds index.html. It runs in an iframe that lies over
// the canvas, in the rectangle of its tile. The iframe is created once; a rearranged tile only moves or hides
// its wrapper, and the wrapper never moves in the page, so the app keeps its state.
// The app talks to the site by postMessage: APP_READY, TITLE and ERROR, from its own address only.
import { PANE_MIN } from './metrics.js';
import { C } from './theme.js';
import { RV, textWidth, fitText } from './font.js';
import { urlOf } from './catalog.js';
import { T } from './texts.js';
import { button } from './widgets.js';

const APP_W = 320, APP_H = 180;
const TOOLBAR = 16, STAT = 14;
const SCALES = ['fit', 'integer', '1x', '2x', '3x'];
const SCALE_LABEL = { fit: 'Fit', integer: 'Integer', '1x': '1x', '2x': '2x', '3x': '3x' };
const MESSAGES = new Set(['APP_READY', 'TITLE', 'ERROR']);

// Reads a message from an app. Anything else is ignored; text is cut to a sane length.
export function parseMessage(data) {
  if (!data || typeof data !== 'object' || !MESSAGES.has(data.type)) return null;
  if (data.type === 'APP_READY') return { type: data.type };
  const text = typeof data.text === 'string' ? data.text.slice(0, 200) : '';
  return { type: data.type, text };
}

// The scale an app is drawn at: the whole well for Fit, the largest whole factor for Integer, else the factor.
export function scaleFor(mode, w, h) {
  if (mode === 'fit') return Math.max(0.1, Math.min(w / APP_W, h / APP_H));
  if (mode === 'integer') return Math.max(1, Math.floor(Math.min(w / APP_W, h / APP_H)));
  return Number(mode[0]);
}

export class AppPane {
  constructor(ws, dir, name) {
    this.ws = ws;
    this.dir = dir;
    this.name = name;
    this.path = (dir ? dir + '/' : '') + name;
    this.title = name;
    this.status = 'loading';
    this.error = '';
    this.scale = 'fit';
    this.drawnAt = -1;
    this.wrap = document.createElement('div');
    this.wrap.style.cssText = 'position:absolute;overflow:hidden;display:none;';
    this.frame = document.createElement('iframe');
    this.frame.style.cssText = `position:absolute;width:${APP_W}px;height:${APP_H}px;border:0;transform-origin:0 0;`;
    this.frame.addEventListener('load', () => this.attach());
    this.wrap.appendChild(this.frame);
    document.body.appendChild(this.wrap);
    fetch(urlOf(this.path + '/index.html'), { method: 'HEAD', cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) { this.status = 'error'; this.error = T.appNoIndex; return; }
        this.frame.src = urlOf(this.path + '/index.html');
      })
      .catch(() => { this.status = 'error'; this.error = T.appNoIndex; })
      .finally(() => this.ws.requestDraw());
  }

  get minimum() { return PANE_MIN.app; }

  // A message from the app's window, checked against this app's own frame.
  message(event) {
    if (event.source !== this.frame.contentWindow) return;
    const msg = parseMessage(event.data);
    if (!msg) return;
    if (msg.type === 'APP_READY') this.status = 'ready';
    else if (msg.type === 'TITLE') this.title = msg.text || this.name;
    else if (msg.type === 'ERROR') { this.status = 'error'; this.error = msg.text; }
    this.ws.requestDraw();
  }

  // Shift+Q inside the app closes its tile: the page can see the app's keys because the app has the same address.
  attach() {
    try {
      const win = this.frame.contentWindow;
      win.addEventListener('keydown', (e) => {
        if (e.shiftKey && e.code === 'KeyQ' && !e.ctrlKey && !e.altKey && !e.metaKey) this.ws.closeApp(this);
      }, true);
    } catch (err) {
      this.status = 'error';
      this.error = T.loadError + this.path;
      this.ws.requestDraw();
    }
  }

  restart() {
    this.status = 'loading';
    this.frame.src = urlOf(this.path + '/index.html');
    this.ws.requestDraw();
  }

  // Puts the iframe in the well, centered, and scaled. The wrapper clips it to the well.
  // The well and the scale are in device pixels; the page's CSS pixels are the device pixels divided by the ratio.
  place(well) {
    const k = 1 / (window.devicePixelRatio || 1);
    const s = scaleFor(this.scale, well.w, well.h);
    const dx = Math.round((well.w - APP_W * s) / 2), dy = Math.round((well.h - APP_H * s) / 2);
    const st = this.wrap.style;
    st.display = 'block';
    st.left = `${well.x * k}px`;
    st.top = `${well.y * k}px`;
    st.width = `${well.w * k}px`;
    st.height = `${well.h * k}px`;
    this.frame.style.left = `${dx * k}px`;
    this.frame.style.top = `${dy * k}px`;
    this.frame.style.transform = `scale(${s * k})`;
  }

  // Hides the iframe when its tile is not drawn (another tile is maximized, or it is not the front tab).
  hide() {
    this.wrap.style.display = 'none';
  }

  // Drawing: a toolbar with the scales and Restart, the navy well with the app, and a status line.
  draw(p, r, hits) {
    this.drawnAt = this.ws.frame;
    const bar = { x: r.x, y: r.y, w: r.w, h: TOOLBAR };
    let x = bar.x;
    for (const mode of SCALES) {
      const label = SCALE_LABEL[mode];
      const b = { x, y: bar.y, w: textWidth(RV, label) + 12, h: TOOLBAR };
      button(p, hits, b, label, { on: this.scale === mode, click: () => { this.scale = mode; this.ws.requestDraw(); } });
      x += b.w + 2;
    }
    x += 6;
    const rs = { x, y: bar.y, w: textWidth(RV, T.appRestart) + 12, h: TOOLBAR };
    button(p, hits, rs, T.appRestart, { click: () => this.restart() });

    const well = { x: r.x, y: r.y + TOOLBAR + 4, w: r.w, h: r.h - TOOLBAR - 4 - STAT - 4 };
    p.fill(well.x, well.y, well.w, well.h, C.cb);
    p.bevel(well, 1, false);
    const inner = { x: well.x + 1, y: well.y + 1, w: well.w - 2, h: well.h - 2 };
    if (this.status === 'error') {
      this.hide();
      p.text(RV, inner.x + 6, inner.y + 6, this.error || T.appNoIndex, C.red);
    } else {
      this.place(inner);
    }

    const stat = { x: r.x, y: r.y + r.h - STAT, w: r.w, h: STAT };
    p.fill(stat.x, stat.y, stat.w, stat.h, C.inset);
    p.bevel(stat, 1, false);
    const scaleText = this.scale === 'fit' ? '×fit' : `×${scaleFor(this.scale, inner.w, inner.h)}`;
    const left = `index.html · ${APP_W}×${APP_H} · ${scaleText}`;
    p.text(RV, stat.x + 4, stat.y + 3, fitText(RV, left, stat.w - 8), C.bright);
    const hint = T.appHint;
    const leftW = textWidth(RV, left) + 16;
    if (leftW + textWidth(RV, hint) <= stat.w) p.text(RV, stat.x + stat.w - textWidth(RV, hint) - 4, stat.y + 3, hint, C.sel);
  }

  dispose() {
    this.wrap.remove();
  }
}
