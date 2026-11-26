// The view's units, kept by main.js. A layout pixel is `ui` device pixels: the UI scale, 1, 1.5 or 2. `dpr` is the
// device pixel ratio. The app panes place their frames in CSS pixels, so they need both.
export const view = { dpr: 1, ui: 1 };

// Snap both edges so adjacent rectangles share the same device pixel boundary.
export function rasterRect(x, y, w, h, scale) {
  const left = Math.round(x * scale), top = Math.round(y * scale);
  return [left, top, Math.round((x + w) * scale) - left, Math.round((y + h) * scale) - top];
}

export function placeOverlay(style, { x, y, w, h }) {
  const [left, top, width, height] = rasterRect(x, y, w, h, view.ui);
  const d = view.dpr;
  style.left = `${left / d}px`;
  style.top = `${top / d}px`;
  style.width = `${width / d}px`;
  style.height = `${height / d}px`;
}
