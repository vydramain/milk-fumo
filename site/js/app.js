// A web app: a folder whose name ends in .exe and that holds index.html. It runs in an iframe that lies over
// the canvas, in the rectangle of its tile. The iframe is created once; a rearranged tile only moves or hides
// its wrapper, and the wrapper never moves in the page, so the app keeps its state.
// The app talks to the site by postMessage: APP_READY, TITLE and ERROR, from its own address only. An app that
// sends nothing is running once its page has loaded.
import { PANE_MIN } from './metrics.js';
import { C } from './theme.js';
import { RV, textWidth, fitText } from './font.js';
import { urlOf } from './catalog.js';
import { T } from './texts.js';
import { view } from './view.js';
import { box, button } from './widgets.js';

const APP_W = 320, APP_H = 180;
const TOOLBAR = 16, FOOTER = 14, STATUS = 14;
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
      if (this.status === 'loading') this.status = 'ready';
    } catch (err) {
      this.status = 'error';
      this.error = T.loadError + this.path;
    }
    this.ws.requestDraw();
  }

  restart() {
    this.status = 'loading';
    this.frame.src = urlOf(this.path + '/index.html');
    this.ws.requestDraw();
  }

  // Puts the iframe in the well, centered, and scaled. The wrapper clips it to the well.
  // The well and the scale are in layout pixels; a layout pixel is view.ui device pixels, and the page's CSS
  // pixels are the device pixels divided by the ratio.
  place(well) {
    const k = view.ui / view.dpr;
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

  // The toolbar: the scales, then the Restart button with its red Rs icon.
  drawToolbar(p, r, hits) {
    let x = r.x;
    for (const mode of SCALES) {
      const label = SCALE_LABEL[mode];
      const b = { x, y: r.y, w: textWidth(RV, label) + 12, h: TOOLBAR };
      button(p, hits, b, label, { on: this.scale === mode, click: () => { this.scale = mode; this.ws.requestDraw(); } });
      x += b.w + 2;
    }
    x += 6;
    const icon = { x, y: r.y, w: 18, h: TOOLBAR };
    const rs = { x: icon.x, y: icon.y, w: icon.w + 4 + textWidth(RV, T.appRestart) + 8, h: TOOLBAR };
    box(p, icon, true, C.btn, 2);
    p.text(RV, icon.x + Math.floor((icon.w - textWidth(RV, 'Rs')) / 2), icon.y + 4, 'Rs', C.red);
    p.text(RV, icon.x + icon.w + 4, icon.y + 4, T.appRestart, C.text);
    hits.add(rs, { click: () => this.restart() });
  }

  // Drawing: a toolbar, the navy well with a status line and the app, and a footer with the address and the keys.
  draw(p, r, hits, focused = false) {
    this.drawnAt = this.ws.frame;
    this.drawToolbar(p, { x: r.x, y: r.y }, hits);

    const well = { x: r.x, y: r.y + TOOLBAR + 4, w: r.w, h: r.h - TOOLBAR - 4 - FOOTER - 4 };
    p.fill(well.x, well.y, well.w, well.h, C.cb);
    p.bevel(well, 1, false);
    const inner = { x: well.x + 1, y: well.y + 1, w: well.w - 2, h: well.h - 2 };
    const status = this.status === 'error' ? this.error || T.appNoIndex : this.status === 'loading' ? T.appLoading : T.appRunning;
    p.text(RV, inner.x + 6, inner.y + 3, fitText(RV, status, inner.w - 12), this.status === 'error' ? C.red : C.ct);
    const area = { x: inner.x, y: inner.y + STATUS, w: inner.w, h: inner.h - STATUS };
    if (this.status === 'error') {
      this.hide();
    } else {
      this.place(area);
    }

    const foot = { x: r.x, y: r.y + r.h - FOOTER, w: r.w, h: FOOTER };
    const keys = { w: textWidth(RV, 'Keyboard: app') + 12, x: foot.x + foot.w - textWidth(RV, 'Keyboard: app') - 12 };
    const address = { x: foot.x, y: foot.y, w: foot.w - keys.w - 2, h: FOOTER };
    const scaleText = this.scale === 'fit' ? 'fit' : `×${scaleFor(this.scale, area.w, area.h)}`;
    p.fill(address.x, address.y, address.w, address.h, C.inset);
    p.bevel(address, 1, false);
    p.text(RV, address.x + 4, address.y + 4, `index.html · ${APP_W}×${APP_H} · ${scaleText}`, C.bright);
    p.fill(keys.x, foot.y, foot.x + foot.w - keys.x, FOOTER, C.inset);
    p.bevel({ x: keys.x, y: foot.y, w: foot.x + foot.w - keys.x, h: FOOTER }, 1, false);
    p.text(RV, keys.x + 6, foot.y + 4, focused ? 'Keyboard: app' : 'Keyboard: —', focused ? C.sel : C.cov);
  }

  dispose() {
    this.wrap.remove();
  }
}
