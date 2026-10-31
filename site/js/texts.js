// All interface texts. The keys are shown as their names in the environment bar and in the tutorial.
export const ENV_CELLS = [
  { key: 'Shift+arrows', label: 'Focus', command: 'focus' },
  { key: 'Shift+H', label: 'Beside', command: 'split-right' },
  { key: 'Shift+V', label: 'Below', command: 'split-down' },
  { key: 'Shift+Enter', label: 'Open', command: 'open-pmc' },
  { key: 'Ctrl+Shift+arrows', label: 'Move', command: 'move' },
  { key: 'Shift+W', label: 'Tabs', command: 'stack' },
  { key: 'Shift+R', label: 'Resize', command: 'resize' },
  { key: 'Shift+F', label: 'Fullscreen', command: 'maximize' },
  { key: 'Shift+Q', label: 'Close', command: 'close' },
];

// The actions of the tutorial, in the order they are learned. `done` is the progress key.
// In the mouse and keyboard texts, [name] is a keycap.
export const TUTORIAL_ACTIONS = [
  { done: 'focus', todo: 'Go to another tile', mouse: 'click it', keys: '[Shift] + [arrows]' },
  { done: 'split', todo: 'Split a tile', mouse: 'the │ ─ buttons in the title bar', keys: '[Shift] + [H] beside, [Shift] + [V] below' },
  { done: 'open', todo: 'Open pmc', mouse: '"pmc" in an empty tile', keys: '[Shift] + [Enter]' },
  { done: 'move', todo: 'Move a tile', mouse: 'drag its title bar to the edge of another', keys: '[Ctrl] + [Shift] + [arrows]' },
  { done: 'stack', todo: 'Stack into tabs', mouse: 'drop its title bar onto the tabs', keys: '[Shift] + [W]' },
  { done: 'resize', todo: 'Resize', mouse: 'drag the border', keys: '[Shift] + [R], then arrows; [Enter] or [Esc] — done' },
  { done: 'maximize', todo: 'Fullscreen and back', mouse: 'M in the title bar', keys: '[Shift] + [F]' },
  { done: 'close', todo: 'Close a tile', mouse: 'X in the title bar', keys: '[Shift] + [Q], also inside a game or app' },
];

export const T = {
  tooSmallTitle: 'Screen too small',
  tooSmallNeeds: 'Needs at least',
  tooSmallNow: 'This screen',
  tooSmallHint: 'Open the site on a larger screen.',
  mobile: "Sorry, we don't support mobile devices yet.",
  emptyTitle: 'Empty',
  loading: 'Loading…',
  emptyOpen: 'pmc',
  emptyHint: 'or Shift+Enter',
  noViewer: 'There is no viewer for this file type.',
  appNoIndex: 'This app has no index.html.',
  appHint: 'Keys go to the app — click another tile to take them back.',
  appRestart: 'Restart',
  loadError: 'Could not load ',
  folderError: 'Could not load this folder',
  onlyOneTile: 'The last tile cannot be closed.',
  maximized: 'The tile is maximized — Shift+F restores the layout',
  resizeHint: 'Resize: the arrows move a border; Enter or Esc — done',
  moveHint: 'Move: the arrows move the tile; Enter or Esc — done',
  noTileThere: 'No tile in that direction.',
  noBorderThere: 'No border to move in that direction.',
  dragHint: 'Drop the tile on another tile: at its edge to split, in its middle to stack.',
  minWidth: (title, px) => `Minimum width of "${title}": ${px} px`,
  minHeight: (title, px) => `Minimum height of "${title}": ${px} px`,
  quickFooter: 'Follows the cursor of the other panel · F3 or Esc — list',
  pmcUpDir: '.. · up one level',
};
