// Pulls a small palette out of the album cover so the whole deck tints itself
// to the song. Spotify (i.scdn.co) and iTunes artwork both send CORS headers,
// and embedded local artwork is a blob: URL, so the canvas is never tainted.

const FALLBACK = { a: [56, 189, 248], b: [168, 85, 247], c: [236, 72, 153] };
const cache = new Map();

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

// Keep accents readable on a dark glass UI: vivid, mid-bright.
function tune([r, g, b], minL = 0.5, maxL = 0.68) {
  const [h, s, l] = rgbToHsl(r, g, b);
  return hslToRgb(h, Math.max(s, 0.55), Math.min(maxL, Math.max(minL, l)));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function extractPalette(src) {
  if (!src) return FALLBACK;
  if (cache.has(src)) return cache.get(src);
  try {
    const img = await loadImage(src);
    const size = 40;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    // Bucket by hue (12 x 30deg) weighted by saturation, ignoring near-greys.
    const buckets = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const [h, s, l] = rgbToHsl(r, g, b);
      if (s < 0.18 || l < 0.08 || l > 0.94) continue;
      const w = s * (1 - Math.abs(l - 0.5));
      const bucket = buckets[Math.floor(h / 30) % 12];
      bucket.w += w;
      bucket.r += r * w;
      bucket.g += g * w;
      bucket.b += b * w;
    }
    const ranked = buckets
      .filter((x) => x.w > 0)
      .sort((x, y) => y.w - x.w)
      .map((x) => [x.r / x.w, x.g / x.w, x.b / x.w]);

    let palette;
    if (!ranked.length) {
      // Monochrome cover: stay neutral-cool instead of inventing colours.
      palette = { a: [148, 163, 184], b: [100, 116, 139], c: [203, 213, 225] };
    } else {
      const a = tune(ranked[0]);
      const b = tune(ranked[1] || ranked[0], 0.4, 0.6);
      const [h] = rgbToHsl(...a);
      const c = ranked[2] ? tune(ranked[2], 0.45, 0.65) : hslToRgb((h + 40) % 360, 0.65, 0.58);
      palette = { a, b, c };
    }
    cache.set(src, palette);
    return palette;
  } catch (_) {
    return FALLBACK;
  }
}

export function applyPalette(p, root = document.documentElement) {
  root.style.setProperty('--accent', `rgb(${p.a.join(',')})`);
  root.style.setProperty('--accent-rgb', p.a.join(','));
  root.style.setProperty('--accent-2-rgb', p.b.join(','));
  root.style.setProperty('--accent-3-rgb', p.c.join(','));
}
