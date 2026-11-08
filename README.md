# MILK-FUMO

![Start screen](docs/screenshots/start-screen.png)

A personal portfolio site shaped as a tiling window manager. The browser window is divided into tiles, as in i3: the tiles hold a file browser over the published content, notes, audio and video players, and web games. The content is a plain directory on the owner's server, served by nginx.

- The interface is drawn in one `<canvas>`. The site is plain JavaScript modules in [`site/`](site/), with no dependencies and no build step.
- Everything can be done with the keyboard, with the mouse, or with both.
- The site is read-only for visitors; they write nothing to the published content.
- Chromium and Firefox are supported.
- [`docs/design-system/`](docs/design-system/) shows every component the site draws and every motion, drawn by the site's own modules (see [DESIGN.md](DESIGN.md#design-system)).

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

Three things run from this repository: the design system, the dev build and the prod build. There is no build step: a "build" is an nginx container that serves [`site/`](site/) and a content directory. All commands run in the repository root.

| What | Needs |
|---|---|
| Design system | any static HTTP server; the example uses Python 3 |
| Dev and prod builds | Docker with the Compose plugin |

### Opening the design system

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open <http://localhost:8000/docs/design-system/>. The server must serve the repository root, because the page loads the site's modules from `../../site/js/`; a page opened as a file does not work, since browsers do not load ES modules from `file://`. The content is the fixtures in [`docs/design-system/content/`](docs/design-system/content/); Docker and nginx are not needed. The scale and the network are set by the controls on the page, or in the address: `?ui=2&net=slow` (`net` is `fast`, `slow`, `stalled` or `offline`). `Ctrl+C` stops the server.

### Dev build

```sh
docker compose --env-file .env.dev up
```

Open <http://localhost:8080>. [`.env.dev`](.env.dev) publishes port 8080 on `127.0.0.1` and mounts the example content in [`example/`](example/). All files in the example are test files.

**Content.** A variable set in the shell takes precedence over the env file, so other content is served with, for example:

```sh
CONTENT_DIR=./docs/design-system/content docker compose --env-file .env.dev up
```

**Editing.** `site/` and the content are mounted, so a changed file is served on the next reload of the page, without a restart. A change to [`nginx/nginx.conf`](nginx/nginx.conf) needs `docker compose --env-file .env.dev restart`.

**Stopping.** `Ctrl+C`, then `docker compose --env-file .env.dev down`. Every compose command needs the env file, because [`compose.yml`](compose.yml) requires `HOST_PORT` and `CONTENT_DIR`.

### Prod build

On the server:

1. Clone the repository.
2. Copy [`.env.prod.example`](.env.prod.example) to `.env.prod` and set `CONTENT_DIR` to the absolute path of the content directory, the one the owner uploads to over SFTP, and `HOST_PORT` to a free port.
3. Put `readme.md` in the root of the content directory, and check that nginx can read every file. A file that only its owner can read (mode 600) is served as 403, and its picture or track does not play. This lists such files:

   ```sh
   find <content> -type f ! -perm -o=r
   ```

4. Start it:

   ```sh
   docker compose --env-file .env.prod up -d
   ```

5. The port is published on `127.0.0.1` only. TLS and the public address are set up on the host: a reverse proxy that forwards to `127.0.0.1:<HOST_PORT>`. The proxy must not cap the response size (Godot games are cut at about 5 MB by such a cap).

**Updating.** New content needs nothing: it is served once it is uploaded. New site code is `git pull`, served on the next page load. A change to `nginx/nginx.conf` needs `docker compose --env-file .env.prod restart`.

**Operating.** `docker compose --env-file .env.prod logs -f` shows the requests; `docker compose --env-file .env.prod down` stops the site. The service is `restart: unless-stopped`, so it comes back after a reboot when Docker starts on boot.

**Without Docker.** Any nginx with [`nginx/nginx.conf`](nginx/nginx.conf) works as well; its `root /srv/site` and `alias /srv/content/` are then set to the real paths.

## License

The code is MIT, see [LICENSE](LICENSE).

The `VGA_9X16` table (PxPlus IBM VGA 9x16) and the Cyrillic block of the `RV_FONT` table (rv_font) in [`site/js/font_data.js`](site/js/font_data.js) are CC BY-SA 4.0. The full license text of PxPlus IBM VGA is [third_party/pxplus-ibm-vga/LICENSE](third_party/pxplus-ibm-vga/LICENSE); the origin of both fonts is in [third_party/pxplus-ibm-vga/ORIGIN.md](third_party/pxplus-ibm-vga/ORIGIN.md) and [third_party/rv_font/ORIGIN.md](third_party/rv_font/ORIGIN.md).

The project document, covering the purpose, the structure and the reasons behind the decisions, is [DESIGN.md](DESIGN.md).

## What is on the screen

The screen is divided into tiles of six types: pmc, Note, Player, Video, App and Image. Each of pmc, Note, Player, Video and Image has one tile; an app has one tile per app. Every tile ends with a key bar whose cells can be clicked.

pmc is the file manager: two panels in one tile, in the spirit of early Midnight Commander. Details of the tiles and of pmc are in [DESIGN.md](DESIGN.md).

![Tiles](docs/screenshots/tiles.png)
