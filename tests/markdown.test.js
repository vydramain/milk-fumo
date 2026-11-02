// The Markdown parser and its tokens. No browser needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, safeHref, tokens } from '../site/js/markdown.js';

test('headings, paragraphs, lists, rules and the tutorial table are told apart', () => {
  const blocks = parse('# Title\n\nFirst line\ncontinues here.\n\n- one\n- two\n\n---\n\n{{actions}}\n');
  assert.deepEqual(blocks.map((b) => b.type), ['h1', 'p', 'ul', 'hr', 'actions']);
  assert.equal(blocks[1].text, 'First line continues here.');
  assert.deepEqual(blocks[2].items, ['one', 'two']);
});

test('fenced code keeps its lines as they are', () => {
  const [b] = parse('```\n  x = 1\n```\n');
  assert.equal(b.type, 'code');
  assert.deepEqual(b.lines, ['  x = 1']);
});

test('keycaps and links are tokens; an unsafe address leaves the text plain', () => {
  const toks = tokens('Press [Shift] or [site](https://example.com).');
  assert.ok(toks.some((t) => t.kind === 'key' && t.text === 'Shift'));
  assert.ok(toks.some((t) => t.kind === 'word' && t.href === 'https://example.com'));
  const bad = tokens('[x](javascript:alert(1))');
  assert.ok(bad.every((t) => !t.href));
});

test('addresses: http(s) without spaces, relative ones without //, spaces, colons, ampersands or backslashes', () => {
  assert.equal(safeHref('https://example.com/a'), true);
  assert.equal(safeHref('music/track.mp3'), true);
  assert.equal(safeHref('//evil.example'), false);
  assert.equal(safeHref('a b'), false);
  assert.equal(safeHref('a&b'), false);
  assert.equal(safeHref('C:\\x'), false);
});
