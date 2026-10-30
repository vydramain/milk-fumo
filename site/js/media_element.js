import { fileUrl } from './catalog.js';

// Wrapper over an HTMLMediaElement that the script creates and never inserts into the page.
// Holds no player state (that is player.js): it turns commands into element calls and reports events back.

const KIND = Object.freeze({ AUDIO: 'audio', VIDEO: 'video' }); // element tags the module creates
const PRELOAD = 'metadata'; // preload is a hint: metadata is requested before playback, the browser may load more or ignore it
const VOLUME_MIN = 0; // silence
const VOLUME_MAX = 1; // full volume
const START_POSITION = 0; // seconds; stop returns to the beginning
const FRAME_READY = 2; // readyState HAVE_CURRENT_DATA: a frame can be drawn

// Media element events the wrapper listens to.
const EVENT = Object.freeze({ TIME: 'timeupdate', META: 'loadedmetadata', ENDED: 'ended', ERROR: 'error' });

function checkKind(kind) {
  if (!Object.values(KIND).includes(kind)) {
    throw new Error(`Cannot create a media element: kind must be "audio" or "video", got "${kind}"`);
  }
}

function checkSeconds(value) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Cannot seek: expected a finite number of seconds >= 0, got ${value}`);
  }
}

// Out-of-range volume is clamped to [0, 1]; a value that is not a finite number is an error.
function clampVolume(value) {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot set volume: expected a finite number, got ${value}`);
  }
  return Math.min(Math.max(value, VOLUME_MIN), VOLUME_MAX);
}

// Reason of a failed element: MediaError code and message; code is null when the element gives none.
function describeError(error) {
  return error ? { code: error.code, message: error.message } : { code: null, message: 'no MediaError' };
}

// Element of the given kind, created by the script and not appended to the document.
export function createMediaElement(kind) {
  checkKind(kind);
  const element = document.createElement(kind);
  element.preload = PRELOAD;
  const listeners = [];

  function listen(name, handler) {
    element.addEventListener(name, handler);
    listeners.push([name, handler]);
  }

  return {
    element,
    load(path) {
      element.src = fileUrl(path);
    },
    // Returns the promise of element.play(); a rejected promise is the caller's to handle.
    play() {
      return element.play();
    },
    pause() {
      element.pause();
    },
    stop() {
      element.pause();
      element.currentTime = START_POSITION;
    },
    seek(seconds) {
      checkSeconds(seconds);
      element.currentTime = seconds;
    },
    setVolume(value) {
      element.volume = clampVolume(value);
    },
    setMuted(flag) {
      element.muted = Boolean(flag);
    },
    setLoop(flag) {
      element.loop = Boolean(flag);
    },
    onTime(callback) {
      listen(EVENT.TIME, () => callback(element.currentTime));
    },
    onMeta(callback) {
      listen(EVENT.META, () => callback(element.duration));
    },
    onEnded(callback) {
      listen(EVENT.ENDED, () => callback());
    },
    onError(callback) {
      listen(EVENT.ERROR, () => callback(describeError(element.error)));
    },
    dispose() {
      listeners.forEach(([name, handler]) => element.removeEventListener(name, handler));
      listeners.length = 0;
      element.pause();
      element.removeAttribute('src');
      element.load();
    },
  };
}

function checkRect(rect) {
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isInteger)) {
    throw new Error(`Cannot draw a video frame: rect must have whole pixel coordinates, got ${JSON.stringify(rect)}`);
  }
}

// Draws the current frame of a video element into rect ({ x, y, width, height }).
// Returns false and draws nothing while no frame is loaded yet.
export function drawVideoFrame(ctx, element, rect) {
  checkRect(rect);
  if (element.readyState < FRAME_READY) {
    return false;
  }
  ctx.drawImage(element, rect.x, rect.y, rect.width, rect.height);
  return true;
}
