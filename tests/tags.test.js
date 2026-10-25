import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readTags } from '../js/tags.js';

const enc = (s) => new TextEncoder().encode(s);
const cat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const u32 = (n) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const synchsafe = (n) => new Uint8Array([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]);

function id3Frame(id, body) {
  return cat(enc(id), u32(body.length), new Uint8Array(2), body);
}

function utf16(str) {
  const out = [0xff, 0xfe];
  for (const ch of str) out.push(ch.charCodeAt(0) & 255, ch.charCodeAt(0) >> 8);
  return new Uint8Array(out);
}

function file(bytes, name) {
  const blob = new Blob([bytes]);
  blob.name = name;
  return blob;
}

test('reads ID3v2.3 title, UTF-16 artist, album and picture', async () => {
  const pic = new Uint8Array([1, 2, 3, 4]);
  const frames = cat(
    id3Frame('TIT2', cat(new Uint8Array([3]), enc('Sweater Weather'))),
    id3Frame('TPE1', cat(new Uint8Array([1]), utf16('The Neighbourhood'))),
    id3Frame('TALB', cat(new Uint8Array([0]), enc('I Love You.'))),
    id3Frame('APIC', cat(new Uint8Array([0]), enc('image/png'), new Uint8Array([0, 3]), enc('d'), new Uint8Array([0]), pic))
  );
  const bytes = cat(enc('ID3'), new Uint8Array([3, 0, 0]), synchsafe(frames.length), frames, new Uint8Array(64));
  const tags = await readTags(file(bytes, 'whatever.mp3'));
  assert.equal(tags.title, 'Sweater Weather');
  assert.equal(tags.artist, 'The Neighbourhood');
  assert.equal(tags.album, 'I Love You.');
  assert.equal(tags.picture.type, 'image/png');
  assert.deepEqual(new Uint8Array(await tags.picture.arrayBuffer()), pic);
});

// MP4 atom names are raw bytes (the © in '©nam' is the single byte 0xA9).
const latin1 = (s) => new Uint8Array(Array.from(s, (c) => c.charCodeAt(0)));

function atom(type, ...children) {
  const body = cat(...children);
  return cat(u32(body.length + 8), latin1(type), body);
}

test('reads MP4/M4A ilst metadata', async () => {
  const data = (text) => atom('data', u32(1), u32(0), enc(text));
  const ilst = atom('ilst', atom('©nam', data('505')), atom('©ART', data('Arctic Monkeys')), atom('©alb', data('Favourite Worst Nightmare')));
  const meta = atom('meta', u32(0), ilst);
  const bytes = cat(atom('ftyp', enc('M4A '), u32(0)), atom('moov', atom('udta', meta)));
  const tags = await readTags(file(bytes, 'x.m4a'));
  assert.equal(tags.title, '505');
  assert.equal(tags.artist, 'Arctic Monkeys');
  assert.equal(tags.album, 'Favourite Worst Nightmare');
});

test('falls back to "Artist - Title" filenames', async () => {
  const tags = await readTags(file(new Uint8Array(32), '03 - Arctic Monkeys - 505.mp3'));
  assert.equal(tags.artist, 'Arctic Monkeys');
  assert.equal(tags.title, '505');
});
