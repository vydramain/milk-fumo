// Byte-counted downloads (fetch + stream reader), kept as Blobs while the tile is open.
// ponytail: whole files in memory per tile; stream to MediaSource if large videos hurt
import { urlOf } from './catalog.js';

export class Download {
  state = 'load';
  got = 0;
  total = 0; // 0 = unknown
  blob = null;
  #chunks = [];
  #href = null;
  #ctl = new AbortController();
  #stopped = false; // set by abort(): the download ends silently
  #onChange;

  constructor(url, onChange) {
    this.#onChange = onChange;
    this.#run(url);
  }

  get share() {
    if (this.state === 'done') return 1;
    return this.total ? Math.min(1, this.got / this.total) : 0;
  }

  get href() {
    if (this.state !== 'done') return null;
    return (this.#href ??= URL.createObjectURL(this.blob));
  }

  // The bytes received so far.
  prefix() {
    const out = new Uint8Array(this.got);
    let at = 0;
    for (const c of this.#chunks) { out.set(c, at); at += c.length; }
    return out;
  }

  // Stops the fetch and frees the object URL; sets no state and calls nothing.
  abort() {
    this.#stopped = true;
    this.#ctl.abort();
    if (this.#href) URL.revokeObjectURL(this.#href);
    this.#href = null;
  }

  async #run(url) {
    try {
      const res = await fetch(url, { signal: this.#ctl.signal });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      this.total = Number(res.headers.get('content-length')) || 0;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (this.#stopped) return;
        if (done) break;
        this.#chunks.push(value);
        this.got += value.length;
        this.#onChange();
      }
      this.blob = new Blob(this.#chunks, { type: res.headers.get('content-type') || '' });
      this.state = 'done';
    } catch {
      if (this.#stopped) return;
      this.state = 'errr';
    }
    this.#onChange();
  }
}

export class Downloads {
  #map = new Map();
  #onChange;

  constructor(onChange) { this.#onChange = onChange; }

  // The download of a path; an errr one is replaced by a fresh start from zero.
  want(path) {
    let d = this.#map.get(path);
    if (!d || d.state === 'errr') {
      d = new Download(urlOf(path), this.#onChange);
      this.#map.set(path, d);
    }
    return d;
  }

  peek(path) { return this.#map.get(path); }

  dispose() {
    for (const d of this.#map.values()) d.abort();
    this.#map.clear();
  }
}
