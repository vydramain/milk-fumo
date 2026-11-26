import assert from 'node:assert/strict';
import test from 'node:test';

class MediaElement extends EventTarget {
  currentTime = 0;
  duration = 60;
  paused = true;
  style = {};
  parentNode = {};

  get ended() { return this.currentTime >= this.duration; }

  load() { this.pause(); this.currentTime = 0; }
  async play() { this.paused = false; }
  pause() { this.paused = true; }
}

globalThis.Audio = MediaElement;
globalThis.document = {
  createElement: (tag) => tag === 'video' ? new MediaElement() : { getContext: () => ({}) },
};

const { Pocket } = await import('../site/js/pocket.js');
const { Player } = await import('../site/js/media.js');
const { Paint } = await import('../site/js/paint.js');
const { C } = await import('../site/js/theme.js');

// Record drawing at the canvas boundary, keeping Pocket's actual hit regions.
class Frame extends Paint {
  labels = [];
  fills = [];
  bevels = [];

  fill(x, y, w, h, color) { this.fills.push({ x, y, w, h, color }); }
  bevel(r, width, raised) { this.bevels.push({ ...r, width, raised }); }
  text(font, x, y, label, color, scale = 1) { this.labels.push({ x, y, label, color, scale }); }
  dither() {}
  clip() {}
  unclip() {}
}

function openPlayer(t, kind, w, h) {
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 404 }));
  const pocket = new Pocket(() => {}, { stub: {} });
  pocket.stub = null;
  pocket.open(kind === 'audio' ? 'Player' : 'Video');
  const ext = kind === 'audio' ? 'mp3' : 'webm';
  const entries = ['First', 'Second', 'Third'].map((name) => ({ name: name + '.' + ext, size: 256 }));
  const player = pocket.players[kind] = new Player(pocket, kind, 'media', entries, 1);
  const draw = () => {
    const frame = new Frame({}, 1);
    pocket.render(frame, w, h);
    return frame;
  };
  const button = (frame, label) => {
    const text = frame.labels.find((item) => item.label === label);
    assert.ok(text, `missing ${label} button`);
    const hit = pocket.hits.find(text.x, text.y, 'click');
    assert.ok(hit, `${label} button is not tappable`);
    return { ...hit.r, text };
  };
  const tap = (label) => {
    const { x, y, w, h } = button(draw(), label);
    pocket.pointerDown(x + w / 2, y + h / 2);
    pocket.pointerUp(x + w / 2, y + h / 2);
  };
  return { pocket, player, draw, button, tap };
}

function styleOf(frame, { x, y, w, h, text }) {
  const matches = (rect) => rect.x === x && rect.y === y && rect.w === w && rect.h === h;
  const fill = frame.fills.find(matches);
  const bevel = frame.bevels.find(matches);
  assert.ok(fill && bevel, `${text.label} has no button surface or bevel`);
  return [fill.color, bevel.width, bevel.raised, text.color, text.scale];
}

const orientations = [['portrait', 393, 852], ['landscape', 852, 393]];
for (const kind of ['audio', 'video']) {
  for (const [orientation, w, h] of orientations) {
    test(`${kind} ${orientation}: transport uses the existing key bar`, (t) => {
      const { draw, button } = openPlayer(t, kind, w, h);
      const frame = draw();
      const mute = button(frame, 'Mute');
      const back = button(frame, 'Back');
      const controls = ['Prev', 'Play', 'Stop', 'Next'].map((label) => button(frame, label));
      const lowerKeys = kind === 'video' ? [mute, button(frame, 'Full'), back] : [mute, back];
      for (const key of [...controls, ...lowerKeys]) {
        assert.deepEqual([key.w, key.h], [mute.w, mute.h]);
        assert.deepEqual(styleOf(frame, key), styleOf(frame, mute));
      }
      if (orientation === 'portrait') {
        const gap = controls[1].x - controls[0].x - mute.w;
        assert.ok(gap > 0, 'transport cells have gaps');
        assert.equal(mute.y - controls[0].y - mute.h, gap);
        for (const [i, key] of controls.entries()) {
          assert.equal(key.x, mute.x + i * (mute.w + gap));
          assert.equal(key.y, controls[0].y);
        }
        assert.equal(back.x, controls.at(-1).x);
        for (const key of lowerKeys) assert.equal(key.y, mute.y);
      } else {
        for (const key of [...controls, ...lowerKeys]) {
          assert.equal(key.x, back.x, `${key.text.label} is in the right column`);
          if (key !== back) assert.ok(key.y + key.h <= back.y, 'Back is the bottom cell');
        }
        const column = [...controls, ...lowerKeys].sort((a, b) => a.y - b.y);
        for (const [i, key] of column.slice(1).entries()) {
          assert.ok(key.y >= column[i].y + column[i].h, 'the column cells do not overlap');
        }
        assert.equal(back.y + back.h, h - 36);
      }
    });

    test(`${kind} ${orientation}: content starts just below Position`, (t) => {
      const { draw } = openPlayer(t, kind, w, h);
      const frame = draw();
      const position = frame.labels.find(({ label }) => label === 'Position');
      assert.ok(position, 'Position caption is visible');
      const background = kind === 'audio' ? C.cb : C.crust;
      const content = frame.fills.find(({ x, y, w: width, color }) =>
        color === background && x < position.x && x + width > position.x && y > position.y);
      assert.ok(content, 'playlist or video frame is visible');
      const gap = content.y - (position.y + 8);
      assert.ok(gap >= 0 && gap <= 8, `content leaves ${gap}px after Position (expected at most 8px)`);
    });

    test(`${kind} ${orientation}: transport taps preserve playback behavior`, (t) => {
      const { draw, player, tap, button } = openPlayer(t, kind, w, h);
      tap('Prev');
      assert.equal(player.index, 0);
      assert.equal(player.playing, false);
      tap('Prev');
      assert.equal(player.index, 2);
      tap('Next');
      assert.equal(player.index, 0);
      assert.equal(player.playing, false);

      tap('Play');
      assert.equal(player.playing, true);
      button(draw(), 'Pause');
      tap('Next');
      assert.equal(player.index, 1);
      assert.equal(player.playing, true);
      tap('Prev');
      assert.equal(player.index, 0);
      assert.equal(player.playing, true);

      tap('Pause');
      assert.equal(player.playing, false);
      button(draw(), 'Play');
      tap('Play');
      player.element.currentTime = 23;
      tap('Stop');
      assert.equal(player.playing, false);
      assert.equal(player.element.currentTime, 0);
      const frame = draw();
      button(frame, 'Play');
      const position = frame.labels.find(({ label }) => label === 'Position');
      assert.ok(frame.labels.some(({ x, y, label }) =>
        y === position.y && x < position.x && label === '00:00'), 'Position is reset to 00:00');
    });
  }
}

for (const action of ['pause', 'stop']) {
  test(`audio: pending track completion respects manual ${action}`, (t) => {
    const { pocket, player, tap } = openPlayer(t, 'audio', 393, 852);
    const media = player.element;

    tap('Prev');
    tap('Play');
    pocket.open('pmc');
    assert.equal(player.playing, true);
    media.currentTime = media.duration;
    media.pause();
    media.dispatchEvent(new Event('ended'));
    assert.equal(player.entry.name, 'Second.mp3');
    assert.equal(player.playing, true);
    pocket.activate('Player');

    // Chromium pauses the finished element before notifying the ended listeners.
    media.currentTime = media.duration;
    media.pause();
    player[action]();
    media.dispatchEvent(new Event('ended'));

    assert.equal(player.playing, false, `pending ended restarted playback after ${action}`);
    assert.equal(player.entry.name, 'Second.mp3');
    assert.equal(media.currentTime, action === 'pause' ? media.duration : 0);
  });
}
