// The media player: an audio or video element created by the script and never put in the page.
// Video frames are drawn into the canvas. The same player serves the audio and video tiles and the quick view.
// Both layouts share the top: now playing, the position and the volume. Then the playlist (audio) or the frame with
// its view buttons (video), and the key bar at the bottom.
// Files are downloaded with a byte counter (download.js): the current one and the next; every started download runs to
// its end. The element streams the file meanwhile, or plays the Blob once it is done.
import { C } from './theme.js';
import { PANE_MIN } from './metrics.js';
import { RV, VGA, textWidth, fitText } from './font.js';
import { urlOf } from './catalog.js';
import { box, button, keyBar, loadBar, footBar, LOAD_W } from './widgets.js';
import { Downloads } from './download.js';
import { readTags } from './tags.js';
import { PLAYER_KEYS as K } from './texts.js';

const SPEEDS = ['fit', '1x', '2x'];
const PAD = 4;
const NOW_H = 56;
const VOLUME_H = 14;
const KEYS_H = 14;
const FOOT_H = 14;
const TAG_LIMIT = 1 << 20;        // tags are looked for in the first 1 MiB only

function timeText(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '--:--';
  const s = Math.floor(sec);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

export class Player {
  // kind: 'audio' or 'video'. set: the entries of that kind in one folder; dir: the folder's path.
  constructor(ws, kind, dir, set, index) {
    this.ws = ws;
    this.kind = kind;
    this.dir = dir;
    this.set = set;
    this.index = index;
    this.element = kind === 'video' ? document.createElement('video') : new Audio();
    this.element.preload = 'auto';
    this.element.playsInline = true;
    this.element.volume = 0.82;
    this.speed = 'fit';
    this.loop = false;
    this.tags = new Map();        // path -> tags ({} when there are none)
    this.durations = new Map();   // path -> seconds
    this.wanted = new Set();      // the paths whose downloads were started
    this.downloads = new Downloads(() => this.changed());
    this.element.addEventListener('loadedmetadata', () => {
      this.durations.set(this.path(this.index), this.element.duration);
      this.ws.requestDraw();
    });
    this.element.addEventListener('timeupdate', () => this.ws.requestDraw());
    this.element.addEventListener('ended', () => this.ended());
    this.element.addEventListener('error', () => this.ws.requestDraw());
    this.load(index, false);
  }

  // The smallest tile a player fits in: its key bar across, and for a video the frame under the controls.
  get minimum() { return this.kind === 'video' ? PANE_MIN.video : PANE_MIN.player; }

  get entry() { return this.set[this.index]; }

  get playing() { return !this.element.paused && !this.element.ended; }

  path(i) { return (this.dir ? this.dir + '/' : '') + this.set[i].name; }

  // A playing video needs a frame at every animation frame; a playing audio only needs its clock redrawn.
  animated() { return this.playing && this.kind === 'video'; }

  // Another file of the same kind, from pmc or the workspace: the downloads stay, they are kept by path.
  open(dir, set, index) {
    this.dir = dir;
    this.set = set;
    this.load(index, true);
  }

  // Starts (or, after errr, restarts) the download of the file and of the next one; a done file plays from its Blob.
  load(index, play) {
    this.index = (index + this.set.length) % this.set.length;
    const path = this.path(this.index);
    const d = this.want(path);
    if (this.index + 1 < this.set.length) this.want(this.path(this.index + 1));
    this.element.src = d.state === 'done' ? d.href : urlOf(path);
    this.element.load();
    if (play) this.play();
    this.changed();
  }

  want(path) {
    this.wanted.add(path);
    return this.downloads.want(path);
  }

  // A download moved: tags from the bytes so far (given up after 1 MiB), the duration of a finished file.
  changed() {
    for (const path of this.wanted) {
      const d = this.downloads.peek(path);
      if (!d) continue;
      if (!this.tags.has(path) && d.got) {
        const t = readTags(d.prefix());
        if (t) this.tags.set(path, t);
        else if (d.got >= TAG_LIMIT || d.state === 'done') this.tags.set(path, {});
      }
      if (d.state === 'done' && !this.durations.has(path)) this.probe(path, d.href);
    }
    this.ws.requestDraw();
  }

  probe(path, href) {
    this.durations.set(path, NaN);  // asked; --:-- until the metadata comes
    const a = new Audio();
    a.preload = 'metadata';
    a.addEventListener('loadedmetadata', () => {
      this.durations.set(path, a.duration);
      a.removeAttribute('src');
      this.ws.requestDraw();
    });
    a.src = href;
  }

  play() {
    this.element.play().catch(() => this.ws.requestDraw());
    this.ws.requestDraw();
  }

  pause() { this.element.pause(); this.ws.requestDraw(); }

  toggle() { if (this.playing) this.pause(); else this.play(); }

  stop() { this.element.pause(); this.element.currentTime = 0; this.ws.requestDraw(); }

  ended() {
    if (this.index < this.set.length - 1) this.load(this.index + 1, true);
    else if (this.loop) this.load(0, true);
    else this.ws.requestDraw();
  }

  seek(frac) {
    const d = this.duration();
    if (Number.isFinite(d)) this.element.currentTime = Math.max(0, Math.min(1, frac)) * d;
    this.ws.requestDraw();
  }

  seekBy(sec) {
    const t = this.element.currentTime + sec;
    this.element.currentTime = Math.max(0, Math.min(this.duration() || 0, t));
    this.ws.requestDraw();
  }

  setVolume(level) {
    this.element.volume = Math.max(0, Math.min(1, level));
    this.element.muted = false;
    this.ws.requestDraw();
  }

  volumeBy(step) { this.setVolume(this.element.volume + step); }

  toggleMute() { this.element.muted = !this.element.muted; this.ws.requestDraw(); }

  toggleLoop() { this.loop = !this.loop; this.ws.requestDraw(); }

  duration() {
    const known = this.durations.get(this.path(this.index));
    if (Number.isFinite(known)) return known;
    return Number.isFinite(this.element.duration) ? this.element.duration : NaN;
  }

  // A video goes to the browser's fullscreen, showing only its frame; again, it comes back. An audio player
  // has no fullscreen: false, and the workspace maximizes the tile instead. Refusals are ignored.
  fullscreen() {
    if (this.kind !== 'video') return false;
    if (this.ws.fullVideo === this) {
      this.ws.fullVideo = null;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } else {
      this.ws.fullVideo = this;
      document.documentElement.requestFullscreen().catch(() => { this.ws.fullVideo = null; this.ws.requestDraw(); });
    }
    this.ws.requestDraw();
    return true;
  }

  // Closing the tile stops the element and aborts and frees its downloads; a fullscreen video leaves the fullscreen.
  dispose() {
    if (this.ws.fullVideo === this) this.fullscreen();
    this.element.pause();
    this.element.removeAttribute('src');
    this.element.load();
    this.downloads.dispose();
  }

  // Keys of a focused player: Space plays or pauses, S stops, arrows seek and change the volume,
  // N and P go to the next and previous file, M mutes, L loops a video.
  key(e) {
    const k = e.code;
    if (k === 'Space') this.toggle();
    else if (k === 'KeyS') this.stop();
    else if (k === 'KeyN') this.load(this.index + 1, this.playing);
    else if (k === 'KeyP') this.load(this.index - 1, this.playing);
    else if (k === 'KeyM') this.toggleMute();
    else if (k === 'KeyL' && this.kind === 'video') this.toggleLoop();
    else if (k === 'ArrowRight') this.seekBy(5);
    else if (k === 'ArrowLeft') this.seekBy(-5);
    else if (k === 'ArrowUp') this.volumeBy(0.05);
    else if (k === 'ArrowDown') this.volumeBy(-0.05);
    else return false;
    this.ws.requestDraw();
    return true;
  }

  // The key bar: Space sinks Play while paused and Pause while playing; a click on Seek or Volume steps
  // forward or up, as Right and Up do. A video has Loop before Seek.
  cells() {
    const on = this.playing;
    return [
      { ...K.prev, codes: ['KeyP'], click: () => this.load(this.index - 1, this.playing) },
      { ...K.play, codes: on ? [] : ['Space'], click: () => this.play() },
      { ...K.pause, codes: on ? ['Space'] : [], click: () => this.pause() },
      { ...K.stop, codes: ['KeyS'], click: () => this.stop() },
      { ...K.next, codes: ['KeyN'], click: () => this.load(this.index + 1, this.playing) },
      { ...K.mute, codes: ['KeyM'], click: () => this.toggleMute() },
      ...(this.kind === 'video' ? [{ ...K.loop, codes: ['KeyL'], click: () => this.toggleLoop() }] : []),
      { ...K.seek, codes: ['ArrowRight', 'ArrowLeft'], click: () => this.seekBy(5) },
      { ...K.volume, codes: ['ArrowUp', 'ArrowDown'], click: () => this.volumeBy(0.05) },
    ];
  }

  // The top of both layouts, from y = r.y: a now-playing well, the position and the volume.
  // Returns the y under the volume.
  transport(p, hits, r) {
    const e = this.element;
    const now = { x: r.x, y: r.y, w: r.w, h: NOW_H };
    p.fill(now.x, now.y, now.w, now.h, C.cb);
    const time = timeText(e.currentTime);
    p.text(VGA, now.x + 10, now.y + 12, time, C.green, 2);
    const tx = now.x + 10 + textWidth(VGA, time, 2) + 12;
    const tw = now.x + now.w - 8 - tx;
    // The header: the name large, the art line under it, the meta line moving up when there is no art.
    const head = headerOf(this.entry.name, this.tags.get(this.path(this.index)));
    p.text(RV, tx, now.y + 10, fitText(RV, head.name, tw, 2), C.ct, 2);
    if (head.art) p.text(RV, tx, now.y + 28, fitText(RV, head.art, tw), C.cs);
    const folder = this.dir ? '/' + this.dir + '/' : '/';
    const size = this.kind === 'video' ? ` · ${this.videoSize()}` : '';
    const meta = `${this.entry.name.split('.').pop().toUpperCase()} · ${timeText(this.duration())} · ${folder} · ${this.index + 1} of ${this.set.length}${size}`;
    p.text(RV, tx, now.y + (head.art ? 40 : 30), fitText(RV, meta, tw), C.cs);

    const end = this.seekBar(p, hits, { x: r.x + 2, y: r.y + 62, w: r.w - 4 });

    const vol = { x: r.x + PAD, y: end + 6, w: r.w - 2 * PAD - 66, h: VOLUME_H };
    p.dither(vol, C.inset, C.lo);
    p.bevel(vol, 1, false);
    const level = Math.round((vol.w - 4) * (e.muted ? 0 : e.volume));
    p.fill(vol.x + 2, vol.y + 4, level, 6, C.sel);
    p.text(RV, vol.x + vol.w + 6, vol.y + 3, `Vol. ${Math.round(e.volume * 100)}%`, C.text);
    hits.add(vol, { press: (x) => { this.setVolume((x - vol.x) / vol.w); return (qx) => this.setVolume((qx - vol.x) / vol.w); } });
    return vol.y + vol.h;
  }

  // The position, from y = r.y across r.w: a sunken slider, a scale of ticks under it, and the caption with the times.
  // Its knob reaches 2 px above r.y. Returns the y under the caption (r.y + 30). The tile and the fullscreen panel share it.
  seekBar(p, hits, r) {
    const e = this.element;
    const seek = { x: r.x, y: r.y, w: r.w, h: 10 };
    const frac = this.duration() ? e.currentTime / this.duration() : 0;
    p.fill(seek.x, seek.y, seek.w, seek.h, C.inset);
    p.bevel(seek, 1, false);
    p.fill(seek.x + 1, seek.y + 1, Math.round((seek.w - 2) * frac), seek.h - 2, C.sel);
    box(p, { x: seek.x + Math.round((seek.w - 2) * frac) - 2, y: seek.y - 2, w: 4, h: 14 }, true, C.btn);
    hits.add(seek, { press: (x) => { this.seek((x - seek.x) / seek.w); return (qx) => this.seek((qx - seek.x) / seek.w); } });
    const ruler = { x: seek.x, y: seek.y + 13, w: seek.w, h: 8 };
    for (let x = 0; x < ruler.w; x += 6) p.fill(ruler.x + x, ruler.y + (x % 30 ? 4 : 0), 1, x % 30 ? 4 : 8, C.dim);
    const caption = { x: seek.x, y: ruler.y + 9, w: seek.w, h: 8 };
    p.text(RV, caption.x, caption.y, timeText(e.currentTime), C.dim);
    p.text(RV, caption.x + Math.floor((caption.w - textWidth(RV, 'Position')) / 2), caption.y, 'Position', C.dim);
    const dur = timeText(this.duration());
    p.text(RV, caption.x + caption.w - textWidth(RV, dur), caption.y, dur, C.dim);
    return caption.y + caption.h;
  }

  // The key bar: the last 14 px of the body. Returns the y 4 px above it, where the layout above ends.
  keys(p, hits, r) {
    const bar = { x: r.x, y: r.y + r.h - KEYS_H, w: r.w, h: KEYS_H };
    keyBar(p, hits, bar, this.cells(), this.ws.drawHeld);
    return bar.y - 4;
  }

  // Audio layout: the transport, then the playlist of the folder, then the key bar.
  drawAudio(p, r, hits) {
    const bottom = this.keys(p, hits, r);
    const end = this.transport(p, hits, r);
    this.playlist(p, hits, { x: r.x, y: end + 6, w: r.w, h: Math.max(0, bottom - (end + 6)) });
  }

  // A row: its number, `Artist — Title` once its download is under way, its load bar, its length.
  playlist(p, hits, r) {
    p.fill(r.x, r.y, r.w, r.h, C.cb);
    const lenX = r.x + r.w - 40;
    const barX = lenX - 6 - LOAD_W;
    p.fill(r.x, r.y, r.w, 13, C.csurf);
    p.text(RV, r.x + 3, r.y + 3, `Playlist: /${this.dir ? this.dir + '/' : ''}`, C.bright);
    p.text(RV, lenX, r.y + 3, 'Len.', C.bright);
    this.set.forEach((entry, i) => {
      const row = { x: r.x, y: r.y + 14 + i * 12, w: r.w - 14, h: 12 };
      if (row.y + row.h > r.y + r.h) return;
      const path = this.path(i);
      const d = this.downloads.peek(path);
      if (i === this.index) p.fill(row.x, row.y, row.w, row.h, C.cur);
      p.text(RV, r.x + 3, row.y + 2, i === this.index ? '>' : String(i + 1), i === this.index ? C.green : C.cov);
      const name = d && d.state !== 'errr' ? rowOf(entry.name, this.tags.get(path)) : entry.name;
      p.text(RV, r.x + 14, row.y + 2, fitText(RV, name, barX - 4 - (r.x + 14)), C.ct);
      loadBar(p, barX, row.y, d || null);
      p.text(RV, lenX, row.y + 2, timeText(this.durations.get(path)), C.cs);
      hits.add(row, { click: () => this.load(i, this.playing) });
    });
  }

  // Video layout: the transport, the view buttons (Fit, 1x, 2x and Loop), then the frame, the foot panel 4 px above
  // the key bar (`name · 00:00 / 01:12`, the load bar, `Keyboard: —`) and the key bar.
  drawVideo(p, r, hits) {
    const bottom = this.keys(p, hits, r);
    const end = this.transport(p, hits, r);
    const y = end + 4;
    let x = r.x + PAD;
    for (const s of SPEEDS) {
      const b = { x, y, w: 30, h: 16 };
      button(p, hits, b, s === 'fit' ? 'Fit' : s, { on: this.speed === s, click: () => { this.speed = s; this.ws.requestDraw(); } });
      x += 33;
    }
    x += 6;
    const cb = { x, y: y + 3, w: 10, h: 10 };
    box(p, cb, false, C.inset);
    if (this.loop) p.fill(cb.x + 3, cb.y + 3, 4, 4, C.sel);
    p.text(RV, cb.x + 14, y + 4, 'Loop', C.text);
    hits.add({ x: cb.x, y, w: 60, h: 16 }, { click: () => this.toggleLoop() });

    const foot = { x: r.x, y: bottom - FOOT_H, w: r.w, h: FOOT_H };
    const frame = { x: r.x + PAD, y: y + 22, w: r.w - 2 * PAD, h: Math.max(0, foot.y - 4 - (y + 22)) };
    this.frameRect = frame;     // a double click on it toggles the fullscreen (Workspace.doubleClick)
    p.fill(frame.x, frame.y, frame.w, frame.h, C.crust);
    this.drawFrame(p, frame);
    const line = `${this.entry.name} · ${timeText(this.element.currentTime)} / ${timeText(this.duration())}`;
    footBar(p, foot, line, this.downloads.peek(this.path(this.index)) || null, false);
  }

  videoSize() {
    const v = this.element;
    return v.videoWidth ? `${v.videoWidth}×${v.videoHeight}` : '—';
  }

  // The frame is drawn from the element: fitted, or at 1x or 2x of its own pixels, clipped to the frame.
  // The fullscreen always fits it.
  drawFrame(p, frame, speed = this.speed) {
    const v = this.element;
    if (!v.videoWidth) {
      const t = 'video frame';
      p.text(RV, frame.x + Math.floor((frame.w - textWidth(RV, t)) / 2), frame.y + Math.floor(frame.h / 2) - 4, t, C.cov);
      return;
    }
    const s = speed === 'fit' ? Math.min(frame.w / v.videoWidth, frame.h / v.videoHeight) : Number(speed[0]);
    const w = Math.round(v.videoWidth * s), h = Math.round(v.videoHeight * s);
    p.clip(frame);
    p.image(v, frame.x + Math.floor((frame.w - w) / 2), frame.y + Math.floor((frame.h - h) / 2), w, h);
    p.unclip();
  }

  // Draws the player in a rectangle; the audio and video layouts differ below the transport.
  draw(p, r, hits) {
    if (this.kind === 'video') this.drawVideo(p, r, hits);
    else this.drawAudio(p, r, hits);
  }
}

// The header: with tags, the title large and "Artist — Album (Year)" under it, missing parts left out; without tags,
// the file name without its extension large and no second line.
export function headerOf(fileName, tags) {
  const t = tags || {};
  const art = ([t.artist, t.album].filter(Boolean).join(' — ') + (t.year ? ' (' + t.year + ')' : '')).trim();
  return { name: t.title || fileName.replace(/\.[^.]+$/, ''), art };
}

// A playlist row: "Artist — Title", the title alone without an artist, the file name without tags.
export function rowOf(fileName, tags) {
  return tags && tags.title ? (tags.artist ? tags.artist + ' — ' : '') + tags.title : fileName;
}
