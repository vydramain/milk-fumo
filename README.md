# MILK-FUMO

![Start screen](docs/screenshots/start-screen.png)

A personal portfolio site shaped as a tiling window manager. The browser window is divided into tiles, as in i3: the tiles hold a file browser over the published content, notes, audio and video players, and web games. The content is a plain directory on the owner's server, served by nginx.

- The interface is drawn in one `<canvas>`. The site is plain JavaScript modules in [`site/`](site/), with no dependencies and no build step.
- Everything can be done with the keyboard, with the mouse, or with both.
- The site is read-only for visitors; they write nothing to the published content.
- Chromium and Firefox are supported.

## Controls

The modifier key is **Shift**. Keys are matched by physical position (`KeyboardEvent.code`), so they work in any keyboard layout.

| To do | Mouse | Keyboard |
|---|---|---|
| Go to another tile | click it | `Shift` + arrows |
| Open or focus pmc | the **Open** cell of the bottom bar | `Shift+Enter` |
| Move a tile | drag its title bar to the edge of another | `Ctrl+Shift` + arrows |
| Stack into tabs | drop its title bar onto the tabs | `Shift+W` |
| Resize | drag the border | `Shift+R`, then arrows; `Enter` or `Esc` to finish |
| Fullscreen and back | `M` in the title bar | `Shift+F` (a video also: double click on its frame) |
| Close a tile | `X` in the title bar | `Shift+Q`, also inside a game or app |
| Restart an app | the **Restart** cell of its key bar | `Shift+0`, also inside the app's frame |
| UI scale 1x, 1.5x or 2x | the **Scale** cell of the bottom bar | `Shift+S` |

Why Shift, and what it costs: see [DESIGN.md](DESIGN.md#controls).

## Running

Both environments use [`compose.yml`](compose.yml) and an env file that sets `HOST_PORT` and `CONTENT_DIR`. The container listens on port 80 and mounts the content directory read-only.

- **Dev:** `docker compose --env-file .env.dev up` serves the site at `localhost:8080`, with the example content in [`example/`](example/). All files in the example are test files.
- **Prod:** compose is one way: copy [`.env.prod.example`](.env.prod.example) to `.env.prod`, set `CONTENT_DIR` and `HOST_PORT`, then run `docker compose --env-file .env.prod up -d`. The port is published on `127.0.0.1` only; TLS and any public proxy are set up on the host. Any nginx with [`nginx/nginx.conf`](nginx/nginx.conf) works as well. A proxy in front must not cap the response size (Godot games are cut at about 5 MB by such a cap). The content root needs `readme.md`.

nginx must be able to read every file in the content directory. A file that only its owner can read (mode 600) is served as 403, and its picture or track does not play. Check with:

```sh
find <content> -type f ! -perm -o=r
```

## License

The code is MIT, see [LICENSE](LICENSE).

The `VGA_9X16` table (PxPlus IBM VGA 9x16) and the Cyrillic block of the `RV_FONT` table (rv_font) in [`site/js/font_data.js`](site/js/font_data.js) are CC BY-SA 4.0. The full license text of PxPlus IBM VGA is [third_party/pxplus-ibm-vga/LICENSE](third_party/pxplus-ibm-vga/LICENSE); the origin of both fonts is in [third_party/pxplus-ibm-vga/ORIGIN.md](third_party/pxplus-ibm-vga/ORIGIN.md) and [third_party/rv_font/ORIGIN.md](third_party/rv_font/ORIGIN.md).

The project document, covering the purpose, the structure and the reasons behind the decisions, is [DESIGN.md](DESIGN.md).

## What is on the screen

The screen is divided into tiles of six types: pmc, Note, Player, Video, App and Image. Each of pmc, Note, Player, Video and Image has one tile; an app has one tile per app. Every tile ends with a key bar whose cells can be clicked.

pmc is the file manager: two panels in one tile, in the spirit of early Midnight Commander. Details of the tiles and of pmc are in [DESIGN.md](DESIGN.md).

![Tiles](docs/screenshots/tiles.png)
