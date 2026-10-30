// Audio and video tile: element from media_element.js, state from player.js, drawing here. Window listeners are the caller's.
import { createMediaElement, drawVideoFrame } from './media_element.js';
import { createPlayer, play, pause, stop, seek, setVolume, toggleMute, toggleLoop, next, prev, setFit,
  setDuration, setPosition, currentPath, playlistLabels } from './player.js';
import { drawText, measureText } from './font.js';
import { SUNKEN, BUTTON, BRASS, TEXT, TEXT_BRIGHT, TEXT_DIM, WELL_BG } from './theme.js';
import { ROW_H, PAD } from './metrics.js';
// Kinds, player status, video scale modes (strings of FIT_MODES) and the order of key F.
const AUDIO = 'audio', VIDEO = 'video', PLAYING = 'playing', FIT = 'fit';
const FIT_CYCLE = [FIT, '1x', '2x'], NATIVE_SCALE = { '1x': 1, '2x': 2 };
// Font of tile text; TEXT_Y centres its 8 px glyph in a ROW_H row.
const TILE_FONT = 'rv', TEXT_Y = 4;
// Keys, sizes and texts. Volume is 0..1. MEDIA_ERROR_TEXT is for a MediaError code without a message.
const SEEK_STEP = 5, VOLUME_STEP = 0.1, BUTTON_W = 28, FLAG_GAP = 2 * PAD;
const BUTTON_LABELS = { prev: '<<', toggle: '>', stop: '[]', next: '>>' }; // left to right
const PAUSE_LABEL = '||', REPEAT_FLAG = 'REPEAT', MUTE_FLAG = 'MUTE', LOADING = 'loading...', UNKNOWN_TIME = '--:--';
const MEDIA_ERROR_TEXT = { 1: 'playback aborted', 2: 'network error', 3: 'decoding failed', 4: 'file not supported' };
const UNKNOWN_ERROR = 'unknown media error', SECONDS_PER_MINUTE = 60, TWO_DIGITS = 2;
const UNKNOWN_SIZE = 1; // video size before metadata; no frame is drawn then
// Control rows of the block, top to bottom.
const ROW = { TIME: 0, SEEK: 1, BUTTONS: 2, VOLUME: 3, FLAGS: 4 }, CONTROL_H = Object.keys(ROW).length * ROW_H;
const done = (action) => () => { action(); return true; };
const clamp01 = (value) => Math.min(Math.max(value, 0), 1);
const hit = (rect, x, y) => x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
const labelOf = (action, status) => (action === 'toggle' && status === PLAYING ? PAUSE_LABEL : BUTTON_LABELS[action]);
const reasonText = (reason) => reason.message || MEDIA_ERROR_TEXT[reason.code] || UNKNOWN_ERROR;
const formatTime = (seconds) => {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / SECONDS_PER_MINUTE)}:${String(whole % SECONDS_PER_MINUTE).padStart(TWO_DIGITS, '0')}`;
};
const paint = (ctx, color, rect) => { ctx.fillStyle = color; ctx.fillRect(rect.x, rect.y, rect.w, rect.h); };
// Sunken bar with a BRASS part of the fraction (0..1) from the left.
const drawBar = (ctx, rect, fraction) => {
  paint(ctx, SUNKEN, rect);
  paint(ctx, BRASS, { ...rect, w: Math.floor(rect.w * clamp01(fraction)) });
};
// Paints draw clipped to area, so a frame or a name cannot spill into the rows around it.
const clipped = (ctx, area, draw) => {
  ctx.save(); ctx.beginPath(); ctx.rect(area.x, area.y, area.w, area.h); ctx.clip();
  draw(); ctx.restore();
};
// Audio has its name row above the controls; video has the frame above them.
function layoutOf(kind, rect) {
  const top = kind === AUDIO ? rect.y + ROW_H : rect.y + rect.h - CONTROL_H;
  const row = (index) => ({ x: rect.x + PAD, y: top + index * ROW_H, w: rect.w - 2 * PAD, h: ROW_H });
  const buttons = Object.keys(BUTTON_LABELS).map((action, index) => (
    { action, x: rect.x + PAD + index * (BUTTON_W + PAD), y: row(ROW.BUTTONS).y, w: BUTTON_W, h: ROW_H }));
  return { time: row(ROW.TIME), seek: row(ROW.SEEK), volume: row(ROW.VOLUME), flags: row(ROW.FLAGS), buttons };
}
function drawControls(ctx, layout, state, error) {
  const line = error ?? `${formatTime(state.position)} / ${state.duration > 0 ? formatTime(state.duration) : UNKNOWN_TIME}`;
  clipped(ctx, layout.time, () => drawText(ctx, line, layout.time.x, layout.time.y + TEXT_Y, TILE_FONT, error ? BRASS : TEXT));
  drawBar(ctx, layout.seek, state.duration > 0 ? state.position / state.duration : 0);
  for (const button of layout.buttons) {
    const label = labelOf(button.action, state.status);
    paint(ctx, BUTTON, button);
    const x = button.x + Math.floor((button.w - measureText(label, TILE_FONT)) / 2);
    drawText(ctx, label, x, button.y + TEXT_Y, TILE_FONT, TEXT);
  }
  drawBar(ctx, layout.volume, state.muted ? 0 : state.volume);
  let x = layout.flags.x;
  for (const [label, on] of [[REPEAT_FLAG, state.loop], [MUTE_FLAG, state.muted]]) {
    drawText(ctx, label, x, layout.flags.y + TEXT_Y, TILE_FONT, on ? TEXT_BRIGHT : TEXT_DIM);
    x += measureText(label, TILE_FONT) + FLAG_GAP;
  }
}
// Frame inside area: Fit scales it to the area; 1x and 2x keep the natural size times the scale.
function drawFrame(ctx, element, fit, area) {
  paint(ctx, WELL_BG, area);
  const natural = { w: element.videoWidth || UNKNOWN_SIZE, h: element.videoHeight || UNKNOWN_SIZE };
  const scale = fit === FIT ? Math.min(area.w / natural.w, area.h / natural.h) : NATIVE_SCALE[fit];
  const w = Math.floor(natural.w * scale);
  const h = Math.floor(natural.h * scale);
  const frame = { x: area.x + Math.floor((area.w - w) / 2), y: area.y + Math.floor((area.h - h) / 2), width: w, height: h };
  if (drawVideoFrame(ctx, element, frame)) return;
  const x = area.x + Math.floor((area.w - measureText(LOADING, TILE_FONT)) / 2);
  drawText(ctx, LOADING, x, area.y + Math.floor((area.h - ROW_H) / 2) + TEXT_Y, TILE_FONT, TEXT);
}
// Tile of one audio or video file. folderEntries is the folder listing given by the caller.
export function createMediaTile(kind, folderPath, folderEntries, currentName, requestRedraw) {
  if (kind !== AUDIO && kind !== VIDEO) throw new Error(`Media tile: kind must be audio or video, got ${kind}`);
  let state = createPlayer(folderEntries, currentName, kind);
  let error = null;
  const media = createMediaElement(kind);
  const commit = (nextState) => { state = nextState; requestRedraw(); };
  const showError = (reason) => { error = reasonText(reason); commit(pause(state)); };
  // AbortError (play cut short by pause, load or stop) is no failure; other refusals are shown.
  const playMedia = () => media.play().then(() => { error = null; requestRedraw(); },
    (reason) => { if (reason.name !== 'AbortError') showError(reason); });
  const togglePlay = () => {
    if (state.status === PLAYING) { commit(pause(state)); media.pause(); } else { commit(play(state)); playMedia(); }
  };
  // A new file plays on if the tile was playing; otherwise it waits paused.
  const move = (nextState) => {
    error = null;
    commit(nextState);
    media.load(currentPath(state, folderPath));
    if (state.status === PLAYING) playMedia(); else media.pause();
  };
  const seekTo = (seconds) => { commit(seek(state, seconds)); media.seek(state.position); };
  const volumeTo = (value) => { commit(setVolume(state, value)); media.setVolume(state.volume); };
  const toggleMuted = () => { commit(toggleMute(state)); media.setMuted(state.muted); };
  const stopPlayback = () => { commit(stop(state)); media.stop(); };
  // Loop is kept by player.js, not by the element: the end of a file goes to next(), which wraps.
  const cycleFit = () => {
    if (kind !== VIDEO) return false;
    commit(setFit(state, FIT_CYCLE[(FIT_CYCLE.indexOf(state.fit) + 1) % FIT_CYCLE.length]));
    return true;
  };
  const ACTIONS = { prev: () => move(prev(state)), toggle: togglePlay, stop: stopPlayback, next: () => move(next(state)) };
  const KEY_ACTIONS = {
    ' ': done(togglePlay), m: done(toggleMuted), l: done(() => commit(toggleLoop(state))),
    ArrowLeft: done(() => seekTo(state.position - SEEK_STEP)), ArrowRight: done(() => seekTo(state.position + SEEK_STEP)),
    ArrowUp: done(() => volumeTo(state.volume + VOLUME_STEP)), ArrowDown: done(() => volumeTo(state.volume - VOLUME_STEP)),
    n: done(ACTIONS.next), p: done(ACTIONS.prev), f: cycleFit,
  };
  media.onTime((seconds) => commit(setPosition(state, seconds)));
  // Unknown length (NaN, or Infinity of a stream) is 0, which player.js reads as not known yet.
  media.onMeta((seconds) => commit(setDuration(state, Number.isFinite(seconds) ? seconds : 0)));
  media.onEnded(() => move(next(state))); media.onError(showError);
  media.load(currentPath(state, folderPath));
  return {
    draw(ctx, rect) {
      if (kind === AUDIO) {
        const name = playlistLabels(state).find((label) => label.current).name;
        clipped(ctx, { ...rect, h: ROW_H }, () => drawText(ctx, name, rect.x + PAD, rect.y + TEXT_Y, TILE_FONT, TEXT_BRIGHT));
      } else {
        const frame = { x: rect.x, y: rect.y, w: rect.w, h: rect.h - CONTROL_H };
        clipped(ctx, frame, () => drawFrame(ctx, media.element, state.fit, frame));
      }
      drawControls(ctx, layoutOf(kind, rect), state, error);
    },
    key(event) {
      const name = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      return !(event.ctrlKey || event.altKey || event.metaKey) && Object.hasOwn(KEY_ACTIONS, name) && KEY_ACTIONS[name]();
    },
    pointer(x, y, rect) {
      const layout = layoutOf(kind, rect);
      const button = layout.buttons.find((item) => hit(item, x, y));
      if (button) { ACTIONS[button.action](); return true; }
      if (hit(layout.seek, x, y)) {
        if (state.duration > 0) seekTo((x - layout.seek.x) / layout.seek.w * state.duration);
        return true;
      }
      if (hit(layout.volume, x, y)) { volumeTo((x - layout.volume.x) / layout.volume.w); return true; }
      return false;
    },
    dispose: () => media.dispose(),
  };
}
