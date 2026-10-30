// Interface sizes at scale 1, in CSS pixels. Source: README «Minimum sizes» and «Metrics at scale 1».
// Other scales are not handled here.

// Viewport the layout is designed for; a smaller viewport scrolls instead of squeezing the tiles.
export const VIEWPORT_MIN_W = 960;
export const VIEWPORT_MIN_H = 540;

// Interface font size.
export const FONT = 8;

// Em is the width of "M" in the interface font; tile content minimum is measured in em.
export const EM = 6;

// Padding (README «padding 4 px»).
export const PAD = 4;

// Height of one text row; a tile content minimum is a number of rows.
export const ROW_H = 16;

// Bevel of a raised tile frame.
export const BEVEL = 3;

// Tile frame added to content size: width and height.
export const FRAME_W = 14;
export const FRAME_H = 34;

// Splitter between tiles.
export const SPLITTER = 4;

// Tile content width minimum, in em.
export const TILE_CONTENT_COLS_EM = 20;
// Tile content height minimum, in rows of ROW_H.
export const TILE_CONTENT_ROWS = 4;
// Tile content minimum in pixels.
export const TILE_CONTENT_MIN_W = TILE_CONTENT_COLS_EM * EM;
export const TILE_CONTENT_MIN_H = TILE_CONTENT_ROWS * ROW_H;

// pmc prototype: two panels, each with a 20 em name column plus size and date; with frame.
export const PMC_MIN_W = 546;
export const PMC_MIN_H = 156;
// Player prototype: five buttons; with frame.
export const PLAYER_MIN_W = 250;
export const PLAYER_MIN_H = 98;
// App prototype: 320x180 application area; with frame.
export const APP_MIN_W = 334;
export const APP_MIN_H = 214;

// Tile minimums including the frame. Prototype values (chosen for prototypes, not set by the editor).
export const TILE_MIN = {
  // Any tile: content minimum plus frame.
  generic: { w: TILE_CONTENT_MIN_W + FRAME_W, h: TILE_CONTENT_MIN_H + FRAME_H },
  pmc: { w: PMC_MIN_W, h: PMC_MIN_H },
  player: { w: PLAYER_MIN_W, h: PLAYER_MIN_H },
  app: { w: APP_MIN_W, h: APP_MIN_H },
};

// Row height of the pmc list in the prototype; differs from ROW_H on purpose (README «Tile minimums for the prototypes»).
export const PMC_PROTOTYPE_ROW_H = 12;
