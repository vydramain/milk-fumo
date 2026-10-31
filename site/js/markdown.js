// Markdown notes: the parser and the layout. The layout gives drawing operations in the note's own
// coordinates, so scrolling is one offset. Supported: # and ## headings, paragraphs, lists, quotes, rules,
// fenced code, [key] keycaps, [text](address) links, and the {{actions}} line: the tutorial's table.
import { CODE_LINE } from './metrics.js';
import { RV, VGA, textWidth } from './font.js';
import { C } from './theme.js';
import { TUTORIAL_ACTIONS } from './texts.js';

const LINE = 12;
const KEYCAP_H = 10;

export function parse(text) {
  const blocks = [];
  let para = null, list = null, code = null;
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    if (code) {
      if (raw.trim().startsWith('```')) { blocks.push({ type: 'code', lines: code }); code = null; }
      else code.push(raw);
      continue;
    }
    const line = raw.trimEnd();
    if (line.trim().startsWith('```')) { para = list = null; code = []; continue; }
    if (line.trim() === '') { para = list = null; continue; }
    if (line.startsWith('# ')) { para = list = null; blocks.push({ type: 'h1', text: line.slice(2) }); continue; }
    if (line.startsWith('## ')) { para = list = null; blocks.push({ type: 'h2', text: line.slice(3) }); continue; }
    if (/^(---|\*\*\*|___)$/.test(line)) { para = list = null; blocks.push({ type: 'hr' }); continue; }
    if (line.trim() === '{{actions}}') { para = list = null; blocks.push({ type: 'actions' }); continue; }
    if (line.startsWith('> ')) { para = list = null; blocks.push({ type: 'quote', text: line.slice(2) }); continue; }
    if (/^[-*] /.test(line)) {
      if (!list) { list = { type: 'ul', items: [] }; blocks.push(list); }
      list.items.push(line.slice(2));
      para = null;
      continue;
    }
    if (!para) { para = { type: 'p', text: line.trim() }; blocks.push(para); list = null; }
    else para.text += ' ' + line.trim();
  }
  if (code) blocks.push({ type: 'code', lines: code });
  return blocks;
}

// A link address is kept only if it is safe: an http(s) address without spaces, or a relative one that
// does not start with // and has no spaces, colons, ampersands or backslashes.
export function safeHref(href) {
  if (/^https?:\/\/\S+$/.test(href)) return true;
  return !href.startsWith('//') && !/[\s:&\\]/.test(href);
}

// Inline tokens: words, spaces, keycaps and links. Text outside the marks is plain rv_font.
export function tokens(text) {
  const out = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)|\[([^\]]+)\]/g;
  const words = (s, href) => {
    for (const piece of s.split(/( +)/)) {
      if (!piece) continue;
      out.push(piece[0] === ' ' ? { kind: 'space' } : { kind: 'word', text: piece, href });
    }
  };
  let last = 0, m;
  while ((m = re.exec(text))) {
    words(text.slice(last, m.index));
    if (m[1] !== undefined) words(m[1], safeHref(m[2]) ? m[2] : undefined);
    else out.push({ kind: 'key', text: m[3] });
    last = re.lastIndex;
  }
  words(text.slice(last));
  return out;
}

function tokenWidth(t) {
  if (t.kind === 'space') return RV.advance;
  if (t.kind === 'key') return textWidth(RV, t.text) + 6;
  return textWidth(RV, t.text);
}

// Greedy fill of tokens into lines of a width. Leading and trailing spaces are dropped.
export function fill(toks, width) {
  const lines = [];
  let cur = [], w = 0;
  for (const t of toks) {
    if (t.kind === 'space' && cur.length === 0) continue;
    const tw = tokenWidth(t);
    if (w + tw > width && cur.length) {
      while (cur.length && cur.at(-1).kind === 'space') { cur.pop(); w -= RV.advance; }
      lines.push(cur);
      cur = [];
      w = 0;
      if (t.kind === 'space') continue;
    }
    cur.push(t);
    w += tw;
  }
  while (cur.length && cur.at(-1).kind === 'space') cur.pop();
  if (cur.length || lines.length === 0) lines.push(cur);
  return lines;
}

// Draws one line of tokens at (x, y). Keycaps are raised boxes; links are bright with a dotted underline.
function emitLine(L, line, x, y, color) {
  let cx = x;
  for (const t of line) {
    if (t.kind === 'space') { cx += RV.advance; continue; }
    if (t.kind === 'key') {
      const w = textWidth(RV, t.text) + 6;
      L.ops.push({ op: 'rect', x: cx, y, w, h: KEYCAP_H, color: C.btn });
      L.ops.push({ op: 'bevel', x: cx, y, w, h: KEYCAP_H, width: 1, raised: true });
      L.ops.push({ op: 'text', x: cx + 3, y: y + 1, font: RV, scale: 1, color: C.bright, s: t.text });
      cx += w;
      continue;
    }
    const w = textWidth(RV, t.text);
    const link = !!t.href;
    L.ops.push({ op: 'text', x: cx, y, font: RV, scale: 1, color: link ? C.bright : color, s: t.text });
    if (link) {
      for (let i = 0; i < w; i += 2) L.ops.push({ op: 'rect', x: cx + i, y: y + 9, w: 1, h: 1, color: C.sel });
      L.hits.push({ x: cx, y, w, h: LINE, href: t.href });
    }
    cx += w;
  }
}

const ICON_CHECK = [0b00000, 0b00001, 0b00010, 0b10100, 0b01000];
const ICON_ARROW = [0b10000, 0b11000, 0b11100, 0b11000, 0b10000];

// Lays out the blocks for a width. `progress(action)` gives 'done', 'next' or 'none' for the tutorial table.
// Returns { ops, hits, height }.
export function layout(blocks, width, progress = () => 'none') {
  const L = { ops: [], hits: [] };
  let y = 0;
  for (const b of blocks) {
    if (b.type === 'h1') {
      L.ops.push({ op: 'text', x: 0, y, font: RV, scale: 2, color: C.bright, s: b.text });
      L.ops.push({ op: 'rect', x: 0, y: y + 21, w: width, h: 1, color: C.lo });
      L.ops.push({ op: 'rect', x: 0, y: y + 22, w: width, h: 1, color: C.hi });
      y += 31;
    } else if (b.type === 'h2') {
      y += 12;
      L.ops.push({ op: 'text', x: 0, y, font: RV, scale: 1, color: C.bright, s: b.text });
      const x = textWidth(RV, b.text) + 6;
      L.ops.push({ op: 'dither', x, y: y + 4, w: Math.max(0, width - x), h: 4, a: C.lo, b: C.inset });
      y += 14;
    } else if (b.type === 'p') {
      for (const line of fill(tokens(b.text), width)) { emitLine(L, line, 0, y, C.text); y += LINE; }
      y += 7;
    } else if (b.type === 'ul') {
      for (const item of b.items) {
        fill(tokens(item), width - 12).forEach((line, i) => {
          if (i === 0) L.ops.push({ op: 'rect', x: 2, y: y + 4, w: 4, h: 4, color: C.sel });
          emitLine(L, line, 12, y, C.text);
          y += LINE;
        });
        y += 2;
      }
      y += 5;
    } else if (b.type === 'quote') {
      const top = y;
      for (const line of fill(tokens(b.text), width - 10)) { emitLine(L, line, 10, y, C.text); y += LINE; }
      L.ops.push({ op: 'rect', x: 0, y: top, w: 2, h: y - top, color: C.sel });
      y += 8;
    } else if (b.type === 'hr') {
      y += 8;
      L.ops.push({ op: 'rect', x: 0, y, w: width, h: 1, color: C.lo });
      L.ops.push({ op: 'rect', x: 0, y: y + 1, w: width, h: 1, color: C.hi });
      y += 10;
    } else if (b.type === 'code') {
      const h = b.lines.length * CODE_LINE + 8;
      L.ops.push({ op: 'rect', x: 0, y, w: width, h, color: C.cb });
      b.lines.forEach((s, i) => L.ops.push({ op: 'text', x: 6, y: y + 4 + i * CODE_LINE, font: VGA, scale: 1, color: C.ct, s }));
      y += h + 8;
    } else if (b.type === 'actions') {
      y = layoutActions(L, width, y, progress);
    }
  }
  return { ops: L.ops, hits: L.hits, height: y };
}

// The tutorial's table: a mark column, the action, the mouse way and the keyboard way.
function layoutActions(L, width, y0, progress) {
  const mark = 14;
  const todo = Math.max(...TUTORIAL_ACTIONS.map((a) => textWidth(RV, a.todo))) + 10;
  const mouse = Math.floor((width - mark - todo) * 0.45);
  const keys = width - mark - todo - mouse;
  const at = { todo: mark, mouse: mark + todo, keys: mark + todo + mouse };
  let y = y0;
  L.ops.push({ op: 'rect', x: 0, y, w: width, h: 13, color: C.win });
  L.ops.push({ op: 'text', x: at.todo + 3, y: y + 3, font: RV, scale: 1, color: C.bright, s: 'To do' });
  L.ops.push({ op: 'text', x: at.mouse + 3, y: y + 3, font: RV, scale: 1, color: C.bright, s: 'Mouse' });
  L.ops.push({ op: 'text', x: at.keys + 3, y: y + 3, font: RV, scale: 1, color: C.bright, s: 'Keyboard' });
  y += 14;
  for (const action of TUTORIAL_ACTIONS) {
    const state = progress(action);
    const cols = [
      fill(tokens(action.todo), todo - 6),
      fill(tokens(action.mouse), mouse - 6),
      fill(tokens(action.keys), keys - 6),
    ];
    const h = Math.max(...cols.map((c) => c.length)) * LINE + 6;
    const color = state === 'next' ? C.bright : C.text;
    if (state === 'next') L.ops.push({ op: 'rect', x: 0, y, w: width, h, color: C.inset });
    if (state === 'done') L.ops.push({ op: 'icon', x: 3, y: y + 3, rows: ICON_CHECK, color: C.sel });
    if (state === 'next') L.ops.push({ op: 'icon', x: 3, y: y + 3, rows: ICON_ARROW, color: C.sel });
    cols[0].forEach((line, i) => emitLine(L, line, at.todo + 3, y + 3 + i * LINE, color));
    cols[1].forEach((line, i) => emitLine(L, line, at.mouse + 3, y + 3 + i * LINE, color));
    cols[2].forEach((line, i) => emitLine(L, line, at.keys + 3, y + 3 + i * LINE, color));
    L.ops.push({ op: 'rect', x: 0, y: y + h - 1, w: width, h: 1, color: C.lo });
    y += h;
  }
  return y + 8;
}
