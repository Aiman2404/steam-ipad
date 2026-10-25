// Talks to DeckOS Link when the deck is served by the laptop companion.
// On GitHub Pages the info request 404s and the deck runs standalone.

let info = null;

export async function detectLink() {
  // GitHub Pages can never be the laptop; skip the probe and its 404.
  if (/\.github\.io$/.test(location.hostname) || location.protocol === 'file:') return null;
  try {
    const res = await fetch('./api/link/info', { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    info = json && json.link ? json : null;
  } catch (_) {
    info = null;
  }
  return info;
}

export const linkInfo = () => info;
export const inLink = () => !!info;
export const linkUser = () => (info && info.user) || null;
export const linkIsAdmin = () => {
  const u = linkUser();
  return !!u && (u.role === 'owner' || u.role === 'admin');
};

export async function linkApi(path, { method = 'GET', body } = {}) {
  const res = await fetch(`.${path}`, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-DeckOS': '1' },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || `Laptop error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

export async function linkLogin(username, password) {
  await linkApi('/api/login', { method: 'POST', body: { username, password } });
  return detectLink();
}

export async function linkLogout() {
  await linkApi('/api/logout', { method: 'POST' }).catch(() => {});
  return detectLink();
}
