import { entryPath, kindOf } from './catalog.js';

// Pure state of the audio and video player. The media element is made by another module.
// Each function that returns a state returns a new one; none changes its argument.

const AUDIO_KIND = 'audio'; // kindOf value of audio files
const VIDEO_KIND = 'video'; // kindOf value of video files
const DEFAULT_VOLUME = 0.8; // start volume, 0..1
const VOLUME_MIN = 0; // silence
const VOLUME_MAX = 1; // full volume
const START_POSITION = 0; // seconds; a file always starts from the beginning
const NO_FIT = null; // audio has no scale; fit is null in its state

// Playback status of the player.
const STATUS = Object.freeze({
  STOPPED: 'stopped',
  PLAYING: 'playing',
  PAUSED: 'paused',
});

// Video scale, as in the README: Fit / 1x / 2x.
const FIT_MODES = Object.freeze({
  FIT: 'fit', // scaled to the frame
  ONE: '1x', // natural size
  TWO: '2x', // doubled size
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Seconds from the caller: must be a finite number that is not negative.
function checkSeconds(value, what) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Cannot set ${what}: expected a finite number of seconds >= 0, got ${value}`);
  }
}

// Changes the file of the set; the length of the new file is unknown until its metadata loads.
function moveTo(state, index) {
  return { ...state, index, position: START_POSITION, duration: 0 };
}

// Set of files of one kind (audio or video) in listing order; the current file is taken by name.
// Only video has a scale, so fit is null for audio.
export function createPlayer(folderEntries, currentName, kind) {
  const list = folderEntries.filter((entry) => kindOf(entry) === kind).map((entry) => entry.name);
  const index = list.indexOf(currentName);
  if (index < 0) {
    throw new Error(`Cannot open "${currentName}": it is not in the ${kind} set of the folder`);
  }
  const fit = kind === VIDEO_KIND ? FIT_MODES.FIT : NO_FIT;
  return {
    list,
    index,
    status: STATUS.STOPPED,
    position: START_POSITION,
    duration: 0,
    volume: DEFAULT_VOLUME,
    muted: false,
    loop: false,
    fit,
  };
}

export function play(state) {
  if (state.list.length === 0) {
    throw new Error('Cannot play: the set is empty');
  }
  return { ...state, status: STATUS.PLAYING };
}

// Only a playing file pauses; in any other status the state stays as it is.
export function pause(state) {
  const status = state.status === STATUS.PLAYING ? STATUS.PAUSED : state.status;
  return { ...state, status };
}

export function stop(state) {
  return { ...state, status: STATUS.STOPPED, position: START_POSITION };
}

// Length of the current file, reported by the media element once its metadata has loaded.
export function setDuration(state, seconds) {
  checkSeconds(seconds, 'duration');
  return { ...state, duration: seconds };
}

// Exact position, without clamping; seek is the clamped form.
export function setPosition(state, seconds) {
  checkSeconds(seconds, 'position');
  return { ...state, position: seconds };
}

// Position is clamped to [0, duration]. Duration 0 means the length is not known yet,
// so the upper bound is left open and only the lower bound applies.
export function seek(state, seconds) {
  if (!Number.isFinite(seconds)) {
    throw new Error(`Cannot seek: position must be a finite number of seconds, got ${seconds}`);
  }
  const upper = state.duration > 0 ? state.duration : Infinity;
  return { ...state, position: clamp(seconds, START_POSITION, upper) };
}

export function setVolume(state, value) {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot set volume: expected a finite number, got ${value}`);
  }
  return { ...state, volume: clamp(value, VOLUME_MIN, VOLUME_MAX) };
}

export function toggleMute(state) {
  return { ...state, muted: !state.muted };
}

export function toggleLoop(state) {
  return { ...state, loop: !state.loop };
}

export function setFit(state, mode) {
  if (state.fit === NO_FIT) {
    throw new Error('Cannot set fit: audio has no scale');
  }
  if (!Object.values(FIT_MODES).includes(mode)) {
    throw new Error(`Cannot set fit: unknown mode "${mode}"`);
  }
  return { ...state, fit: mode };
}

// After the last file: loop goes back to the first one, otherwise playback stops on the last one.
export function next(state) {
  if (state.list.length === 0) {
    throw new Error('Cannot move to the next file: the set is empty');
  }
  if (state.index + 1 < state.list.length) {
    return moveTo(state, state.index + 1);
  }
  if (state.loop) {
    return moveTo(state, 0);
  }
  return stop(state);
}

// On the first file the state stays as it is.
export function prev(state) {
  if (state.list.length === 0) {
    throw new Error('Cannot move to the previous file: the set is empty');
  }
  if (state.index > 0) {
    return moveTo(state, state.index - 1);
  }
  return { ...state };
}

export function currentPath(state, folderPath) {
  if (state.list.length === 0) {
    throw new Error('Cannot build the path: the set is empty');
  }
  return entryPath(folderPath, state.list[state.index]);
}

// File names of the set for display; the current one is marked.
export function playlistLabels(state) {
  return state.list.map((name, index) => ({ name, current: index === state.index }));
}
