// The entry point: the canvas, the frame loop, the events, and the two screens that replace the workspace
// when the screen is too small or the device is a touch-first one.
import { Workspace } from './workspace.js';
import { Paint } from './paint.js';
import { RV, textWidth } from './font.js';
import { C } from './theme.js';
import { T } from './texts.js';
import { SCREEN_MIN, VIEWPORT_MIN, TITLE_H } from './metrics.js';

const MOBILE = matchMedia('(hover: none) and (pointer: coarse)');
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
let ws = null;
let queued = false;

// The layout's unit is the device pixel: the canvas buffer is the window in device pixels, and each unit is one of
// them. So a font pixel is always one whole device pixel and nothing is smoothed, whatever the screen scale.
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
    w: Math.max(Math.round(innerWidth * d), Math.round(VIEWPORT_MIN.w * d), min.w),
    h: Math.max(Math.round(innerHeight * d), Math.round(VIEWPORT_MIN.h * d), min.h),
  };
}

// Draws a frame. The buffer is in device pixels; the element's CSS size is the buffer divided by the ratio.
function draw() {
  queued = false;
  const d = dpr();
  const mobile = MOBILE.matches;
  const small = !mobile && screenTooSmall();
  const size = mobile || small ? { w: Math.round(innerWidth * d), h: Math.round(innerHeight * d) } : canvasSize();
  canvas.width = size.w;
  canvas.height = size.h;
  canvas.style.width = size.w / d + 'px';
  canvas.style.height = size.h / d + 'px';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const paint = new Paint(ctx, 1);
  if (mobile) drawMessage(paint, size, null, T.mobile);
  else if (small) drawMessage(paint, size, T.tooSmallTitle, [`${T.tooSmallNeeds} ${SCREEN_MIN.w}×${SCREEN_MIN.h}`, `${T.tooSmallNow} ${screen.width}×${screen.height}`, T.tooSmallHint]);
  else ws.render(paint, size.w, size.h);
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

// The pointer in device pixels, the layout's units.
function pointer(e) {
  const r = canvas.getBoundingClientRect();
  const d = dpr();
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
