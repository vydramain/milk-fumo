// Keyboard and mouse input to workspace commands. Pure: no DOM and no listeners (main.js adds them). It takes event
// data and the records of place(), and returns a command for workspace.js reduce(), or null.
import { hitTest } from './layout_geom.js';
import { COMMANDS } from './workspace.js';

// KeyboardEvent.code of the keys; matched by physical position, so any keyboard layout works.
const KEY_LEFT = 'ArrowLeft';
const KEY_RIGHT = 'ArrowRight';
const KEY_UP = 'ArrowUp';
const KEY_DOWN = 'ArrowDown';
const KEY_H = 'KeyH';
const KEY_V = 'KeyV';
const KEY_W = 'KeyW';
const KEY_F = 'KeyF';
const KEY_Q = 'KeyQ';
const KEY_ENTER = 'Enter';

// Direction: the axis of the tile centers and the sign of the step along it.
const DIR_LEFT = { axis: 'x', sign: -1 };
const DIR_RIGHT = { axis: 'x', sign: 1 };
const DIR_UP = { axis: 'y', sign: -1 };
const DIR_DOWN = { axis: 'y', sign: 1 };

// Split sides and tile types used by the commands; the sides are the keys of SIDES in layout.js.
const SIDE_RIGHT = 'right';
const SIDE_BOTTOM = 'bottom';
const TYPE_EMPTY = 'empty';
const TYPE_PMC = 'pmc';

const ARROWS = { [KEY_LEFT]: DIR_LEFT, [KEY_RIGHT]: DIR_RIGHT, [KEY_UP]: DIR_UP, [KEY_DOWN]: DIR_DOWN };

// Center of a rect.
function centerOf(rect) {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

// Record of the tile that shows tabId, or null.
function tileOf(placed, tabId) {
  return placed.find((item) => item.kind === 'tile' && item.tabId === tabId) ?? null;
}

// Tab of the tile nearest to the focused tile in dir, by distance between centers; the first in placed wins a tie.
// Null if no other tile lies that way.
function nearestTabId(placed, focusId, dir) {
  const tile = tileOf(placed, focusId);
  if (!tile) throw new Error(`keyCommand: focused tile "${focusId}" is not placed`);
  const from = centerOf(tile.rect);
  let best = null;
  let bestDist = Infinity;
  for (const item of placed) {
    if (item.kind !== 'tile' || item.tabId === focusId) continue;
    const to = centerOf(item.rect);
    if ((to[dir.axis] - from[dir.axis]) * dir.sign <= 0) continue;
    const dist = (to.x - from.x) ** 2 + (to.y - from.y) ** 2;
    if (dist < bestDist) {
      best = item.tabId;
      bestDist = dist;
    }
  }
  return best;
}

// Focus command for an arrow. With no focused tile there is nothing to move from, so null.
function focusCommand(placed, focusId, dir) {
  if (focusId === null) return null;
  const tabId = nearestTabId(placed, focusId, dir);
  return tabId === null ? null : { name: COMMANDS.focus, id: tabId };
}

// Moves the focused tile into the tabs of the nearest tile to the right, or the nearest below when none is to the right.
function stackCommand(placed, focusId) {
  if (focusId === null) return null;
  const target = nearestTabId(placed, focusId, DIR_RIGHT) ?? nearestTabId(placed, focusId, DIR_DOWN);
  return target === null ? null : { name: COMMANDS.stack, id: focusId, target };
}

// Shift + key that is not an arrow: action(placed, focusId) gives the command.
const SHIFT_KEYS = {
  [KEY_H]: () => ({ name: COMMANDS.split, side: SIDE_RIGHT, type: TYPE_EMPTY }),
  [KEY_V]: () => ({ name: COMMANDS.split, side: SIDE_BOTTOM, type: TYPE_EMPTY }),
  [KEY_W]: (placed, focusId) => stackCommand(placed, focusId),
  [KEY_F]: () => ({ name: COMMANDS.maximize }),
  [KEY_Q]: () => ({ name: COMMANDS.close }),
  [KEY_ENTER]: () => ({ name: COMMANDS.setType, type: TYPE_PMC }),
};

// Command for a key press, or null. Keys without Shift belong to the tile itself. Ctrl, Alt or Meta with Shift is
// another combination, so it gives null too. Resize (Shift+R) and move (Ctrl+Shift+arrows) are not in this slice.
// Holding a key repeats only arrows: focus moves on repeat, one-shot commands (split, stack, maximize, close, setType)
// do not repeat.
export function keyCommand(event, placed, focusId) {
  if (!Array.isArray(placed)) throw new Error('keyCommand: placed must be an array');
  if (event === null || typeof event !== 'object') throw new Error('keyCommand: event must be an object');
  if (!event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return null;
  if (Object.hasOwn(ARROWS, event.code)) return focusCommand(placed, focusId, ARROWS[event.code]);
  if (event.repeat || !Object.hasOwn(SHIFT_KEYS, event.code)) return null;
  return SHIFT_KEYS[event.code](placed, focusId);
}

// Command for a click at (x, y): focus the tile under the point. A splitter gives null, because dragging a border
// is a separate task.
export function pointCommand(x, y, placed) {
  if (!Array.isArray(placed)) throw new Error('pointCommand: placed must be an array');
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('pointCommand: x and y must be finite numbers');
  const hit = hitTest(placed, x, y);
  return hit?.kind === 'tile' ? { name: COMMANDS.focus, id: hit.tabId } : null;
}
