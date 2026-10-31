// The media player: an audio or video element created by the script and never put in the page.
// Video frames are drawn into the canvas. The same player serves the audio and video tiles and the quick view.
import { C } from './theme.js';
import { PANE_MIN } from './metrics.js';
import { RV, VGA, textWidth } from './font.js';
import { urlOf } from './catalog.js';
import { box, button } from './widgets.js';

const CONTROL_COLOR = { Pv: C.blue, Pl: C.green, Ps: C.yellow, Sp: C.red, Nx: C.blue, Mt: C.mauve };
const SPEEDS = ['fit', '1x', '2x'];
const BUTTON = 40;

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
    this.element.preload = 'metadata';
    this.element.playsInline = true;
    this.element.volume = 0.82;
    this.speed = 'fit';
    this.loop = false;
    this.durations = new Map();
    this.element.addEventListener('loadedmetadata', () => {
      this.durations.set(this.index, this.element.duration);
      this.ws.requestDraw();
    });
    this.element.addEventListener('timeupdate', () => this.ws.requestDraw());
    this.element.addEventListener('ended', () => this.ended());
    this.element.addEventListener('error', () => this.ws.requestDraw());
    this.load(index, false);
  }

  // The smallest tile a player fits in: its five buttons, as in the prototype.
  get minimum() { return PANE_MIN.player; }

  get entry() { return this.set[this.index]; }

  get playing() { return !this.element.paused && !this.element.ended; }

  // A playing video needs a frame at every animation frame; a playing audio only needs its clock redrawn.
  animated() { return this.playing && this.kind === 'video'; }

  load(index, play) {
    this.index = (index + this.set.length) % this.set.length;
    this.element.src = urlOf((this.dir ? this.dir + '/' : '') + this.entry.name);
    this.element.load();
    if (play) this.play();
    this.ws.requestDraw();
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

  setVolume(level) {
    this.element.volume = Math.max(0, Math.min(1, level));
    this.element.muted = false;
    this.ws.requestDraw();
  }

  volumeBy(step) { this.setVolume(this.element.volume + step); }

  toggleMute() { this.element.muted = !this.element.muted; this.ws.requestDraw(); }

  duration() {
    const known = this.durations.get(this.index);
    if (known !== undefined) return known;
    return Number.isFinite(this.element.duration) ? this.element.duration : NaN;
  }

  dispose() {
    this.element.pause();
    this.element.removeAttribute('src');
    this.element.load();
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
    else if (k === 'KeyL' && this.kind === 'video') this.loop = !this.loop;
    else if (k === 'ArrowRight') this.element.currentTime = Math.min(this.duration() || 0, this.element.currentTime + 5);
    else if (k === 'ArrowLeft') this.element.currentTime = Math.max(0, this.element.currentTime - 5);
    else if (k === 'ArrowUp') this.volumeBy(0.05);
    else if (k === 'ArrowDown') this.volumeBy(-0.05);
    else return false;
    this.ws.requestDraw();
    return true;
  }

  // Audio layout: a now-playing well, the position, the buttons, the volume and the playlist.
  drawAudio(p, r, hits) {
    const e = this.element;
    const now = { x: r.x, y: r.y, w: r.w, h: 56 };
    p.fill(now.x, now.y, now.w, now.h, C.cb);
    const time = timeText(e.currentTime);
    p.text(VGA, now.x + 10, now.y + 12, time, C.green, 2);
    const tx = now.x + 10 + textWidth(VGA, time, 2) + 12;
    p.text(RV, tx, now.y + 10, this.entry.name, C.ct, 2);
    const folder = this.dir ? '/' + this.dir + '/' : '/';
    p.text(RV, tx, now.y + 40, `${this.entry.name.split('.').pop().toUpperCase()} · ${timeText(this.duration())} · ${folder} · ${this.index + 1} of ${this.set.length}`, C.cs);

    // The position: a sunken slider, a scale of ticks under it, and the caption with the times.
    const seek = { x: r.x + 2, y: r.y + 62, w: r.w - 4, h: 10 };
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

    const row = r.y + 104;
    this.audioButtons(p, hits, r.x + 2, row);
    const vol = { x: r.x + 2 + 5 * (BUTTON + 4) + 14 + BUTTON + 6, y: row + 13, w: 60, h: 14 };
    p.dither(vol, C.inset, C.lo);
    p.bevel(vol, 1, false);
    const level = Math.round((vol.w - 4) * (e.muted ? 0 : e.volume));
    p.fill(vol.x + 2, vol.y + 4, level, 6, C.sel);
    p.text(RV, vol.x + vol.w + 6, vol.y + 3, `Vol. ${Math.round(e.volume * 100)}%`, C.text);
    hits.add(vol, { press: (x) => { this.setVolume((x - vol.x) / vol.w); return (qx) => this.setVolume((qx - vol.x) / vol.w); } });

    this.playlist(p, hits, { x: r.x, y: row + 52, w: r.w, h: Math.max(0, r.y + r.h - (row + 52)) });
  }

  audioButtons(p, hits, x, y) {
    const items = [
      { code: 'Pv', label: 'Prev', click: () => this.load(this.index - 1, this.playing) },
      { code: 'Pl', label: 'Play', click: () => this.play(), on: this.playing },
      { code: 'Ps', label: 'Pause', click: () => this.pause() },
      { code: 'Sp', label: 'Stop', click: () => this.stop() },
      { code: 'Nx', label: 'Next', click: () => this.load(this.index + 1, this.playing) },
    ];
    items.forEach((it, i) => this.controlButton(p, hits, { x: x + i * (BUTTON + 4), y, w: BUTTON, h: BUTTON }, it));
    this.controlButton(p, hits, { x: x + 5 * (BUTTON + 4) + 10, y, w: BUTTON, h: BUTTON },
      { code: 'Mt', label: 'Mute', click: () => this.toggleMute(), on: this.element.muted });
  }

  controlButton(p, hits, r, { code, label, click, on = false }) {
    box(p, r, !on, on ? C.inset : C.btn);
    p.text(VGA, r.x + Math.floor((r.w - 18) / 2), r.y + 6, code, CONTROL_COLOR[code]);
    p.text(RV, r.x + Math.floor((r.w - textWidth(RV, label)) / 2), r.y + 27, label, C.text);
    hits.add(r, { click });
  }

  playlist(p, hits, r) {
    p.fill(r.x, r.y, r.w, r.h, C.cb);
    const lenX = r.x + r.w - 40;
    p.fill(r.x, r.y, r.w, 13, C.csurf);
    p.text(RV, r.x + 3, r.y + 3, `Playlist: /${this.dir ? this.dir + '/' : ''}`, C.bright);
    p.text(RV, lenX, r.y + 3, 'Len.', C.bright);
    this.set.forEach((entry, i) => {
      const row = { x: r.x, y: r.y + 14 + i * 12, w: r.w - 14, h: 12 };
      if (row.y + row.h > r.y + r.h) return;
      if (i === this.index) p.fill(row.x, row.y, row.w, row.h, C.cur);
      p.text(RV, r.x + 3, row.y + 2, i === this.index ? '>' : String(i + 1), i === this.index ? C.green : C.cov);
      p.text(RV, r.x + 14, row.y + 2, entry.name, C.ct);
      const d = this.durations.get(i);
      p.text(RV, lenX, row.y + 2, d ? timeText(d) : '--:--', C.cs);
      hits.add(row, { click: () => this.load(i, this.playing) });
    });
  }

  // Video layout: the controls, the frame with the volume wheel on the left, the position and the caption.
  drawVideo(p, r, hits) {
    let x = r.x;
    const icon = (code, click, on) => {
      const b = { x, y: r.y, w: 20, h: 16 };
      box(p, b, !on, on ? C.inset : C.btn);
      p.text(RV, b.x + 3, b.y + 4, code, CONTROL_COLOR[code]);
      hits.add(b, { click });
      x += 22;
    };
    icon('Pl', () => this.play(), this.playing);
    icon('Ps', () => this.pause(), false);
    icon('Sp', () => this.stop(), false);
    x += 6;
    for (const s of SPEEDS) {
      const b = { x, y: r.y, w: 30, h: 16 };
      button(p, hits, b, s === 'fit' ? 'Fit' : s, { on: this.speed === s, click: () => { this.speed = s; this.ws.requestDraw(); } });
      x += 33;
    }
    x += 6;
    const cb = { x, y: r.y + 3, w: 10, h: 10 };
    box(p, cb, false, C.inset);
    if (this.loop) p.fill(cb.x + 3, cb.y + 3, 4, 4, C.sel);
    p.text(RV, cb.x + 14, r.y + 4, 'Loop', C.text);
    hits.add({ x: cb.x, y: r.y, w: 60, h: 16 }, { click: () => { this.loop = !this.loop; this.ws.requestDraw(); } });

    const area = { x: r.x, y: r.y + 20, w: r.w, h: r.h - 20 - 16 };
    const wheel = { x: area.x + 2, y: area.y + 6, w: 14, h: 60 };
    p.fill(wheel.x, wheel.y, wheel.w, wheel.h, C.btn);
    p.bevel(wheel, 1, false);
    const level = Math.round((wheel.h - 4) * (this.element.muted ? 0 : this.element.volume));
    p.fill(wheel.x + 3, wheel.y + wheel.h - 2 - level, wheel.w - 6, level, C.sel);
    hits.add(wheel, {
      wheel: (dy) => this.volumeBy(dy < 0 ? 0.05 : -0.05),
      press: (px, py) => { this.setVolume((wheel.y + wheel.h - py) / wheel.h); return (qx, qy) => this.setVolume((wheel.y + wheel.h - qy) / wheel.h); },
    });

    const frame = { x: area.x + 20, y: area.y + 4, w: area.w - 40, h: area.h - 24 };
    p.fill(frame.x, frame.y, frame.w, frame.h, C.crust);
    this.drawFrame(p, frame);
    const seek = { x: frame.x, y: r.y + r.h - 22, w: frame.w, h: 8 };
    const frac = this.duration() ? this.element.currentTime / this.duration() : 0;
    p.fill(seek.x, seek.y + 3, seek.w, 1, C.dim);
    p.fill(seek.x + Math.round(seek.w * frac), seek.y, 2, 8, C.sel);
    hits.add({ x: seek.x, y: seek.y - 4, w: seek.w, h: 16 }, { press: (px) => { this.seek((px - seek.x) / seek.w); return (qx) => this.seek((qx - seek.x) / seek.w); } });

    const caption = `Volume — wheel on the left, position — scale below · ${this.entry.name} · ${this.videoSize()} · ${timeText(this.element.currentTime)} / ${timeText(this.duration())}`;
    p.text(RV, r.x, r.y + r.h - 8, caption, C.dim);
  }

  videoSize() {
    const v = this.element;
    return v.videoWidth ? `${v.videoWidth}×${v.videoHeight}` : '—';
  }

  // The frame is drawn from the element: fitted, or at 1x or 2x of its own pixels, clipped to the frame.
  drawFrame(p, frame) {
    const v = this.element;
    if (!v.videoWidth) {
      const t = 'video frame';
      p.text(RV, frame.x + Math.floor((frame.w - textWidth(RV, t)) / 2), frame.y + Math.floor(frame.h / 2) - 4, t, C.cov);
      return;
    }
    const s = this.speed === 'fit' ? Math.min(frame.w / v.videoWidth, frame.h / v.videoHeight) : Number(this.speed[0]);
    const w = Math.round(v.videoWidth * s), h = Math.round(v.videoHeight * s);
    p.clip(frame);
    p.image(v, frame.x + Math.floor((frame.w - w) / 2), frame.y + Math.floor((frame.h - h) / 2), w, h);
    p.unclip();
  }

  // Draws the player in a rectangle; the audio and video layouts differ.
  draw(p, r, hits) {
    if (this.kind === 'video') this.drawVideo(p, r, hits);
    else this.drawAudio(p, r, hits);
  }
}
