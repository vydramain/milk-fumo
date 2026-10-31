// Sizes in CSS pixels at the only UI scale, 1x. Values come from the 3dmppc-editor and the prototypes.
export const FONT = 8;                  // rv_font cell height: the interface text size
export const EM = 6;                    // rv_font advance: the width of "M" in the interface
export const PAD = 4;
export const FRAME = FONT + 2 * PAD;    // title bar height with its padding: 16
export const BEVEL = 2;                 // raised frame of a tile
export const GAP = 1;                   // flat gap between the bevel and the padding
// A tile's frame: 7 px on each side, the title bar and its gap above the content: 14 x 34, as in the prototype.
export const CHROME = { w: 2 * (BEVEL + GAP + PAD), h: 2 * (BEVEL + GAP + PAD) + FRAME + PAD };
export const CONTENT_INSET = BEVEL + GAP + PAD; // 7
export const TITLE_H = 14;
export const TABS_H = 14;               // tab strip, drawn at the bottom of a stacked tile
export const TABS_GAP = 2;
export const TABS_STRIP = TABS_H + TABS_GAP;
export const SPLITTER = 4;
export const EDGE_SHARE = 0.25;         // a drop nearer than this share of a tile to its edge makes a neighbor
export const ROW = 12;                  // pmc row height, as in the prototype
export const CODE_LINE = 16;            // code text in notes: PxPlus VGA 9x16 at its native size
export const MSG_H = 14;
export const ENV_H = 16;
export const DRAG_START = 4;            // pixels a title bar moves before the press is a drag
export const VIEWPORT_MIN = { w: 960, h: 540 };
export const SCREEN_MIN = { w: 960, h: 540 };

// Minimum content sizes of the panes, as in the prototypes. A tile adds CHROME.
export const PANE_MIN = {
  generic: { w: 20 * EM, h: 4 * FRAME },                                   // 120 x 64
  pmc: { w: 2 * (20 * EM + 56 + 70 + 14 + 4) + 4, h: FRAME + 26 + 3 * ROW + 14 + 14 + 4 * PAD }, // 532 x 122
  player: { w: 5 * 40 + 4 * 4 + 20, h: 4 * FRAME },                        // 236 x 64
  app: { w: 320, h: 180 },
};
