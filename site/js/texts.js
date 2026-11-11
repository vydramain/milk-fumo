// All interface texts. The keys are shown as their names in the environment bar and in the tutorial.
const ARROW_CODES = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
// `codes` are the keys held with Shift (and with Ctrl when `ctrl`) that draw the cell sunken.
export const ENV_CELLS = [
  { key: 'Shift+arrows', label: 'Focus', command: 'focus', codes: ARROW_CODES },
  { key: 'Shift+Enter', label: 'Open', command: 'open-pmc', codes: ['Enter', 'NumpadEnter'] },
  { key: 'Ctrl+Shift+arrows', label: 'Move', command: 'move', codes: ARROW_CODES, ctrl: true },
  { key: 'Shift+W', label: 'Tabs', command: 'stack', codes: ['KeyW'] },
  { key: 'Shift+R', label: 'Resize', command: 'resize', codes: ['KeyR'] },
  { key: 'Shift+Q', label: 'Close', command: 'close', codes: ['KeyQ'] },
  { key: 'Shift+S', label: 'Scale', command: 'scale', codes: ['KeyS'] },
];

// The actions of the tutorial, in the order they are learned. `done` is the progress key.
// In the mouse and keyboard texts, [name] is a keycap.
export const TUTORIAL_ACTIONS = [
  { done: 'focus', todo: 'Go to another tile', mouse: 'click it', keys: '[Shift] + [arrows]' },
  { done: 'open', todo: 'Open pmc', mouse: 'the Open cell in the bottom bar', keys: '[Shift] + [Enter]' },
  { done: 'move', todo: 'Move a tile', mouse: 'drag its title bar to the edge of another', keys: '[Ctrl] + [Shift] + [arrows]' },
  { done: 'stack', todo: 'Stack into tabs', mouse: 'drop its title bar onto the tabs', keys: '[Shift] + [W]' },
  { done: 'resize', todo: 'Resize', mouse: 'drag the border', keys: '[Shift] + [R], then arrows; [Enter] or [Esc] — done' },
  { done: 'maximize', todo: 'Fullscreen and back', mouse: 'M in the title bar', keys: '[Shift] + [F]' },
  { done: 'close', todo: 'Close a tile', mouse: 'X in the title bar', keys: '[Shift] + [Q], also inside a game or app' },
];

// The tutorial of the pocket version (a touch-first device): each action and how it is done with a finger.
export const POCKET_ACTIONS = [
  { done: 'open', todo: 'Open pmc', touch: 'tap [ppmc] at the bottom right' },
  { done: 'enter', todo: 'Enter a folder', touch: 'tap a row, then tap it again' },
  { done: 'play', todo: 'Open a file', touch: 'a track, a picture, a video or a note' },
  { done: 'switch', todo: 'Switch tiles', touch: 'tap a tab at the bottom' },
  { done: 'app', todo: 'Run an app', touch: 'open a folder whose name ends in .exe' },
  { done: 'close', todo: 'Go back', touch: 'tap [<] Back, or swipe back' },
];

// The texts of the pocket version.
export const P = {
  ppmc: 'ppmc',
  start: 'Tap [ppmc] to browse the files.',
  pmcHint: 'Tap a row, tap it again to open.',
  again: (name) => `Tap again to open ${name}.`,
  appRunning: (name) => `Running ${name}. Back closes it.`,
  lastTile: 'The last tile cannot be closed.',
  stubHint: 'Tap [ppmc] to return to /.',
};

// The error stub (a bad link, or an error page of nginx): the name and the line of each code. The 404 line here is the
// address's; a link's 404 and 415 name the file (LINK_LINES). A 415 comes from a link only, so its line is the
// viewer's own.
export const ERRORS = {
  400: { name: 'Bad Request', line: 'This link is broken.' },
  403: { name: 'Forbidden', line: 'This file cannot be read.' },
  404: { name: 'Not Found', line: 'Nothing is at this address.' },
  405: { name: 'Method Not Allowed', line: 'The site only reads.' },
  414: { name: 'URI Too Long', line: 'The address is too long.' },
  415: { name: 'Unsupported Media Type', line: 'There is no viewer for this file type.' },
  500: { name: 'Internal Server Error', line: 'The server failed. Try again later.' },
  503: { name: 'Service Unavailable', line: 'The server is busy. Try again later.' },
};
export const LINK_LINES = {
  404: (name) => `${name} is not here.`,
  415: (name) => `${name}: no viewer for this file type.`,
};

export const T = {
  tooSmallTitle: 'Screen too small',
  tooSmallNeeds: 'Needs at least',
  tooSmallNow: 'This screen',
  tooSmallHint: 'Open the site on a larger screen.',
  loading: 'Loading…',
  noViewer: 'There is no viewer for this file type.',
  returnTo: 'Return to /',
  appNoIndex: 'This app has no index.html.',
  appLoading: 'Loading the app…',
  appRunning: 'Running. Keys go to the app — click another tile to take them back.',
  loadError: 'Could not load ',
  folderError: 'Could not load this folder',
  onlyOneTile: 'The last tile cannot be closed.',
  maximized: 'The tile is maximized — Shift+F restores the layout',
  resizeHint: 'Resize: the arrows move a border; Enter or Esc — done',
  scaleNeeds: (s) => `UI scale ${s}x needs a window of at least`,
  scaleNow: 'UI scale',
  moveHint: 'Move: the arrows move the tile; Enter or Esc — done',
  noTileThere: 'No tile in that direction.',
  noBorderThere: 'No border to move in that direction.',
  dragHint: 'Drop the tile on another tile: at its edge to split, in its middle to stack.',
  minWidth: (title, px) => `Minimum width of "${title}": ${px} px`,
  minHeight: (title, px) => `Minimum height of "${title}": ${px} px`,
  quickFooter: 'F3 on a file of this type opens it here · F3 or Esc — close',
  noteType: 'MD',
  pmcUpDir: '.. · up one level',
  keyboardApp: 'Keyboard: app',
  keyboardNone: 'Keyboard: —',
  // The title and the tab of a tile, by its tab id; an app's title is its folder name.
  tile: { pmc: 'pmc', Player: 'player', Video: 'video', Image: 'image', Note: 'note', File: 'file', App: 'app' },
};

// The key bar of pmc: the key as shown and the name after it.
export const PMC_KEYS = [
  { key: 'Enter', label: 'Open' },
  { key: 'F3', label: 'View' },
  { key: 'Tab', label: 'Panel' },
  { key: 'Ctrl+PgUp', label: 'Up' },
  { key: 'Letters', label: 'Search' },
];

// The key bar of the player: the key as shown and the name after it. Space is one cell, Play or Pause by the state
// (play and pause stay for the design system's sheet); Loop and Full are the video's only.
export const PLAYER_KEYS = {
  prev: { key: 'P', label: 'Prev' },
  play: { key: 'Space', label: 'Play' },
  pause: { key: 'Space', label: 'Pause' },
  stop: { key: 'S', label: 'Stop' },
  next: { key: 'N', label: 'Next' },
  mute: { key: 'M', label: 'Mute' },
  loop: { key: 'L', label: 'Loop' },
  seek: { key: '<- ->', label: 'Seek' },
  volume: { key: '^ v', label: 'Volume' },
  full: { key: 'Shift+F', label: 'Full' },
};

// The key bars of the picture and of the note.
export const IMAGE_KEYS = {
  prev: { key: 'Left/P', label: 'Prev' },
  next: { key: 'Right/N', label: 'Next' },
};
export const NOTE_KEYS = {
  scroll: { key: 'U/D', label: 'Scroll' },
  edge: { key: 'Home/End', label: 'Top/Bottom' },
};

// The key bar of the app.
export const APP_KEYS = {
  close: { key: 'Shift+Q', label: 'Close' },
  restart: { key: 'Shift+0', label: 'Restart' },
  full: { key: 'Shift+F', label: 'Fullscreen' },
};
