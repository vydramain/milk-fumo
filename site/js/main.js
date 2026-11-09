// The entry point: the canvas, the frame loop, the events; the pocket version in place of the workspace on a
// touch-first device, and the screen that replaces the workspace when the screen is too small.
import { Workspace } from './workspace.js';
import { Pocket, layoutOf } from './pocket.js';
import { Paint } from './paint.js';
import { messageScreen } from './widgets.js';
import { T } from './texts.js';
import { SCREEN_MIN, VIEWPORT_MIN } from './metrics.js';
import { view } from './view.js';

// The mode is chosen once, at load: a touch-first device gets the pocket version, any other the workspace. A device
// that changes its primary input keeps its mode until the page is reloaded.
const MOBILE = matchMedia('(hover: none) and (pointer: coarse)').matches;
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
let ws = null;
let pocket = null;
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

// The buffer in device pixels; the element's CSS size is the buffer divided by the ratio.
function fitCanvas(size, d) {
  canvas.width = size.w;
  canvas.height = size.h;
  canvas.style.width = size.w / d + 'px';
  canvas.style.height = size.h / d + 'px';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Draws a frame.
function draw() {
  queued = false;
  const d = dpr();
  view.dpr = d;
  if (pocket) {
    // The pocket version: the window, at the largest whole scale that keeps a 240 px wide layout.
    const size = { w: Math.round(innerWidth * d), h: Math.round(innerHeight * d) };
    fitCanvas(size, d);
    const L = layoutOf(size.w, size.h);
    view.ui = L.k;
    pocket.render(new Paint(ctx, L.k), L.w, L.h);
    if (pocket.animated()) requestDraw();
    return;
  }
  // The site opens at the largest scale the window holds; a window that shrank below the current scale drops to the largest that fits.
  if (!started) { started = true; view.ui = ws.largestScale(); }
  if (view.ui !== 1 && !ws.fitsScale(view.ui)) view.ui = ws.largestScale();
  const small = screenTooSmall();
  // The fullscreen video is drawn at the window's size, so its panel is always on screen.
  fitCanvas(small || ws.fullVideo ? { w: Math.round(innerWidth * d), h: Math.round(innerHeight * d) } : canvasSize(), d);
  const size = { w: canvas.width, h: canvas.height };
  if (small) messageScreen(new Paint(ctx, 1), size, T.tooSmallTitle, [`${T.tooSmallNeeds} ${SCREEN_MIN.w}×${SCREEN_MIN.h}`, `${T.tooSmallNow} ${screen.width}×${screen.height}`, T.tooSmallHint]);
  else ws.render(new Paint(ctx, view.ui), Math.floor(size.w / view.ui), Math.floor(size.h / view.ui));
  if (!small && ws.animated()) requestDraw();
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
const target = () => pocket || ws;

canvas.addEventListener('pointerdown', (e) => {
  if (!MOBILE && screenTooSmall()) return;
  canvas.focus();
  canvas.setPointerCapture(e.pointerId);
  const { x, y } = pointer(e);
  target().pointerDown(x, y);
});
canvas.addEventListener('pointermove', (e) => {
  const { x, y } = pointer(e);
  target().pointerMove(x, y);
});
canvas.addEventListener('pointerup', (e) => {
  const { x, y } = pointer(e);
  target().pointerUp(x, y);
});
canvas.addEventListener('pointercancel', (e) => {
  if (pocket) { pocket.cancel(); return; }
  const { x, y } = pointer(e);
  ws.pointerUp(x, y);
});
// A double click on a video's frame, or anywhere in its fullscreen, toggles the fullscreen.
canvas.addEventListener('dblclick', (e) => {
  if (screenTooSmall() || MOBILE) return;
  const { x, y } = pointer(e);
  if (ws.doubleClick(x, y)) requestDraw();
});
canvas.addEventListener('wheel', (e) => {
  if (!MOBILE && screenTooSmall()) return;
  const { x, y } = pointer(e);
  if (target().wheel(x, y, e.deltaY)) {
    e.preventDefault();
    requestDraw();
  }
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (screenTooSmall() || MOBILE) return;
  // A Ctrl combination is held as 'Ctrl+' + code too, for the cells of Ctrl keys.
  const codes = e.ctrlKey ? [e.code, 'Ctrl+' + e.code] : [e.code];
  if (codes.some((c) => !ws.held.has(c))) { codes.forEach((c) => ws.held.add(c)); requestDraw(); }
  if (ws.key(e)) {
    e.preventDefault();
    requestDraw();
  }
});

window.addEventListener('keyup', (e) => {
  if (MOBILE) return;
  if (ws.held.delete(e.code) | ws.held.delete('Ctrl+' + e.code)) requestDraw();
});

// A click that goes into an app's frame gives the focus to that app's tile. Keys released outside the window are lost.
window.addEventListener('blur', () => {
  if (MOBILE) return;
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
  for (const app of target().apps()) app.message(e);
});

// Leaving the browser's fullscreen (Esc, or the browser's own controls) returns the video to its tile.
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) { if (pocket) pocket.full = false; else ws.fullVideo = null; }
  requestDraw();
});

window.addEventListener('resize', requestDraw);

if (MOBILE) pocket = new Pocket(requestDraw, { history: true });
else ws = new Workspace(requestDraw);
requestDraw();
