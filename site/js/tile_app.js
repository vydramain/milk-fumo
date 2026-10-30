import { createAppFrame } from './app_frame.js';
import { drawText } from './font.js';
import { SUNKEN, TEXT } from './theme.js';
import { ROW_H, PAD, TILE_CONTENT_MIN_H } from './metrics.js';

// The tile of one app: a caption strip over the content, and the app's iframe placed in the content area below it.
// The iframe is created once; draw only places it and shows or hides it.

const APP_SUFFIX = '.exe'; // app folders end with this
const PATH_SEPARATOR = '/';
const TITLE_FONT = 'rv'; // font.js key of the captions, as in chrome.js
const RV_HEIGHT = 8; // glyph height of 'rv', in pixels
const CAPTION_Y = Math.floor((ROW_H - RV_HEIGHT) / 2); // the caption is centred in the strip
const LOADING_TEXT = 'loading...'; // shown while APP_READY has not come and the iframe is hidden
const RECT_MIN_H = ROW_H + TILE_CONTENT_MIN_H; // the caption strip plus the smallest content area

// Message types of app_protocol.js.
const TYPE_APP_READY = 'APP_READY';
const TYPE_APP_TITLE = 'APP_TITLE';
const TYPE_APP_ERROR = 'APP_ERROR';

// Throws with the reason when the tile cannot work; a silent failure would leave an empty tile.
function checkTileArguments(path, requestRedraw) {
  if (typeof path !== 'string' || !path.endsWith(APP_SUFFIX)) {
    throw new Error(`createAppTile: path must be a string ending in ${APP_SUFFIX}, got ${JSON.stringify(path)}`);
  }
  if (typeof requestRedraw !== 'function') {
    throw new Error(`createAppTile: requestRedraw must be a function, got ${typeof requestRedraw}`);
  }
}

// A rect is a caller contract: integer x, y, w, h, tall enough for the strip and the smallest content.
// A violation throws with the reason.
function checkRect(rect) {
  const { x, y, w, h } = rect ?? {};
  if (![x, y, w, h].every(Number.isInteger)) {
    throw new Error(`createAppTile: draw needs integer x, y, w and h, got ${JSON.stringify(rect)}`);
  }
  if (h < RECT_MIN_H) {
    throw new Error(`createAppTile: draw rect is ${h} high, minimum is ${RECT_MIN_H}`);
  }
}

// The name of the folder: the part of path after its last slash.
function folderName(path) {
  return path.slice(path.lastIndexOf(PATH_SEPARATOR) + 1);
}

// Records what the app reported. The closure in createAppTile calls requestRedraw after each message.
function applyMessage(app, message) {
  switch (message.type) {
    case TYPE_APP_READY:
      app.ready = true;
      break;
    case TYPE_APP_TITLE:
      app.title = message.title;
      break;
    case TYPE_APP_ERROR:
      app.error = message.message;
      break;
  }
}

// One row of text on a SUNKEN area, at the top of area.
function drawCaption(ctx, area, label) {
  ctx.fillStyle = SUNKEN;
  ctx.fillRect(area.x, area.y, area.w, area.h);
  drawText(ctx, label, area.x + PAD, area.y + CAPTION_Y, TITLE_FONT, TEXT);
}

// The content area below the caption strip.
function contentRect(rect) {
  return { x: rect.x, y: rect.y + ROW_H, w: rect.w, h: rect.h - ROW_H };
}

// Tile of the app at path (its folder, relative to the content root), with an iframe placed in the rect given to draw.
// requestRedraw is called after each message from the app.
export function createAppTile(parent, path, siteOrigin, requestRedraw) {
  checkTileArguments(path, requestRedraw);
  const app = { ready: false, title: null, error: null };
  const frame = createAppFrame(parent, path, siteOrigin, (message) => {
    applyMessage(app, message);
    requestRedraw();
  });
  frame.hide(); // not shown until the first draw places it
  const name = folderName(path);
  return {
    draw(ctx, rect, visible) {
      checkRect(rect);
      const strip = { x: rect.x, y: rect.y, w: rect.w, h: ROW_H };
      if (!visible) {
        frame.hide();
        // The iframe covers the content when it is shown, so the loading caption is drawn only here.
        if (!app.ready) drawCaption(ctx, strip, LOADING_TEXT);
        return;
      }
      frame.place(contentRect(rect));
      frame.show();
      drawCaption(ctx, strip, app.title ?? name);
    },
    dispose: () => frame.dispose(),
  };
}
