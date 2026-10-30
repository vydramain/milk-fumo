// Full-window canvas whose buffer matches the screen's physical pixels.
// Redraws only when requested, so an idle page does not load the processor.

// The only context type the screen draws with (bitmap tables and images, no WebGL).
const CONTEXT_TYPE = '2d';
// Window resize changes the window's CSS size, so the canvas CSS size is set again here.
const WINDOW_RESIZE_EVENT = 'resize';

// Creates a canvas filling the window inside parent. draw(ctx, size) runs on each redraw.
export function createScreen(parent, draw) {
  if (!parent) {
    throw new Error('createScreen: parent element is required');
  }
  if (typeof draw !== 'function') {
    throw new Error('createScreen: draw must be a function');
  }
  // The property is checked on the prototype: an instance exists only after the observer reports.
  const supportsDevicePixelBox = typeof ResizeObserverEntry !== 'undefined'
    && 'devicePixelContentBoxSize' in ResizeObserverEntry.prototype;
  if (!supportsDevicePixelBox) {
    throw new Error('createScreen: ResizeObserver devicePixelContentBoxSize is not supported by this browser');
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext(CONTEXT_TYPE);
  if (!ctx) {
    throw new Error('createScreen: 2d canvas context is not available');
  }
  canvas.style.display = 'block';
  parent.appendChild(canvas);

  // Buffer size in physical pixels; null until the first measurement.
  let current = null;
  let redrawQueued = false;

  // Setting canvas.width resets the context state, so smoothing is switched off after every change.
  function resize(next) {
    if (current && next.width === current.width && next.height === current.height) {
      return;
    }
    current = next;
    canvas.width = next.width;
    canvas.height = next.height;
    ctx.imageSmoothingEnabled = false;
    requestRedraw();
  }

  // One redraw per frame at most; a request made while one is queued adds nothing.
  // Exception to the rule that an early exit reports its reason: before the first measurement
  // the early exit is normal (no buffer yet), and resize() requests the first redraw itself.
  function requestRedraw() {
    if (!current || redrawQueued) {
      return;
    }
    redrawQueued = true;
    requestAnimationFrame(() => {
      redrawQueued = false;
      draw(ctx, current);
    });
  }

  // The buffer size is the physical size of the canvas box, as the browser reports it.
  const observer = new ResizeObserver((entries) => {
    const box = entries[0].devicePixelContentBoxSize[0];
    resize({ width: box.inlineSize, height: box.blockSize });
  });

  // The CSS size follows the window; the buffer follows the observer, which reports the first size too.
  function sizeToWindow() {
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
  }

  window.addEventListener(WINDOW_RESIZE_EVENT, sizeToWindow);
  observer.observe(canvas);
  sizeToWindow();

  return {
    canvas,
    ctx,
    requestRedraw,
    size: () => current,
  };
}
