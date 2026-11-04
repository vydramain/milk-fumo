// Tag readers: buffers are built here, so no fixtures are needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readTags } from '../site/js/tags.js';
import { headerOf, rowOf } from '../site/js/media.js';

const enc = new TextEncoder();
const cat = (...a) => Uint8Array.from(a.flat(Infinity));
const u32 = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le32 = (n) => u32(n).reverse();
const syncsafe = (n) => [(n >>> 21) & 127, (n >>> 14) & 127, (n >>> 7) & 127, n & 127];
const latin1 = (s) => [...s].map((c) => c.charCodeAt(0));
const utf16 = (s) => [0xff, 0xfe, ...[...s].flatMap((c) => [c.charCodeAt(0) & 255, c.charCodeAt(0) >> 8])];

// ver 2: 3+3 byte frame headers; 3: 4+4(plain)+2; 4: 4+4(syncsafe)+2.
function id3(ver, frames, pad = 0) {
  const body = frames.flatMap(([id, data]) => {
    const n = data.length;
    if (ver === 2) return [...latin1(id), 0, (n >> 8) & 255, n & 255, ...data];
    return [...latin1(id), ...(ver === 3 ? u32(n) : syncsafe(n)), 0, 0, ...data];
  });
  const all = [...body, ...new Array(pad).fill(0)];
  return cat(latin1('ID3'), ver, 0, 0, syncsafe(all.length), all);
}

test('ID3v2.3 latin1 and UTF-16', () => {
  const b = id3(3, [
    ['TIT2', [0, ...latin1("Isn't She Lovely")]],
    ['TPE1', [1, ...utf16('Stevie Wonder')]],
    ['TALB', [0, ...latin1('Songs in the Key of Life')]],
    ['TYER', [0, ...latin1('1976')]]
  ], 8);
  assert.deepEqual(readTags(b), { title: "Isn't She Lovely", artist: 'Stevie Wonder', album: 'Songs in the Key of Life', year: '1976' });
});

test('ID3v2.4 syncsafe frame sizes, UTF-8, TDRC 2026-01-02', () => {
  const long = 'я'.repeat(100); // 200 bytes: the size needs two syncsafe bytes
  const b = id3(4, [['TIT2', [3, ...enc.encode(long)]], ['TDRC', [3, ...enc.encode('2026-01-02')]]]);
  assert.deepEqual(readTags(b), { title: long, year: '2026' });
});

test('ID3v2.2 three-letter ids', () => {
  const b = id3(2, [['TT2', [0, ...latin1('T')]], ['TP1', [0, ...latin1('A')]], ['TAL', [0, ...latin1('B')]], ['TYE', [0, ...latin1('1999')]]]);
  assert.deepEqual(readTags(b), { title: 'T', artist: 'A', album: 'B', year: '1999' });
});

test('a truncated ID3 header returns null', () => {
  const b = id3(3, [['TIT2', [0, ...latin1('Title')]]]);
  assert.equal(readTags(b.subarray(0, 6)), null);
  assert.equal(readTags(b.subarray(0, b.length - 1)), null);
});

test('bytes without ID3 or OggS return {}', () => {
  assert.deepEqual(readTags(cat(latin1('RIFF'), new Array(40).fill(1))), {});
});

// Packets laid out as lacing segments and cut into pages of at most `perPage` segments.
function ogg(packets, perPage) {
  const segs = packets.flatMap((p) => {
    const out = [];
    for (let o = 0; ; o += 255) { out.push(p.subarray(o, o + 255)); if (p.length - o < 255) break; }
    return out;
  });
  const pages = [];
  for (let i = 0; i < segs.length; i += perPage) {
    const part = segs.slice(i, i + perPage);
    pages.push(cat(latin1('OggS'), 0, i ? 1 : 0, new Array(20).fill(0), part.length, part.map((s) => s.length), part.map((s) => [...s])));
  }
  return cat(pages.map((p) => [...p]));
}
function comments(magic, vendor, fields) {
  return cat(magic, le32(vendor.length), latin1(vendor), le32(fields.length),
    fields.flatMap((f) => { const e = [...enc.encode(f)]; return [...le32(e.length), ...e]; }));
}
const FIELDS = ['title=Пролог?', 'ARTIST=Vydra', 'Album=Пролог?', 'DATE=2026-05'];
const WANT = { title: 'Пролог?', artist: 'Vydra', album: 'Пролог?', year: '2026' };

test('Ogg Vorbis comment split over two pages', () => {
  const id = cat(1, latin1('vorbis'), new Array(23).fill(0));
  const b = ogg([id, comments([3, ...latin1('vorbis')], 'x'.repeat(300), FIELDS)], 2); // the comment packet spans pages
  assert.deepEqual(readTags(b), WANT);
  assert.equal(readTags(b.subarray(0, 100)), null);
});

test('OpusTags works the same', () => {
  const id = cat(latin1('OpusHead'), new Array(11).fill(0));
  const b = ogg([id, comments(latin1('OpusTags'), 'x'.repeat(300), FIELDS)], 2);
  assert.deepEqual(readTags(b), WANT);
});

test('a buffer shorter than a signature returns null', () => {
  for (const b of [new Uint8Array(0), cat(latin1('ID')), cat(latin1('Ogg'))]) assert.equal(readTags(b), null);
  assert.deepEqual(readTags(cat(latin1('RIF'))), {});
});

test('random bytes never throw', () => {
  for (let i = 0; i < 1000; i++) {
    const b = new Uint8Array(Math.floor(Math.random() * 200));
    for (let j = 0; j < b.length; j++) b[j] = Math.floor(Math.random() * 256);
    if (i % 2 && b.length > 4) b.set(latin1(i % 4 === 1 ? 'ID3' : 'OggS'));
    const r = readTags(b);
    assert.ok(r === null || typeof r === 'object');
  }
});

test('headerOf', () => {
  assert.deepEqual(headerOf('Ghjkju_(fin).ogg', { title: 'Пролог?', artist: 'Vydra', album: 'Пролог?', year: '2026' }), { name: 'Пролог?', art: 'Vydra — Пролог? (2026)' });
  assert.deepEqual(headerOf('vabank.mp3', null), { name: 'vabank', art: '' });
});

test('rowOf', () => {
  assert.equal(rowOf('Ghjkju_(fin).ogg', { title: 'Пролог?', artist: 'Vydra' }), 'Vydra — Пролог?');
  assert.equal(rowOf('x.mp3', { title: 'Watermelon Man', artist: 'Herbie Hancock' }), 'Herbie Hancock — Watermelon Man');
  assert.equal(rowOf('vabank.mp3', null), 'vabank.mp3');
  assert.equal(rowOf('x.mp3', { title: 'Solo' }), 'Solo');
});
