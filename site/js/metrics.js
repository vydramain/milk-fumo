// Sizes in layout pixels: a layout pixel is one device pixel at UI scale 1 (see main.js).
// The design system (docs/design-system) lists them all.
export const FONT = 8;                  // rv_font cell height: the interface text size
export const EM = 6;                    // rv_font advance: the width of "M" in the interface
export const PAD = 4;
export const FRAME = FONT + 2 * PAD;    // title bar height with its padding: 16

// A tile: a raised 2 px frame, 2 px of padding, the title bar (14 px and 2 px below it), the content,
// the tab strip (2 px above it, 14 px high) and 2 px of padding and frame at the bottom.
export const TILE_BORDER = 2;
export const TILE_PAD = 2;
export const TILE_INSET = TILE_BORDER + TILE_PAD;   // 4: from the tile's edge to its title bar and content
export const TITLE_H = 14;
export const TITLE_GAP = 2;
export const TABS_H = 14;
export const TABS_GAP = 2;
export const TILE_TOP = TILE_INSET + TITLE_H + TITLE_GAP;      // 20: the content starts here
export const TILE_BOTTOM = TABS_GAP + TABS_H + TILE_INSET;     // 20: the content ends this far above the bottom
// The chrome of a tile, around its content: 8 px across and 40 px down.
export const CHROME = { w: 2 * TILE_INSET, h: TILE_TOP + TILE_BOTTOM };
export const TABS_LEFT = 6;             // the first tab starts this far from the tile's inner edge
export const SPLITTER = 4;
export const EDGE_SHARE = 0.25;         // a drop nearer than this share of a tile to its edge makes a neighbor
export const ROW = 12;                  // pmc row height
export const CODE_LINE = 16;            // code text in notes: PxPlus VGA 9x16 at its native size
export const MSG_H = 14;
export const ENV_H = 16;
export const DRAG_START = 4;            // pixels a title bar moves before the press is a drag
export const VIEWPORT_MIN = { w: 960, h: 540 };
export const SCREEN_MIN = { w: 960, h: 540 };

// The narrowest key-bar cell that still shows its key and two letters of its name (widgets.js: keyBar): 4 px in,
// a one-letter key in its dark box (6 + 6), 4 px, two letters (12) and 2 px at the end.
export const KEY_CELL_MIN = 34;
// The narrowest key bar of n cells, 2 px apart.
export const keyBarMin = (n) => n * KEY_CELL_MIN + 2 * (n - 1);

// The player is as wide as its key bar of 8 cells at their narrowest, a video as its 9 (Loop added).
const PLAYER_W = keyBarMin(8);   // 286
const VIDEO_W = keyBarMin(9);    // 322

// Minimum content sizes of the panes. A tile adds CHROME.
export const PANE_MIN = {
  generic: { w: 20 * EM, h: 4 * FRAME },                                   // 120 x 64
  // pmc: two panels whose list column holds a video quick view (pmc.js: draw, panel): each panel is the column, its
  // 14 px scroll bar and its 4 px well frame; 4 px between the panels and 10 px of pmc's own frame.
  pmc: { w: 2 * (VIDEO_W + 14 + 4) + 4 + 10, h: FRAME + 26 + 3 * ROW + 14 + 14 + 4 * PAD }, // 694 x 122
  // The player: the height of the header, position, volume, a few playlist rows and the key bar; a video adds its frame.
  player: { w: PLAYER_W, h: 200 },                                         // 286 x 200
  video: { w: VIDEO_W, h: 248 },                                           // 322 x 248
  app: { w: 320, h: 180 },
};
