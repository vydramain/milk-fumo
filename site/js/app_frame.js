import { parseAppMessage, isTrustedOrigin } from './app_protocol.js';
import { fileUrl } from './catalog.js';

// The iframe of one app. It is created once and never moved in the DOM: a tile move only restyles it,
// so the app keeps its state and is not reloaded. Coordinating tiles is the caller's job.

const ENTRY_FILE = '/index.html'; // the entry point of an app folder, appended to its path
const EVENT_MESSAGE = 'message';
const POSITION_ABSOLUTE = 'absolute';
const DISPLAY_SHOWN = 'block';
const DISPLAY_HIDDEN = 'none';

// Throws with the reason when an argument cannot work; a silent failure would leave an empty tile.
function checkArguments(parent, path, siteOrigin, onMessage) {
  if (!parent || typeof parent.appendChild !== 'function') {
    throw new Error('createAppFrame: parent must have appendChild');
  }
  if (typeof path !== 'string') {
    throw new Error(`createAppFrame: path must be a string, got ${typeof path}`);
  }
  if (typeof siteOrigin !== 'string' || siteOrigin === '') {
    throw new Error('createAppFrame: siteOrigin must be a non-empty string');
  }
  if (typeof onMessage !== 'function') {
    throw new Error(`createAppFrame: onMessage must be a function, got ${typeof onMessage}`);
  }
}

// Window listener that passes on only this iframe's messages from the site origin.
function makeListener(iframe, siteOrigin, onMessage) {
  return (event) => {
    if (event.source !== iframe.contentWindow) return;
    if (!isTrustedOrigin(event.origin, siteOrigin)) return;
    const message = parseAppMessage(event.data);
    if (message !== null) onMessage(message);
  };
}

function placeFrame(iframe, rect) {
  iframe.style.left = `${rect.x}px`;
  iframe.style.top = `${rect.y}px`;
  iframe.style.width = `${rect.w}px`;
  iframe.style.height = `${rect.h}px`;
}

// Creates the iframe of the app at path (its folder, relative to the content root) and appends it to parent.
export function createAppFrame(parent, path, siteOrigin, onMessage) {
  checkArguments(parent, path, siteOrigin, onMessage);
  const iframe = document.createElement('iframe');
  iframe.src = fileUrl(path + ENTRY_FILE);
  iframe.style.position = POSITION_ABSOLUTE;
  parent.appendChild(iframe);
  const listener = makeListener(iframe, siteOrigin, onMessage);
  window.addEventListener(EVENT_MESSAGE, listener);
  return {
    iframe,
    place: (rect) => placeFrame(iframe, rect),
    show: () => { iframe.style.display = DISPLAY_SHOWN; },
    hide: () => { iframe.style.display = DISPLAY_HIDDEN; },
    dispose: () => {
      window.removeEventListener(EVENT_MESSAGE, listener);
      iframe.remove();
    },
  };
}
