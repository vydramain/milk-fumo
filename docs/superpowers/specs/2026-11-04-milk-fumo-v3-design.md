# milk-fumo v3: UI/UX update — design

Branch `feature/ui-ux-comphortic-update`. Source: the 15 remarks of `docs/backlog.md`, decided one by one with the owner.
The visual reference is `docs/prototypes/index.html` (sections `#start`, `#player`, `#tiles`, `#pmc`, `#fav`) with
`docs/prototypes/loader.css`. Where this text and the prototype differ, this text wins (the prototype still has the split
buttons; see 7).

"Owner" marks the owner's decision, "my call" marks a decision the owner did not state; check those.

## Intent

The site should feel like one finished desktop: every tile says what it is, shows what it is loading, and is driven by a
key bar that is also clickable. Splitting tiles by hand goes away; opening a file goes to the one tile of its type.

## Non-goals

- Domain name (item 8): dropped by the owner, it does not appear in the repo.
- Item 9 (Godot games cut at ~5 MB): fixed on the server (`telemt` `mask_relay_max_bytes`); no repo change except README.
- A "download all tracks" button: in `docs/backlog.md` under Ideas, not now.
- Personal contacts: none on the site (owner).

## 1. Tab title and favicon (items 1, 1a)

- The title bar of a tile shows the application's name only, no path: `pmc`, `Player`, `Video`, `Image`, `Note`; an app
  shows its folder name (`squid-maid.exe`, my call; the app's `TITLE` message no longer changes it).
- `document.title` is the title of the focused tile, nothing added. It follows focus changes and closing.
- Static `<title>pmc</title>` in `site/index.html` (start focus is pmc).
- Favicon `Mf`: the M button of the title bar (raised 1 px bevel `C.hi`/`C.lo`, face `C.win`, letters `C.bright` in the
  `rv` font), PNG 16×16 and 32×32 (nearest ×2), linked in `index.html`.

Criteria: clicking a tile changes the browser tab text to its name; closing the focused tile shows the next one's;
the tab icon is `Mf`, crisp at 100% and 200%.

## 2. Start screen (items 2, 14)

- `home.md` and `tutorial.md` are merged into one `readme.md` in the content root: the home text first without its
  `## Contacts` section, then the tutorial with `{{actions}}`.
- Start layout: Note `readme.md` on the left, pmc on the right, focused, 1:1.
- `config.js`: `HOME_NOTE = 'readme.md'`; `TUTORIAL_NOTE` removed.
- `dev/content` is not tracked: the local fixture gets `readme.md`; the prod content root needs it too (owner's step,
  stated in README).

Criteria: the site opens with readme on the left and pmc focused on the right; no contacts anywhere in `site/` or
`dev/content` (except games).

## 3. Loading bar everywhere (items 3, 5, 6, 10)

The bar is the prototype's `.ld.ld-mini`: 37×11, a 1 px sunken well over `C.inset`, fill = 1 px checker of `C.sel` and
`C.inset`, width = floor(share × 35); the word `load` / `done` / `errr` 6 px in and 1 px down inside the well, `C.bright`
over the empty part and `C.dark` over the fill.

- `done` = the whole file is downloaded. `load` = downloading; share = bytes received / Content-Length (0 while the length
  is unknown). `errr` = any failure (HTTP status, network, abort by the server).
- Files are downloaded by the site with a byte counter (`fetch` + stream reader) and kept as Blobs while the tile is
  open. Closing the tile aborts its downloads and frees them (my call).
- Opening a file starts its download and the download of the next file of the same kind in the folder (owner).
  Every download that started runs to its end, also after switching away (owner: "дать ей докачаться").
- Choosing a file whose download is `errr` (click, N, P, autoplay) starts it again from zero (owner).
- A file already `done` is played or shown from its Blob, with no new request.
- Audio and video play while they download (owner); a picture is shown when it is done, the field is empty before.
  Known ceiling: the playing file is fetched twice while it is not `done` (the element streams it, the counter downloads
  it). Accepted for now.
- Where the bar is:
  - Player: in each playlist row that has a download, between the name and the length; rows without one have none.
  - Video, Image, Note, App: in the foot panel (see 4).
  - pmc: in the status line of each panel, for the panel's listing (load → done, or errr).
- App: the site downloads `index.html` with the counter; on `done` the iframe gets the same address (the browser cache
  serves it). Multi-file apps count only `index.html` (owner: "так и оставляем"). No preloading of apps.

Criteria: open a track — its row shows `load` and grows, the next row starts too; jump to track 4 while track 2 is at
70% — track 2 still reaches `done`; a 404 track shows `errr` and picking it again retries; N on a `done` picture shows it
with no new request in Network; `squid-maid.exe` with throttling fills the bar, then starts, with one 11 MB request.

## 4. Foot panel and key bar in every tile (items 5, 7)

- Every tile body ends with the key bar (14 px, cells of equal width, 2 px apart, raised; key in a dark box, name after
  it, as pmc's key bar). No two-letter codes anywhere (owner: Pv/Pl/… removed).
- Each cell is a button: a click runs it, and the cell is drawn sunken while its key is held or the mouse holds it.
- Tiles other than pmc and Player have a foot panel 4 px above the key bar: a sunken field with the file's line, the
  load bar right-aligned after it, then the keyboard field (`Keyboard: app` in `C.sel` for a focused running app,
  `Keyboard: —` otherwise).
- Key bars:
  - pmc: Enter Open · F3 View · Tab Panel · Esc List · Ctrl+PgUp Up · Letters Search (as now).
  - Player: P Prev · Space Play · Space Pause · S Stop · N Next · M Mute · Left/Right Seek · Up/Down Volume.
  - Video: the Player's cells plus L Loop before Seek.
  - Image: Left/P Prev · Right/N Next.
  - App: Shift+0 Restart · Shift+Q Close · Shift+F Fullscreen.
  - Note: Up/Down Scroll · PgUp/PgDn Page · Home/End Top/Bottom.
- Clicking Seek moves +5 s and Volume +5%, as Right and Up do (my call).
- Removed: the six transport buttons of the player, the Pv/Nx buttons of the picture, the Rs button of the app, the
  Up/Hm buttons of pmc's toolbar.
- App restart is `Shift+0`; the site intercepts it inside the app's frame, like `Shift+Q`.
- Foot lines: Image `name · TYPE · W×H · size · i of n`; Video `name · 00:00 / 01:12`; Note `name · MD · size`;
  App `index.html`.

Criteria: every tile has its key bar; pressing Space sunkens the Play or Pause cell for as long as it is held; clicking
`Stop` stops; `Shift+0` inside a running game restarts it.

## 5. Audio tags (item 4)

- Tags are read from the downloaded bytes as they arrive: ID3v2 (2.2, 2.3, 2.4) in mp3, Vorbis comments in Ogg (Vorbis
  and Opus). Fields: title, artist, album, year (first 4 digits of the date).
- Header, with a title: the title large, then `Artist — Album (Year)` with missing parts left out. Without tags: the file
  name without its extension large, no second line, the format line moves up.
- Playlist row: `Artist — Title`; the title alone without an artist; the file name without tags or before the download
  started.
- Length column: the duration once known (current track from the element, others when their download is done, my call);
  `--:--` before.

Criteria: `Ghjkju_(fin).ogg` shows `Vydra — Пролог?` in the playlist and `Пролог?` / `Vydra — Пролог? (2026)` in the
header; a file without tags shows its name.

## 6. Video fullscreen (item 11)

- `Shift+F` or M on a video tile, or a double click on the frame, puts the page into the browser's fullscreen showing
  only the video frame, fitted, on black. Again, or `Esc`, returns to the tile, playing on.
- Moving the mouse shows a panel over the bottom of the frame: the position bar with the times, and the player's key bar
  (clickable). After 3 s without movement the panel and the cursor hide. A player key also shows the panel for 3 s. The
  panel stays while the pointer is over it. No volume or Fit/1x/2x in it.
- Player keys work in fullscreen.

Criteria: fullscreen shows only the frame; moving the mouse shows the panel; 3 s still hides it and the cursor; clicking
Pause pauses; Esc returns to the tile.

## 7. pmc, F3, Enter and tiles (items 12, 13, splitting)

Owner's rules:
1. At most one tile of each type: pmc, Player, Video, Image, Note. Apps: one tile per app.
2. F3 on a file opens the quick view in the other panel with the viewer of its type.
3. F3 on a file of another type than the open quick view: the viewer is replaced.
4. F3 on a file of the same type: the same viewer opens that file.
5. F3 closes the quick view when the focus is on the quick view panel or the cursor is on the file it shows.
6. Enter on a file of the quick view's type opens it in the quick view.
7. Enter on a file otherwise: if a tile of its type exists, focus it and open the file there; else a new tile beside pmc.
8. Enter on an app: a new tile for a different app; focus the tile of the same app if it is open.
9. F3 on an app works as F3 on a folder (folder info).
10. The quick view does not follow the cursor any more; it changes only by F3 or Enter.

Splitting is removed: `Shift+H`, `Shift+V`, the `|` and `−` buttons (title bar keeps X and M), the empty tile, the
`Beside` and `Below` cells, the "Split a tile" tutorial row. `Shift+Enter` opens pmc beside the focused tile, or focuses
it when it exists. Moving and stacking tiles (drag, Ctrl+Shift+arrows, Shift+W) stay (my call: the owner removed
splitting, not moving).

Criteria: Enter on a second track while the Player is open plays it in the same Player; Enter on an image with the
quick view showing an image opens it in the quick view; F3 on the shown file closes it; Shift+Enter with pmc open
focuses it.

## 8. UI scale 1.5x (item 15)

- `Shift+S` cycles 1x → 1.5x → 2x → 1x, skipping a scale the window cannot hold, with the message of the size it needs.
- 1.5x is drawn without smoothing (Paint already snaps rects to device pixels); letters are uneven, accepted (owner).
- At start, and when the window shrinks, the site takes the largest scale that fits.
- The app's iframe stays exactly over its well at every scale.

Criteria: 1920×1080 opens at 1.5x; Shift+S cycles as above; no blur at 1.5x; a game sits in its tile at 1.5x.

## 9. Documents

- README: line 161 (1.5x), the Prod line (compose is one way; any nginx with `nginx/nginx.conf` works; a proxy in front
  must not cap response size), and the feature descriptions changed above.
- `docs/prototypes/index.html`: drop `|` `−` from title bars, `Beside`/`Below` from the env bar, the split row from the
  readme; add the fullscreen video panel.
