# MILK-FUMO

This is the design document of MILK-FUMO: its purpose, its structure and the reasons behind its decisions. The entry point to the project and how to run it are in [README.md](README.md).

## Purpose

Within the first minute a visitor should:

1. see whose site this is;
2. understand that it is a tiling desktop and learn to use it;
3. browse the portfolio and open any file from it.

**Everything can be done with the keyboard, with the mouse, or with both.** Every action has both ways. The original i3 is keyboard-only; here the choice is left to the visitor.

**The site is read-only for visitors.** They open files, play, seek and rearrange tiles, but they write nothing to the published content. The owner publishes new work over SFTP. Write protection comes from server file permissions, not from missing buttons.

## Sources

| Source | What is taken |
|---|---|
| [bird-fumo](https://github.com/vydramain/bird-fumo) | viewers and launching: explorer, images, audio, video, web apps; the app `postMessage` protocol (without its privileged messages) |
| [3dmppc-editor](https://github.com/vydramain/3dmppc-polymer/tree/master/editor) | the workspace: tiles, tabs, minimum sizes; the widget catalog and fonts |
| [vgui2-deck](https://github.com/vydramain/vgui2-deck) | palette; its fonts are not used on the site |
| SGI IRIX | the look: raised frames, brass, dense utility type |
| Midnight Commander, Volkov Commander | the pmc UX: two panels, cursor, function keys |

Stitch, a generated draft, contributed the player queue (its split buttons were removed in v3). Its own palette, fonts, icons and telemetry decorations were dropped.

## How the site works

- The content is one directory on the server. The owner uploads files over SFTP; nothing has to run after an upload.
- nginx serves the site files and the content directory. The browser reads a folder as JSON from nginx's autoindex (name, type, size, modification time). Files are plain HTTP GET requests.
- Visitors only read, over HTTP. Only the owner writes, over SFTP.
- Nothing is remembered between visits, and nothing is left with the visitor.
- The whole interface is drawn by the site itself in one `<canvas>` with the Canvas 2D API. The UI is immediate-mode: every frame is rebuilt from the state, and a widget checks clicks on its own rectangle.
- Drawing happens on events, not 60 times a second, so an idle page does not load the processor.
- Notes are drawn in the canvas, so their text cannot be selected or copied.
- Audio and video elements are created by the script and are not inserted into the page; video frames are drawn into the canvas.
- Games and web apps run in an iframe placed over their tile's rectangle, loaded from the same origin as the site. This lets the site catch `Shift+Q` even inside a game.
- Pixel-perfect rendering: the canvas buffer matches the screen's physical pixels, all coordinates are whole pixels, smoothing is off, and text comes from bitmap font tables, not the browser's text engine.
- Chromium and Firefox are supported.
- Capacity: about 100 simultaneous visitors. The real limit is the server's outgoing bandwidth for video and music (viewers × bitrate).

## Controls

The modifier key is **Shift**. Keys are matched by physical position (`KeyboardEvent.code`), so they work in any keyboard layout.

Why Shift:

- Super is usually taken by the system or by the visitor's own i3, where `Super+Enter` opens a terminal.
- Alt reaches the browser, but the browser owns `Alt+←`, `Alt+→` and `Alt+D`.
- `Ctrl+Q` quits Firefox and `Ctrl+Shift+Q` quits Chrome, so closing a tile is `Shift+Q`.
- Ctrl+W, Ctrl+T and Ctrl+N cannot be caught by a page at all.

What Shift costs: it types capitals in text fields, it takes `Shift`+arrows and `Shift`+click selection, and the i3 `Mod+Shift` layer is gone (moving is `Ctrl+Shift`+arrows, closing is `Shift+Q`). Games often use Shift for running.

The table of actions with their mouse and keyboard ways is in the [Controls section of README.md](README.md#controls).

The environment bar at the bottom is always visible. It shows the key for each action, and every cell can be clicked. Every tile also ends with its own key bar, and its cells can be clicked too. Above it is a message line, for example one that says why a border will not move further.

## Tiles

- The screen is divided into rectangular tiles. **Tiles never overlap.**
- A new tile shares its neighbor's space 1:1. A closed tile gives its space back. There is no manual splitting: tiles appear by opening a file or with `Shift+Enter`.
- **One tile per type:** pmc, Player, Video, Image, Note. An app has one tile per app. Opening a file of a type that already has a tile focuses that tile and opens the file there.
- The title bar of a tile holds `X` and `M`. A tile's title is the app name only; the browser tab title follows the focused tile, and the favicon is `Mf`.
- The layout is a tree of splits whose leaves hold tabs. Stacked tiles show tabs at their bottom, like tabs on folders in a card file.
- A tile can be maximized to the whole screen and the layout restored.
- Dragging a title bar to the edge of another tile creates a neighbor; dropping it in the centre or on the tab strip stacks it into tabs. The future place is highlighted; `Esc` cancels.
- Rearranging does not restart a game or stop the music: app and player instances survive moving, stacking and maximizing.

### Start screen

Two tiles split the screen 1:1: the Note `readme.md` on the left and **pmc** on the right, focused. There are no buttons; the start screen is the tutorial. `readme.md` merges the author's text and the instructions (the old `home.md` and `tutorial.md` are no longer used), so the content root needs `readme.md`. Its path is set in [`site/js/config.js`](site/js/config.js).

The tutorial is written so that someone who knows i3 recognizes it, and someone who sees tiles for the first time learns how to use them. The table of actions marks progress: `✓` beside an action already done, `›` beside the next one to try.

## pmc

pmc (PSEUDO Midnight Commander) is the file panel. The UI is that of the editor's tiles; the UX is that of early Midnight Commander.

- **Two panels in one tile.** `Tab` switches the active panel. The path is written into each panel's top frame; the active panel's path is brass.
- **Cursor.** A full-width bar. `↑` `↓`, `PgUp` `PgDn`, `Home` `End`. The mouse wheel moves it 3 rows; a click puts it on a row. The inactive panel's cursor is dim.
- **Enter or double click:**
  - a folder — enter it; `..` goes one level up, and the cursor lands on the folder just left;
  - a folder whose name ends in `.exe` — an app; `Enter` launches it;
  - an app — a new tile for a different app; the tile of the same app is focused if it is open;
  - a file — if a tile of its type exists, it is focused and the file opens there; otherwise a new tile opens beside pmc. With the quick view showing a file of the same type, `Enter` opens it in the quick view.
- `Ctrl+PgUp` — one level up.
- **`F3` — quick view.** The other panel shows what the cursor is on: a folder's information, a track's player with its set, an image, a `.md` note, or an app's screen. `F3` on a file of another type replaces the viewer; on a file of the same type the same viewer opens that file. `F3` closes the quick view when the focus is on it or the cursor is on the file it shows; `Esc` brings the list back. `F3` on an app shows the folder's information. The quick view does not follow the cursor: it changes only by `F3` or `Enter`. (`F3` replaces MC's `Ctrl+Q`, which quits Firefox.)
- **Letters** — quick search by the start of a name; `Backspace` erases; `Esc` clears.
- **Columns** — Name, Size, Modified. Folders come first and show `SUB-DIR` instead of a size; `..` shows `UP--DIR`. A status line under the list describes the file under the cursor and the folder's total.
- There is no copy, move or delete: the site is read-only.
- The tile's bottom line is pmc's key bar: Enter Open, F3 View, Tab Panel, Esc List, Ctrl+PgUp Up, Letters Search. Every key in it can be clicked.
- The status line under each list shows the loading bar (`load`, `done`, `errr`).

## Tile types

| Type | Content |
|---|---|
| pmc | Published folders and files, two panels |
| Note | Markdown text |
| Audio player | Time, position, volume, playlist from the folder; tags (title, artist, album, year) in the header and the playlist |
| Video player | The audio player's top, then Fit / 1x / 2x and loop, and the frame; fullscreen |
| App | A folder whose name ends in `.exe` and contains `index.html`: a web game in an iframe that fills the tile; `Shift+0` restarts it; a foot panel and a key bar below |
| Image | The selected image and switching through the folder's set |

Every tile ends with a key bar; its cells are buttons (clicking `Seek` moves +5 s, `Volume` +5%). Tiles other than pmc and Player also have a foot panel: the file's line, the loading bar and a `Keyboard:` field.

| Tile | Key bar |
|---|---|
| Player | P Prev · Space Play · Space Pause · S Stop · N Next · M Mute · L/R Seek · U/D Volume |
| Video | the Player's cells plus L Loop before Seek |
| Image | Left/P Prev · Right/N Next |
| App | Shift+0 Restart · Shift+Q Close · Shift+F Fullscreen |
| Note | U/D Scroll · PgUp/PgDn Page · Home/End Top/Bottom |

**Loading.** The bar shows `load`, `done` or `errr` in the Player's rows, in the foot panels (Video, Image, Note, App) and in pmc's status line. Files are downloaded counting bytes and kept while the tile is open; the next file of the folder is preloaded; an `errr` file is retried when it is selected again. An app counts progress only by its `index.html`.

**Audio tags.** ID3v2 and Vorbis/Opus tags are shown in the Player header and in the playlist.

**Video fullscreen.** `Shift+F`, `M` in the title bar or a double click on the frame. On mouse move a panel with the position bar and the key bar appears and hides after 3 seconds; `Esc` or the same action returns.

### Main scenario

1. The visitor reads the start screen.
2. Uses pmc on the right, enters the music folder and opens a track: the Player appears beside it, pmc stays; the next track opens in the same Player.
3. Opens a game and places it.
4. Moves the player under pmc or stacks them into tabs.
5. Maximizes the game and restores the layout.
