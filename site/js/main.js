// Page entry point: creates the screen and the app, and routes keyboard, pointer and loading to the app.
import { createScreen } from './canvas.js';
import { createApp } from './app.js';
import { listDirectory } from './catalog.js';

const screenElement = document.getElementById('screen');
if (!screenElement) {
  throw new Error('main: element #screen not found, the page cannot create its screen');
}

// createScreen requests its first redraw from a frame callback, so app exists when draw() runs.
let app;
const screen = createScreen(screenElement, (ctx, size) => app.draw(ctx, size));

// The initial rect is integer physical pixels; draw() replaces it with the measured buffer size.
app = createApp({
  screen: {
    x: 0,
    y: 0,
    w: Math.round(window.innerWidth * devicePixelRatio),
    h: Math.round(window.innerHeight * devicePixelRatio),
  },
  requestRedraw: () => screen.requestRedraw(),
  requestListing: listDirectory,
});

window.addEventListener('keydown', (event) => app.keyDown(event));
// Pointer coordinates are CSS pixels; the app works in physical pixels.
screen.canvas.addEventListener('pointerdown', (event) => {
  app.pointerDown(event.clientX * devicePixelRatio, event.clientY * devicePixelRatio);
});

// app.load() also shows the failure in the message line; the console keeps the full reason.
app.load().catch((error) => console.error(`main: cannot load the content root or notes: ${error?.message ?? error}`));
