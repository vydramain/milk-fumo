import { CONTENT_URL } from './config.js';

// Read-only access to the content directory: folder listings and file URLs.
// Knows nothing about storage; nginx serves /content/ as JSON listings.

const SEPARATOR = '/';
const APP_SUFFIX = '.exe'; // a folder with this suffix is an app, not a folder
export const ENTRY_DIRECTORY = 'directory'; // type nginx gives to a folder entry

// Kinds of entries shown in the interface.
export const KIND = Object.freeze({
  FOLDER: 'folder', // a plain folder
  APP: 'app', // a folder whose name ends in APP_SUFFIX
  AUDIO: 'audio', // mp3, ogg, wav, flac
  IMAGE: 'image', // png, jpg, jpeg, webp
  VIDEO: 'video', // mp4, webm
  NOTE: 'note', // md
  TEXT: 'text', // txt
  OTHER: 'other', // any other file
});

// File extension -> kind; an extension missing from this table gives KIND.OTHER.
const KIND_BY_EXT = {
  mp3: KIND.AUDIO,
  ogg: KIND.AUDIO,
  wav: KIND.AUDIO,
  flac: KIND.AUDIO,
  png: KIND.IMAGE,
  jpg: KIND.IMAGE,
  jpeg: KIND.IMAGE,
  webp: KIND.IMAGE,
  mp4: KIND.VIDEO,
  webm: KIND.VIDEO,
  md: KIND.NOTE,
  txt: KIND.TEXT,
};

function encodePath(path) {
  return path.split(SEPARATOR).map((segment) => encodeURIComponent(segment)).join(SEPARATOR);
}

// Relative URL of a file or folder; segments are encoded so names with spaces or '#' stay intact.
export function fileUrl(path) {
  return CONTENT_URL + encodePath(path);
}

// Returns the entries of the folder at path ('' is the content root) exactly as nginx sends them.
export async function listDirectory(path) {
  // The trailing slash makes nginx answer directly instead of redirecting.
  const url = path ? fileUrl(path) + SEPARATOR : CONTENT_URL;

  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`Cannot reach ${url}: ${error.message}`);
  }
  if (!response.ok) {
    throw new Error(`Listing ${url} failed: HTTP ${response.status}`);
  }

  try {
    return await response.json();
  } catch (error) {
    throw new Error(`Listing ${url} is not valid JSON: ${error.message}`);
  }
}

// Kind of an entry for the interface. App suffix is matched without regard to case.
export function kindOf(entry) {
  if (entry.type === ENTRY_DIRECTORY) {
    return entry.name.toLowerCase().endsWith(APP_SUFFIX) ? KIND.APP : KIND.FOLDER;
  }
  const dot = entry.name.lastIndexOf('.');
  const ext = dot < 0 ? '' : entry.name.slice(dot + 1).toLowerCase();
  return Object.hasOwn(KIND_BY_EXT, ext) ? KIND_BY_EXT[ext] : KIND.OTHER;
}

// Path of an entry relative to the content root.
export function entryPath(dirPath, name) {
  return dirPath ? dirPath + SEPARATOR + name : name;
}
