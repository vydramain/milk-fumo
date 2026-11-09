// The entry point: the canvas, the frame loop, the events; the pocket version in place of the workspace on a
// touch-first device, and the screen that replaces the workspace when the screen is too small.
import { Workspace, SCALES } from './workspace.js';
import { Pocket, layoutOf } from './pocket.js';
import { Paint } from './paint.js';
import { messageScreen } from './widgets.js';
import { T } from './texts.js';
import { SCREEN_MIN, VIEWPORT_MIN } from './metrics.js';
import { view } from './view.js';

const MOBILE = matchMedia('(hover: none) and (pointer: coarse)');
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
let ws = null;
let pocket = null;          // made on the first frame drawn for a touch-first device
let queued = false;
let started = false;

// The layout's unit is a UI pixel: view.ui device pixels, 1, 1.5 or 2 by Shift+S. The canvas buffer is the window in
// device pixels and nothing is smoothed: a font pixel is a whole number of device pixels at 1x and 2x, and 1 or 2 at
// 1.5x, so letters there are uneven.
function dpr() { return window.devicePixelRatio || 1; }

function screenTooSmall() {
  return screen.width < SCREEN_MIN.w || screen.height < SCREEN_MIN.h;
}

// The canvas, in device pixels: the window, or the minimum of the viewport (960x540 CSS pixels) or of the layout
// when the window is smaller. Then the page scrolls.
function canvasSize() {
  const d = dpr();
  const min = ws.minimum();
  return {
    w: Math.max(Math.round(innerWidth * d), Math.round(VIEWPORT_MIN.w * d), Math.ceil(min.w * view.ui)),
    h: Math.max(Math.round(innerHeight * d), Math.round(VIEWPORT_MIN.h * d), Math.ceil(min.h * view.ui)),
  };
}

// Draws a frame. The buffer is in device pixels; the element's CSS size is the buffer divided by the ratio.
function draw() {
  queued = false;
  const d = dpr();
  view.dpr = d;
  // The site opens at the largest scale the window holds; a window that shrank below the current scale drops to the largest that fits.
  const mobile = MOBILE.matches;
  // The pocket version sets view.ui to its own whole scale; the desktop takes one of its scales back.
  if (!started || (!mobile && !SCALES.includes(view.ui))) { started = true; view.ui = ws.largestScale(); }
  if (!mobile && view.ui !== 1 && !ws.fitsScale(view.ui)) view.ui = ws.largestScale();
  const small = !mobile && screenTooSmall();
  // The fullscreen video is drawn at the window's size, so its panel is always on screen.
  const size = mobile || small || ws.fullVideo ? { w: Math.round(innerWidth * d), h: Math.round(innerHeight * d) } : canvasSize();
  canvas.width = size.w;
  canvas.height = size.h;
  canvas.style.width = size.w / d + 'px';
  canvas.style.height = size.h / d + 'px';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (mobile) {
    const L = layoutOf(size.w, size.h);
    view.ui = L.k;
    if (!pocket) pocket = new Pocket(requestDraw, { history: true });
    pocket.render(new Paint(ctx, L.k), L.w, L.h);
    if (pocket.animated()) requestDraw();
  } else if (small) messageScreen(new Paint(ctx, 1), size, T.tooSmallTitle, [`${T.tooSmallNeeds} ${SCREEN_MIN.w}×${SCREEN_MIN.h}`, `${T.tooSmallNow} ${screen.width}×${screen.height}`, T.tooSmallHint]);
  else ws.render(new Paint(ctx, view.ui), Math.floor(size.w / view.ui), Math.floor(size.h / view.ui));
  if (!mobile && !small && ws.animated()) requestDraw();
  const cursor = ws.cursorHidden() ? 'none' : '';
  if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
}

function requestDraw() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(draw);
}

// The pointer in the layout's units.
function pointer(e) {
  const r = canvas.getBoundingClientRect();
  const d = dpr() / view.ui;
  return { x: (e.clientX - r.left) * d, y: (e.clientY - r.top) * d };
}

// The pointer goes to the pocket version on a touch-first device, else to the workspace.
const target = () => (MOBILE.matches ? pocket : ws);

canvas.addEventListener('pointerdown', (e) => {
  if (!MOBILE.matches && screenTooSmall()) return;
  if (!target()) return;
  canvas.focus();
  canvas.setPointerCapture(e.pointerId);
  const { x, y } = pointer(e);
  target().pointerDown(x, y);
});
canvas.addEventListener('pointermove', (e) => {
  if (!target()) return;
  const { x, y } = pointer(e);
  target().pointerMove(x, y);
});
canvas.addEventListener('pointerup', (e) => {
  if (!target()) return;
  const { x, y } = pointer(e);
  target().pointerUp(x, y);
});
canvas.addEventListener('pointercancel', (e) => {
  if (!target()) return;
  if (MOBILE.matches) { pocket.cancel(); return; }
  const { x, y } = pointer(e);
  ws.pointerUp(x, y);
});
// A double click on a video's frame, or anywhere in its fullscreen, toggles the fullscreen.
canvas.addEventListener('dblclick', (e) => {
  if (screenTooSmall() || MOBILE.matches) return;
  const { x, y } = pointer(e);
  if (ws.doubleClick(x, y)) requestDraw();
});
canvas.addEventListener('wheel', (e) => {
  if ((!MOBILE.matches && screenTooSmall()) || !target()) return;
  const { x, y } = pointer(e);
  if (target().wheel(x, y, e.deltaY)) {
    e.preventDefault();
    requestDraw();
  }
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (screenTooSmall() || MOBILE.matches) return;
  // A Ctrl combination is held as 'Ctrl+' + code too, for the cells of Ctrl keys.
  const codes = e.ctrlKey ? [e.code, 'Ctrl+' + e.code] : [e.code];
  if (codes.some((c) => !ws.held.has(c))) { codes.forEach((c) => ws.held.add(c)); requestDraw(); }
  if (ws.key(e)) {
    e.preventDefault();
    requestDraw();
  }
});

window.addEventListener('keyup', (e) => {
  if (ws.held.delete(e.code) | ws.held.delete('Ctrl+' + e.code)) requestDraw();
});

// A click that goes into an app's frame gives the focus to that app's tile. Keys released outside the window are lost.
window.addEventListener('blur', () => {
  ws.held.clear();
  requestDraw();
  const el = document.activeElement;
  if (el && el.tagName === 'IFRAME') {
    ws.focusApp(el);
    requestDraw();
  }
});

// The apps' messages: each app is checked against its own frame.
window.addEventListener('message', (e) => {
  for (const app of ws.apps()) app.message(e);
  if (pocket) for (const app of pocket.apps()) app.message(e);
});

// Leaving the browser's fullscreen (Esc, or the browser's own controls) returns the video to its tile.
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) { ws.fullVideo = null; if (pocket) pocket.full = false; }
  requestDraw();
});

window.addEventListener('resize', requestDraw);
MOBILE.addEventListener('change', requestDraw);

ws = new Workspace(requestDraw);
requestDraw();
