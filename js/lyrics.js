// Lyrics lookup (LRCLIB) + LRC parsing.
// Matching uses the exact duration of the playing track so we get the timing
// for *that* recording, not a random live/remaster version with other timestamps.

import { idb } from './idb.js';

const LRCLIB = 'https://lrclib.net/api';
const CACHE_VERSION = 3;

function stripDecorations(title) {
  return title
    .replace(/\s*[-–]\s*(\d{4}\s+)?(remaster(ed)?|live|mono|stereo|single|radio edit|edit|version|deluxe|bonus).*$/i, '')
    .replace(/\s*[([](feat\.?|ft\.?|with|from)[^)\]]*[)\]]/gi, '')
    .replace(/\s*[([][^)\]]*(remaster|version|edit|live|mix)[^)\]]*[)\]]/gi, '')
    .trim();
}

const firstArtist = (artist) => (artist || '').split(/,|&| feat\.? | ft\.? | x /i)[0].trim();

const toMs = (m, s, frac) => (parseInt(m, 10) * 60 + parseInt(s, 10)) * 1000 + (frac ? parseInt(frac.padEnd(3, '0').slice(0, 3), 10) : 0);

// Returns [{ t, text, words? }] sorted by time. Handles multi-stamp lines,
// [offset:] tags and enhanced LRC word stamps <mm:ss.xx>.
export function parseLrc(lrc) {
  const lines = [];
  let offset = 0;
  const stampRe = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  const wordRe = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;

  for (const raw of lrc.split(/\r?\n/)) {
    const off = raw.match(/^\[offset:\s*([+-]?\d+)\s*\]/i);
    if (off) {
      offset = parseInt(off[1], 10);
      continue;
    }
    const stamps = [];
    let m;
    stampRe.lastIndex = 0;
    while ((m = stampRe.exec(raw))) stamps.push(toMs(m[1], m[2], m[3]));
    if (!stamps.length) continue;

    const body = raw.replace(stampRe, '');
    let words = null;
    if (wordRe.test(body)) {
      words = [];
      wordRe.lastIndex = 0;
      const parts = body.split(wordRe);
      if (parts[0].trim()) words.push({ t: stamps[0] - offset, text: parts[0] });
      // split() with 3 capture groups yields: text, m, s, frac, text, m, s, frac, text...
      for (let i = 1; i < parts.length; i += 4) {
        const text = parts[i + 3] || '';
        if (text.trim()) words.push({ t: toMs(parts[i], parts[i + 1], parts[i + 2]) - offset, text });
      }
    }
    let text = body.replace(wordRe, '').replace(/\s+/g, ' ').trim();
    // LRCLIB marks instrumental breaks with a lone note; render those as a gap.
    if (/^[♪♫♬♩\s.…-]*$/.test(text)) text = '';
    for (const t of stamps) lines.push({ t: Math.max(0, t - offset), text, words });
  }
  lines.sort((a, b) => a.t - b.t);
  // Collapse consecutive empty lines into one instrumental gap.
  return lines.filter((l, i) => l.text || (i > 0 && lines[i - 1].text));
}

function toResult(record, durationMs) {
  if (!record) return null;
  if (record.instrumental) return { kind: 'instrumental', lines: [] };
  if (record.syncedLyrics) {
    const lines = parseLrc(record.syncedLyrics);
    if (lines.length) return { kind: 'synced', lines, matchedDurationMs: (record.duration || 0) * 1000 || durationMs };
  }
  if (record.plainLyrics) {
    return { kind: 'plain', lines: record.plainLyrics.split(/\r?\n/).map((text) => ({ t: -1, text: text.trim() })) };
  }
  return null;
}

async function getJson(url) {
  const res = await fetch(url).catch(() => {
    throw Object.assign(new Error('offline'), { network: true });
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`LRCLIB ${res.status}`);
  return res.json();
}

async function lookup({ title, artist, album, durationMs }) {
  const seconds = Math.round((durationMs || 0) / 1000);
  const artistName = firstArtist(artist);
  const titles = Array.from(new Set([title, stripDecorations(title)])).filter(Boolean);
  let plainFallback = null;
  let failures = 0;
  let requests = 0;
  const safeGet = (url) => {
    requests += 1;
    return getJson(url).catch((e) => {
      if (e.network) failures += 1;
      return null;
    });
  };

  // 1. Exact signature match (LRCLIB accepts ±2s on duration).
  if (seconds) {
    for (const t of titles) {
      for (const withAlbum of album ? [true, false] : [false]) {
        const q = new URLSearchParams({ track_name: t, artist_name: artistName, duration: seconds });
        if (withAlbum) q.set('album_name', album);
        const rec = await safeGet(`${LRCLIB}/get?${q}`);
        const result = toResult(rec, durationMs);
        if (result && result.kind !== 'plain') return result;
        if (result && !plainFallback) plainFallback = result;
      }
    }
  }

  // 2. Search and pick the synced result whose length is closest to ours.
  for (const t of titles) {
    const q = new URLSearchParams({ track_name: t });
    if (artistName) q.set('artist_name', artistName);
    const results = (await safeGet(`${LRCLIB}/search?${q}`)) || [];
    if (!results.length) continue;
    const score = (r) => (seconds ? Math.abs((r.duration || 0) - seconds) : 0);
    const synced = results.filter((r) => r.syncedLyrics).sort((a, b) => score(a) - score(b));
    // A version more than 8s off has different timing; only use it as plain text.
    if (synced.length && (!seconds || score(synced[0]) <= 8)) return toResult(synced[0], durationMs);
    const any = synced[0] || results.find((r) => r.plainLyrics) || results.find((r) => r.instrumental);
    if (any) {
      if (any.instrumental) return { kind: 'instrumental', lines: [] };
      return {
        kind: 'plain',
        lines: (any.plainLyrics || '').split(/\r?\n/).map((text) => ({ t: -1, text: text.trim() }))
      };
    }
  }
  if (plainFallback) return plainFallback;
  // Every request failed at the network level: report it so we retry later.
  if (requests && failures === requests) throw new Error('Lyrics service unreachable');
  return { kind: 'none', lines: [] };
}

const memo = new Map();

export async function getLyrics(track) {
  const key = `lyrics:${CACHE_VERSION}:${track.artist}|${track.title}|${Math.round((track.durationMs || 0) / 2000)}`.toLowerCase();
  if (memo.has(key)) return memo.get(key);

  const cached = await idb.getKV(key).catch(() => null);
  if (cached) {
    memo.set(key, cached);
    return cached;
  }

  const result = await lookup(track);
  memo.set(key, result);
  // Don't persist misses forever; LRCLIB gets new submissions constantly.
  if (result.kind !== 'none') idb.setKV(key, result).catch(() => {});
  return result;
}
