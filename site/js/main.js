// Page entry point: creates the screen and paints it with the darkest surface color.
import { createScreen } from './canvas.js';
import { SURFACE_DARK } from './theme.js';

// id of the element that holds the screen (site/index.html).
const SCREEN_ID = 'screen';

const screenElement = document.getElementById(SCREEN_ID);
if (!screenElement) {
  throw new Error(`main: element #${SCREEN_ID} not found, the page cannot create its screen`);
}

// The page background outside the canvas uses the same palette color.
document.body.style.background = SURFACE_DARK;

// Redraws the whole buffer; the canvas requests this after the first measurement and on every change of the buffer size.
createScreen(screenElement, (ctx, size) => {
  ctx.fillStyle = SURFACE_DARK;
  ctx.fillRect(0, 0, size.width, size.height);
});
