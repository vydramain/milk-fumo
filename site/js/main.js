// The entry point: the canvas, the frame loop, the events, and the two screens that replace the workspace
// when the screen is too small or the device is a touch-first one.
import { Workspace } from './workspace.js';
import { Paint } from './paint.js';
import { RV, textWidth } from './font.js';
import { C } from './theme.js';
import { T } from './texts.js';
import { SCREEN_MIN, VIEWPORT_MIN, TITLE_H } from './metrics.js';
import { view } from './view.js';

const MOBILE = matchMedia('(hover: none) and (pointer: coarse)');
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
let ws = null;
let queued = false;
let started = false;

// The layout's unit is a UI pixel: view.ui device pixels, 1 or 2 by Shift+S. The canvas buffer is the window in
// device pixels, so a font pixel is always a whole number of device pixels and nothing is smoothed.
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
    w: Math.max(Math.round(innerWidth * d), Math.round(VIEWPORT_MIN.w * d), min.w * view.ui),
    h: Math.max(Math.round(innerHeight * d), Math.round(VIEWPORT_MIN.h * d), min.h * view.ui),
  };
}

// Draws a frame. The buffer is in device pixels; the element's CSS size is the buffer divided by the ratio.
function draw() {
  queued = false;
  const d = dpr();
  view.dpr = d;
  // The site opens at the largest scale the window holds: 2x when it fits, else 1x.
  if (!started) { started = true; if (ws.fitsScale(2)) view.ui = 2; }
  // A window that shrank below the 2x layout goes back to 1x, the only scale every window holds.
  if (view.ui !== 1 && !ws.fitsScale(view.ui)) view.ui = 1;
  const mobile = MOBILE.matches;
  const small = !mobile && screenTooSmall();
  const size = mobile || small ? { w: Math.round(innerWidth * d), h: Math.round(innerHeight * d) } : canvasSize();
  canvas.width = size.w;
  canvas.height = size.h;
  canvas.style.width = size.w / d + 'px';
  canvas.style.height = size.h / d + 'px';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (mobile) drawMessage(new Paint(ctx, 1), size, null, T.mobile);
  else if (small) drawMessage(new Paint(ctx, 1), size, T.tooSmallTitle, [`${T.tooSmallNeeds} ${SCREEN_MIN.w}×${SCREEN_MIN.h}`, `${T.tooSmallNow} ${screen.width}×${screen.height}`, T.tooSmallHint]);
  else ws.render(new Paint(ctx, view.ui), Math.floor(size.w / view.ui), Math.floor(size.h / view.ui));
  if (!mobile && !small && ws.animated()) requestDraw();
}

// The screens that replace the workspace: a tile with a title and lines of text, or the text alone.
function drawMessage(p, size, title, lines) {
  p.fill(0, 0, size.w, size.h, C.dark);
  const lineList = Array.isArray(lines) ? lines : [lines];
  const head = title ? TITLE_H + 6 : 0;
  const w = 360;
  const h = 7 + head + 8 + lineList.length * 12 + 8 + 7;
  const frame = { x: Math.round((size.w - w) / 2), y: Math.round((size.h - h) / 2), w, h };
  p.fill(frame.x, frame.y, frame.w, frame.h, C.win);
  p.bevel(frame, 2, true);
  if (title) {
    const tr = { x: frame.x + 7, y: frame.y + 7, w: frame.w - 14, h: TITLE_H };
    p.dither(tr, C.win, C.lo);
    p.fill(tr.x + 14, tr.y, textWidth(RV, title) + 12, tr.h, C.win);
    p.text(RV, tr.x + 20, tr.y + 3, title, C.bright);
  }
  const body = { x: frame.x + 7, y: frame.y + 7 + head, w: frame.w - 14, h: h - 14 - head };
  p.fill(body.x, body.y, body.w, body.h, C.inset);
  lineList.forEach((s, i) => p.text(RV, body.x + 8, body.y + 8 + i * 12, s, C.text));
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

canvas.addEventListener('pointerdown', (e) => {
  if (screenTooSmall() || MOBILE.matches) return;
  canvas.focus();
  canvas.setPointerCapture(e.pointerId);
  const { x, y } = pointer(e);
  ws.pointerDown(x, y);
});
canvas.addEventListener('pointermove', (e) => {
  const { x, y } = pointer(e);
  ws.pointerMove(x, y);
});
canvas.addEventListener('pointerup', (e) => {
  const { x, y } = pointer(e);
  ws.pointerUp(x, y);
});
canvas.addEventListener('pointercancel', (e) => {
  const { x, y } = pointer(e);
  ws.pointerUp(x, y);
});
canvas.addEventListener('wheel', (e) => {
  if (screenTooSmall() || MOBILE.matches) return;
  const { x, y } = pointer(e);
  if (ws.wheel(x, y, e.deltaY)) {
    e.preventDefault();
    requestDraw();
  }
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (screenTooSmall() || MOBILE.matches) return;
  if (ws.key(e)) {
    e.preventDefault();
    requestDraw();
  }
});

// A click that goes into an app's frame gives the focus to that app's tile.
window.addEventListener('blur', () => {
  const el = document.activeElement;
  if (el && el.tagName === 'IFRAME') {
    ws.focusApp(el);
    requestDraw();
  }
});

// The apps' messages: each app is checked against its own frame.
window.addEventListener('message', (e) => {
  for (const app of ws.apps()) app.message(e);
});

window.addEventListener('resize', requestDraw);
MOBILE.addEventListener('change', requestDraw);

ws = new Workspace(requestDraw);
requestDraw();
