// Reads title / artist / album / embedded artwork from uploaded audio files.
// Supports ID3v2.2-2.4 (mp3) and iTunes-style MP4 atoms (m4a/aac/alac).

const latin1 = new TextDecoder('latin1');
const utf8 = new TextDecoder('utf-8');

async function readBytes(blob, start, length) {
  return new Uint8Array(await blob.slice(start, start + length).arrayBuffer());
}

const u32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const synchsafe = (b, o) => (b[o] << 21) | (b[o + 1] << 14) | (b[o + 2] << 7) | b[o + 3];
const ascii = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));

function decodeUtf16(bytes, bigEndian) {
  let out = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    out += String.fromCharCode(bigEndian ? (bytes[i] << 8) | bytes[i + 1] : bytes[i] | (bytes[i + 1] << 8));
  }
  return out;
}

function decodeText(encoding, bytes) {
  let text;
  if (encoding === 0) text = latin1.decode(bytes);
  else if (encoding === 3) text = utf8.decode(bytes);
  else if (encoding === 1) {
    const be = bytes[0] === 0xfe && bytes[1] === 0xff;
    const hasBom = be || (bytes[0] === 0xff && bytes[1] === 0xfe);
    text = decodeUtf16(hasBom ? bytes.subarray(2) : bytes, be);
  } else text = decodeUtf16(bytes, true);
  return text.replace(/\u0000+$/g, '').split('\u0000')[0].trim();
}

// Index just past the null terminator for the given text encoding.
function skipTerminated(bytes, start, encoding) {
  const wide = encoding === 1 || encoding === 2;
  for (let i = start; i < bytes.length; i += wide ? 2 : 1) {
    if (bytes[i] === 0 && (!wide || bytes[i + 1] === 0)) return i + (wide ? 2 : 1);
  }
  return bytes.length;
}

async function readId3(file) {
  const head = await readBytes(file, 0, 10);
  if (ascii(head, 0, 3) !== 'ID3') return null;
  const version = head[3];
  const size = synchsafe(head, 6);
  const tag = await readBytes(file, 10, size);
  const out = {};
  const idLen = version === 2 ? 3 : 4;
  const headerLen = version === 2 ? 6 : 10;
  let pos = 0;
  if (head[5] & 0x40 && version >= 3) pos += version === 4 ? synchsafe(tag, 0) : u32(tag, 0) + 4;

  while (pos + headerLen < tag.length) {
    const id = ascii(tag, pos, idLen);
    if (!/^[A-Z0-9]+$/.test(id)) break;
    const frameSize = version === 2
      ? (tag[pos + 3] << 16) | (tag[pos + 4] << 8) | tag[pos + 5]
      : version === 4 ? synchsafe(tag, pos + 4) : u32(tag, pos + 4);
    const body = tag.subarray(pos + headerLen, pos + headerLen + frameSize);
    pos += headerLen + frameSize;
    if (!frameSize) continue;

    if (id === 'TIT2' || id === 'TT2') out.title = decodeText(body[0], body.subarray(1));
    else if (id === 'TPE1' || id === 'TP1') out.artist = decodeText(body[0], body.subarray(1));
    else if (id === 'TALB' || id === 'TAL') out.album = decodeText(body[0], body.subarray(1));
    else if ((id === 'APIC' || id === 'PIC') && !out.picture) {
      const enc = body[0];
      let i;
      let mime;
      if (id === 'PIC') {
        mime = ascii(body, 1, 3).toLowerCase() === 'png' ? 'image/png' : 'image/jpeg';
        i = 4;
      } else {
        const mimeEnd = body.indexOf(0, 1);
        mime = latin1.decode(body.subarray(1, mimeEnd)) || 'image/jpeg';
        if (!mime.includes('/')) mime = `image/${mime.toLowerCase()}`;
        i = mimeEnd + 1;
      }
      i += 1; // picture type
      i = skipTerminated(body, i, enc); // description
      out.picture = new Blob([body.slice(i)], { type: mime });
    }
  }
  return out;
}

// ---- MP4 / M4A ----

async function findAtom(file, start, end, name) {
  let pos = start;
  while (pos + 8 <= end) {
    const h = await readBytes(file, pos, 16);
    let size = u32(h, 0);
    const type = ascii(h, 4, 4);
    let headerSize = 8;
    if (size === 1) {
      size = u32(h, 8) * 2 ** 32 + u32(h, 12);
      headerSize = 16;
    } else if (size === 0) size = end - pos;
    if (size < 8) return null;
    if (type === name) return { start: pos, size, body: pos + headerSize };
    pos += size;
  }
  return null;
}

async function readMp4(file) {
  const head = await readBytes(file, 4, 4);
  if (ascii(head, 0, 4) !== 'ftyp') return null;
  const moov = await findAtom(file, 0, file.size, 'moov');
  if (!moov) return null;
  const udta = await findAtom(file, moov.body, moov.start + moov.size, 'udta');
  if (!udta) return null;
  const meta = await findAtom(file, udta.body, udta.start + udta.size, 'meta');
  if (!meta) return null;
  const ilst = await findAtom(file, meta.body + 4, meta.start + meta.size, 'ilst');
  if (!ilst) return null;

  const bytes = await readBytes(file, ilst.body, ilst.size - (ilst.body - ilst.start));
  const out = {};
  let pos = 0;
  while (pos + 8 <= bytes.length) {
    const size = u32(bytes, pos);
    if (size < 8) break;
    const key = latin1.decode(bytes.subarray(pos + 4, pos + 8));
    const dataSize = u32(bytes, pos + 8);
    if (latin1.decode(bytes.subarray(pos + 12, pos + 16)) === 'data') {
      const type = u32(bytes, pos + 16) & 0xffffff;
      const payload = bytes.subarray(pos + 24, pos + 8 + dataSize);
      if (key === '©nam') out.title = utf8.decode(payload);
      else if (key === '©ART') out.artist = utf8.decode(payload);
      else if (key === '©alb') out.album = utf8.decode(payload);
      else if (key === 'covr' && !out.picture) {
        out.picture = new Blob([payload.slice()], { type: type === 14 ? 'image/png' : 'image/jpeg' });
      }
    }
    pos += size;
  }
  return out;
}

function fromFilename(name) {
  const base = name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ').replace(/^\d{1,3}[\s.-]+/, '').trim();
  const parts = base.split(' - ');
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  return { title: base, artist: '' };
}

export async function readTags(file) {
  let tags = null;
  try {
    tags = (await readId3(file)) || (await readMp4(file));
  } catch (_) {
    tags = null;
  }
  const guess = fromFilename(file.name);
  return {
    title: (tags && tags.title) || guess.title,
    artist: (tags && tags.artist) || guess.artist,
    album: (tags && tags.album) || '',
    picture: (tags && tags.picture) || null
  };
}

export function readDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const probe = new Audio();
    const done = (ms) => {
      URL.revokeObjectURL(url);
      probe.removeAttribute('src');
      resolve(ms);
    };
    const timer = setTimeout(() => done(0), 5000);
    probe.preload = 'metadata';
    probe.addEventListener('loadedmetadata', () => {
      clearTimeout(timer);
      done(isFinite(probe.duration) ? Math.round(probe.duration * 1000) : 0);
    });
    probe.addEventListener('error', () => {
      clearTimeout(timer);
      done(0);
    });
    probe.src = url;
  });
}
