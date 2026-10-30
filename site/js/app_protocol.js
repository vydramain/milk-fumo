// Protocol between the site and an app in its iframe, over postMessage (taken from bird-fumo, without
// its privileged messages and token). Pure: it checks and builds messages; subscribing to 'message'
// is main.js's job. Apps are trusted and share the site's origin (owner decision 6).

const TYPE_APP_READY = 'APP_READY'; // the app has loaded and is ready
const TYPE_APP_TITLE = 'APP_TITLE'; // the app sets its title; field: title
const TYPE_APP_ERROR = 'APP_ERROR'; // the app reports an error; field: message
const TYPE_OPEN_FILE = 'OPEN_FILE'; // the site asks to open a file; field: path, relative to the content root

// Lengths are in UTF-16 units, as String.length counts them (an emoji is 2 units).
const TITLE_MAX_LENGTH = 200; // longer titles are rejected, not truncated
const MESSAGE_MAX_LENGTH = 500; // longer error texts are rejected, not truncated
const ROOT_PREFIX = '/'; // an absolute path would escape the content root

function isObject(value) {
  return typeof value === 'object' && value !== null;
}

// The value if it is a string no longer than maxLength; otherwise null, with a warning naming the cause.
function textField(type, field, value, maxLength) {
  if (typeof value !== 'string') {
    console.warn(`${type}: ${field} is not a string`);
    return null;
  }
  if (value.length > maxLength) {
    console.warn(`${type}: ${field} longer than ${maxLength}`);
    return null;
  }
  return value;
}

// Parses event.data into { type, ... } for one of the app messages.
// null means "not our message" (other scripts' messages reach the listener too, so it is silent),
// or "our type, but a field failed the check"; the reason is then in a console warning.
export function parseAppMessage(data) {
  if (!isObject(data)) return null;
  switch (data.type) {
    case TYPE_APP_READY:
      return { type: TYPE_APP_READY };
    case TYPE_APP_TITLE: {
      const title = textField(TYPE_APP_TITLE, 'title', data.title, TITLE_MAX_LENGTH);
      return title === null ? null : { type: TYPE_APP_TITLE, title };
    }
    case TYPE_APP_ERROR: {
      const message = textField(TYPE_APP_ERROR, 'message', data.message, MESSAGE_MAX_LENGTH);
      return message === null ? null : { type: TYPE_APP_ERROR, message };
    }
    default:
      return null;
  }
}

// The OPEN_FILE message the site sends to an app. Throws with the reason if path is empty or starts with a slash.
export function makeOpenFile(path) {
  if (typeof path !== 'string' || path === '') {
    throw new Error('OPEN_FILE: path must be a non-empty string');
  }
  if (path.startsWith(ROOT_PREFIX)) {
    throw new Error(`OPEN_FILE: path must be relative to the content root, got "${path}"`);
  }
  return { type: TYPE_OPEN_FILE, path };
}

// True when the message origin equals the site origin. The comparison is exact: no case folding.
export function isTrustedOrigin(origin, siteOrigin) {
  return typeof siteOrigin === 'string' && origin === siteOrigin;
}
