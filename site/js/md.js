// Markdown subset of the site notes (owner decision 5). Pure: string in, structure out, no DOM.

// Block prefixes; the trailing space is part of the marker, so "###" is not a heading.
const H1_PREFIX = '# ';
const H2_PREFIX = '## ';
const LIST_PREFIX = '- ';
const QUOTE_PREFIX = '> ';
// A quote line that is only this text has no text of its own and still continues the quote.
const QUOTE_EMPTY = '>';
// A line of exactly this text opens and closes a code block; lines between are kept as they are.
const CODE_FENCE = '```';
// A line of exactly one of these texts is a horizontal rule.
const RULE_LINES = ['---', '***'];

// Inline markers.
// A key is the text between one backtick on each side; it is drawn as a keycap.
const KEY_MARK = '`';
// A spoiler is the text between two pairs of vertical bars; it is hidden until clicked.
const SPOILER_MARK = '||';
// A link is a label in square brackets right before an address in round brackets. The label ends at the
// first ']' and may not contain '['; the address ends at the first ')', so ')' inside an address is not supported.
const LINK_OPEN = '[';
const LINK_LABEL_END = ']';
const LINK_HREF_START = '(';
const LINK_END = ')';
// Relative address: no spaces, C0 controls (U+0000-U+001F), colon, backslash or '&'; a '//' start is another host.
// Backslash is allowed only in an absolute https address, where it is path. Set href as a DOM property, not HTML text.
const HREF_RE = /^(https?:\/\/\S+|(?!\/\/)[^\x00-\x1f\s:\\&]+)$/;

const isQuoteLine = line => line === QUOTE_EMPTY || line.startsWith(QUOTE_PREFIX);

// Block starts in order of precedence; a line matching none of them starts a paragraph.
const BLOCK_STARTS = [
  { test: line => line === CODE_FENCE, read: readCode },
  { test: line => line.startsWith(H2_PREFIX), read: (lines, start) => readHeading(lines, start, 'h2', H2_PREFIX) },
  { test: line => line.startsWith(H1_PREFIX), read: (lines, start) => readHeading(lines, start, 'h1', H1_PREFIX) },
  { test: line => RULE_LINES.includes(line), read: (lines, start) => ({ block: { type: 'rule' }, next: start + 1 }) },
  { test: line => line.startsWith(LIST_PREFIX), read: readList },
  { test: isQuoteLine, read: readQuote },
];

// Returns the index of the first line from start that fails the test.
function collect(lines, start, test) {
  let end = start;
  while (end < lines.length && test(lines[end])) end++;
  return end;
}

// Each reader takes the lines and the index of its first line; it returns { block, next }.
function readHeading(lines, start, type, prefix) {
  return { block: { type, inlines: parseInlines(lines[start].slice(prefix.length).trim()) }, next: start + 1 };
}

// The code runs to the closing fence; an unclosed fence runs to the end of the text.
function readCode(lines, start) {
  const end = collect(lines, start + 1, line => line !== CODE_FENCE);
  return { block: { type: 'code', lines: lines.slice(start + 1, end) }, next: end + 1 };
}

function readList(lines, start) {
  const end = collect(lines, start, line => line.startsWith(LIST_PREFIX));
  // An empty item ("- ") has no text and gives an empty inline list.
  const items = lines.slice(start, end).map(line => parseInlines(line.slice(LIST_PREFIX.length).trim()));
  return { block: { type: 'list', items }, next: end };
}

// Empty quote lines are dropped, so they do not leave a double space.
function readQuote(lines, start) {
  const end = collect(lines, start, isQuoteLine);
  const text = lines.slice(start, end).map(line => line.slice(QUOTE_PREFIX.length).trim()).filter(Boolean).join(' ');
  return { block: { type: 'quote', inlines: parseInlines(text) }, next: end };
}

// A paragraph runs until a blank line or the start of another block.
function readParagraph(lines, start) {
  const end = collect(lines, start, line => line.trim() !== '' && !BLOCK_STARTS.some(entry => entry.test(line)));
  const text = lines.slice(start, end).map(line => line.trim()).join(' ');
  return { block: { type: 'paragraph', inlines: parseInlines(text) }, next: end };
}

// Shared input check; the message names null, since typeof null is "object".
function assertString(text, caller) {
  if (typeof text === 'string') return;
  throw new TypeError(`${caller}: text must be a string, got ${text === null ? 'null' : typeof text}`);
}

// Splits text into blocks; blank lines separate blocks and produce nothing.
export function parseMarkdown(text) {
  assertString(text, 'parseMarkdown');
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    if (lines[index].trim() === '') { index++; continue; }
    const entry = BLOCK_STARTS.find(candidate => candidate.test(lines[index]));
    const { block, next } = entry ? entry.read(lines, index) : readParagraph(lines, index);
    blocks.push(block);
    index = next;
  }
  return blocks;
}

// Key and spoiler: text between two marks is its value. An empty pair ("``") is plain text and consumes both marks.
function matchPair(text, index, mark, type) {
  if (!text.startsWith(mark, index)) return null;
  const from = index + mark.length;
  const close = text.indexOf(mark, from);
  if (close === -1) return null;
  if (close === from) return { node: { type: 'text', value: mark + mark }, end: close + mark.length };
  return { node: { type, value: text.slice(from, close) }, end: close + mark.length };
}

// A link whose label or address is refused is not a link: its brackets stay as plain text.
function matchLink(text, index) {
  if (!text.startsWith(LINK_OPEN, index)) return null;
  const from = index + LINK_OPEN.length;
  const labelEnd = text.indexOf(LINK_LABEL_END, from);
  if (labelEnd <= from || !text.startsWith(LINK_HREF_START, labelEnd + LINK_LABEL_END.length)) return null;
  const value = text.slice(from, labelEnd);
  if (value.includes(LINK_OPEN)) return null;
  const hrefStart = labelEnd + LINK_LABEL_END.length + LINK_HREF_START.length;
  const close = text.indexOf(LINK_END, hrefStart);
  if (close === -1) return null;
  const href = text.slice(hrefStart, close);
  if (!HREF_RE.test(href)) return null;
  return { node: { type: 'link', value, href }, end: close + LINK_END.length };
}

// Key or spoiler first, then link; each matcher returns null when it does not match.
function matchInline(text, index) {
  return matchPair(text, index, KEY_MARK, 'key') ?? matchPair(text, index, SPOILER_MARK, 'spoiler') ?? matchLink(text, index);
}

// Splits a line of text into inlines in order of appearance; unmatched markers stay as plain text.
export function parseInlines(text) {
  assertString(text, 'parseInlines');
  const nodes = [];
  let plain = '';
  const flush = () => { if (plain) nodes.push({ type: 'text', value: plain }); plain = ''; };
  let index = 0;
  while (index < text.length) {
    const found = matchInline(text, index);
    if (!found) { plain += text[index++]; continue; }
    flush();
    nodes.push(found.node);
    index = found.end;
  }
  flush();
  return nodes;
}
