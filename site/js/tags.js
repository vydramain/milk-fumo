// Audio tags from the first bytes of a file: ID3v2 (2.2, 2.3, 2.4) in mp3, Vorbis comments in Ogg (Vorbis and Opus).
// readTags returns null while more bytes are needed, {} when there are no tags, else { title, artist, album, year }.

const ID3_FIELDS = { TIT2: 'title', TT2: 'title', TPE1: 'artist', TP1: 'artist', TALB: 'album', TAL: 'album',
  TDRC: 'year', TYER: 'year', TYE: 'year' };
const OGG_FIELDS = { title: 'title', artist: 'artist', album: 'album', date: 'year' };

const ascii = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));
const syncsafe = (b, o) => (b[o] << 21) | (b[o + 1] << 14) | (b[o + 2] << 7) | b[o + 3];
const be32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const le32 = (b, o) => ((b[o + 3] << 24) | (b[o + 2] << 16) | (b[o + 1] << 8) | b[o]) >>> 0;

function finish(tags) {
  if (tags.year) {
    const y = tags.year.match(/\d{4}/);
    if (y) tags.year = y[0]; else delete tags.year;
  }
  return tags;
}

function decodeText(b) {
  const enc = b[0], d = b.subarray(1);
  let label = 'utf-8';
  if (enc === 0) label = 'latin1';
  else if (enc === 2) label = 'utf-16be';
  else if (enc === 1) label = d[0] === 0xfe && d[1] === 0xff ? 'utf-16be' : 'utf-16le';
  return new TextDecoder(label).decode(d).replace(/^﻿/, '').replace(/\0+$/, '').trim();
}

function id3Tags(b) {
  if (b.length < 10) return null;
  const size = syncsafe(b, 6);
  if (b.length < size + 10) return null;
  const ver = b[3], end = 10 + size, tags = {};
  let p = 10;
  if (ver >= 3 && b[5] & 0x40) p += ver === 4 ? syncsafe(b, p) : be32(b, p) + 4; // extended header
  const head = ver === 2 ? 6 : 10;
  while (p + head <= end && b[p] !== 0) {
    const id = ascii(b, p, ver === 2 ? 3 : 4);
    const n = ver === 2 ? (b[p + 3] << 16) | (b[p + 4] << 8) | b[p + 5] : ver === 4 ? syncsafe(b, p + 4) : be32(b, p + 4);
    if (p + head + n > end) break;
    const key = ID3_FIELDS[id];
    if (key && n > 0 && !tags[key]) tags[key] = decodeText(b.subarray(p + head, p + head + n));
    p += head + n;
  }
  return finish(tags);
}

function oggTags(b) {
  // Join the lacing segments into packets; the second packet holds the comments.
  const packets = [];
  let cur = [], p = 0;
  while (packets.length < 2) {
    if (p + 27 > b.length) return null;
    if (ascii(b, p, 4) !== 'OggS') return {};
    const n = b[p + 26];
    if (p + 27 + n > b.length) return null;
    let o = p + 27 + n;
    for (let i = 0; i < n; i++) {
      const len = b[p + 27 + i];
      if (o + len > b.length) return null;
      cur.push(b.subarray(o, o + len));
      o += len;
      if (len < 255) { packets.push(Uint8Array.from(cur.flatMap((s) => [...s]))); cur = []; }
    }
    p = o;
  }
  const c = packets[1];
  const skip = ascii(c, 0, 7) === '\x03vorbis' ? 7 : ascii(c, 0, 8) === 'OpusTags' ? 8 : -1;
  if (skip < 0) return {};
  const tags = {};
  let q = skip + 4 + le32(c, skip);
  const count = le32(c, q);
  q += 4;
  for (let i = 0; i < count && q + 4 <= c.length; i++) {
    const len = le32(c, q);
    const [k, ...v] = new TextDecoder().decode(c.subarray(q + 4, q + 4 + len)).split('=');
    const key = OGG_FIELDS[k.toLowerCase()];
    if (key && v.length && !tags[key]) tags[key] = v.join('=').trim();
    q += 4 + len;
  }
  return finish(tags);
}

export function readTags(bytes) {
  const head = ascii(bytes, 0, 4);
  if (bytes.length < 4 && ('ID3'.startsWith(head) || 'OggS'.startsWith(head))) return null; // a signature still arriving
  try {
    if (ascii(bytes, 0, 3) === 'ID3') return id3Tags(bytes);
    if (ascii(bytes, 0, 4) === 'OggS') return oggTags(bytes);
  } catch { /* out of range or undecodable bytes: no tags */ }
  return {};
}
