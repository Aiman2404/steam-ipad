// Laptop apps the deck can open. Admins manage the list in the dashboard;
// members can only launch entries from it, never arbitrary commands.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';

export const DEFAULT_APPS = [
  { name: 'GitHub', target: 'https://github.com/', icon: 'github' },
  { name: 'VS Code', target: 'vscode://', icon: 'code' },
  { name: 'Steam', target: 'steam://open/main', icon: 'steam' },
  { name: 'Discord', target: 'discord://', icon: 'discord' },
  { name: 'Spotify', target: 'spotify:', icon: 'spotify' },
  { name: 'Files', target: process.platform === 'win32' ? 'explorer.exe' : homedir(), icon: 'folder' }
];

const ICONS = ['github', 'code', 'steam', 'discord', 'spotify', 'folder', 'browser', 'game', 'terminal', 'app'];

// Targets are URLs/URI schemes (https://, steam://, spotify:) or a program
// or file path. Reject shell metacharacters outright as a second line of
// defence (we never use a shell, but a path shouldn't need them).
function validTarget(target) {
  const t = String(target || '').trim();
  if (!t || t.length > 400) return null;
  if (/[\r\n"`<>|&^%]/.test(t)) return null;
  return t;
}

export function sanitizeApps(list) {
  if (!Array.isArray(list)) throw new Error('Apps must be a list.');
  if (list.length > 24) throw new Error('At most 24 apps.');
  return list.map((a) => {
    const name = String(a.name || '').trim().slice(0, 30);
    const target = validTarget(a.target);
    if (!name) throw new Error('Every app needs a name.');
    if (!target) throw new Error(`"${name}" has an invalid target.`);
    return {
      id: typeof a.id === 'string' && a.id.length <= 40 ? a.id : randomUUID(),
      name,
      target,
      icon: ICONS.includes(a.icon) ? a.icon : 'app'
    };
  });
}

export function seedApps(store) {
  if (!store.data.apps || !store.data.apps.length) {
    store.data.apps = sanitizeApps(DEFAULT_APPS);
    store.save();
  }
}

// ---- the deck's five hardware dock buttons ----
// Each slot is a laptop app ({ kind: 'laptop', appId }) or a deck view
// ({ kind: 'view', view }). Until an admin picks, the dock shows the first
// five laptop apps from the dashboard.

export const DECK_VIEWS = {
  lyrics: 'Lyrics',
  library: 'Library',
  queue: 'Up next',
  laptop: 'Laptop screen'
};

export function sanitizeDock(slots, apps) {
  if (!Array.isArray(slots) || slots.length !== 5) throw new Error('The dock has exactly five buttons.');
  return slots.map((s) => {
    if (s && s.kind === 'view' && DECK_VIEWS[s.view]) return { kind: 'view', view: s.view };
    if (s && s.kind === 'laptop' && apps.some((a) => a.id === s.appId)) return { kind: 'laptop', appId: s.appId };
    throw new Error('Each dock button must be a laptop app or a deck view.');
  });
}

export function resolveDock(store) {
  const apps = store.data.apps || [];
  const chosen = Array.isArray(store.data.dock) && store.data.dock.length === 5 ? store.data.dock : null;
  const fallback = [...apps.slice(0, 5).map((a) => ({ kind: 'laptop', appId: a.id }))];
  // Pad with deck views if there are fewer than five apps.
  for (const view of Object.keys(DECK_VIEWS)) if (fallback.length < 5) fallback.push({ kind: 'view', view });
  return (chosen || fallback).map((s, i) => {
    if (s.kind === 'laptop') {
      const app = apps.find((a) => a.id === s.appId);
      // An app that was deleted falls back to the default for that slot.
      if (!app) return resolveSlot(fallback[i], apps);
      return { kind: 'laptop', id: app.id, name: app.name, icon: app.icon, sub: 'On the laptop' };
    }
    return resolveSlot(s, apps);
  });
}

function resolveSlot(s, apps) {
  if (s.kind === 'laptop') {
    const app = apps.find((a) => a.id === s.appId);
    if (app) return { kind: 'laptop', id: app.id, name: app.name, icon: app.icon, sub: 'On the laptop' };
    return { kind: 'view', view: 'laptop', name: DECK_VIEWS.laptop, icon: 'laptop', sub: 'Deck view' };
  }
  return { kind: 'view', view: s.view, name: DECK_VIEWS[s.view], icon: s.view, sub: 'Deck view' };
}

// Opens the target with the OS's default handler, without a shell.
export function launch(target) {
  let cmd;
  let args;
  if (process.platform === 'win32') {
    // explorer.exe hands URLs and URI schemes to their registered app and
    // starts programs/files directly.
    cmd = 'explorer.exe';
    args = [target];
  } else if (process.platform === 'darwin') {
    cmd = 'open';
    args = [target];
  } else {
    cmd = 'xdg-open';
    args = [target];
  }
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: false });
  child.on('error', () => {});
  child.unref();
}
