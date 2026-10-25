import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLrc } from '../js/lyrics.js';

test('parses timestamps in order', () => {
  const lines = parseLrc('[00:12.50]second\n[00:01.00]first');
  assert.deepEqual(lines.map((l) => [l.t, l.text]), [[1000, 'first'], [12500, 'second']]);
});

test('expands lines with several timestamps', () => {
  const lines = parseLrc('[00:05.00][01:05.00]chorus');
  assert.deepEqual(lines.map((l) => l.t), [5000, 65000]);
});

test('applies [offset:] (positive = lyrics earlier)', () => {
  const lines = parseLrc('[offset:+500]\n[00:10.00]hi');
  assert.equal(lines[0].t, 9500);
});

test('turns note-only lines into a single gap', () => {
  const lines = parseLrc('[00:01.00]a\n[00:02.00]♪\n[00:03.00]\n[00:04.00]b');
  assert.deepEqual(lines.map((l) => l.text), ['a', '', 'b']);
});

test('reads word-level timing', () => {
  const [line] = parseLrc('[00:01.00]<00:01.00>Hel<00:01.40>lo <00:02.00>there');
  assert.equal(line.text, 'Hello there');
  assert.deepEqual(line.words.map((w) => w.t), [1000, 1400, 2000]);
});

test('accepts 1-digit and 3-digit fractions', () => {
  const lines = parseLrc('[00:01.5]a\n[00:02.250]b');
  assert.deepEqual(lines.map((l) => l.t), [1500, 2250]);
});
