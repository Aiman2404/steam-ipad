// Accounts, roles and sessions for DeckOS Link.
//
// Roles:
//   owner  - the first account. An admin that can't be removed or demoted by
//            anyone else; can hand ownership to another admin.
//   admin  - controls everything: users, laptop apps, Spotify link, and
//            remote mouse/keyboard on the laptop.
//   member - uses the deck: music, lyrics, launching the approved laptop
//            apps and watching the laptop screen.

import { scryptSync, randomBytes, timingSafeEqual, createHash, randomUUID } from 'node:crypto';

const SESSION_DAYS = 90;
const USERNAME_RE = /^[a-z0-9_.-]{3,32}$/;

export const ROLES = ['owner', 'admin', 'member'];
export const isAdmin = (user) => !!user && (user.role === 'owner' || user.role === 'admin');

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  const [kind, saltB64, hashB64] = String(stored || '').split('$');
  if (kind !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(actual, expected);
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

function checkPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new AuthError(400, 'Password must be at least 8 characters.');
  }
  if (password.length > 200) throw new AuthError(400, 'Password is too long.');
}

function normalizeUsername(username) {
  const u = String(username || '').trim().toLowerCase();
  if (!USERNAME_RE.test(u)) {
    throw new AuthError(400, 'Username must be 3-32 characters: letters, numbers, dot, dash or underscore.');
  }
  return u;
}

export const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  role: u.role,
  createdAt: u.createdAt,
  lastSeen: u.lastSeen || null
});

export class Auth {
  constructor(store) {
    this.store = store;
    this.failures = new Map(); // ip -> { count, until }
  }

  get users() {
    return this.store.data.users;
  }

  needsSetup() {
    return this.users.length === 0;
  }

  findUser(id) {
    return this.users.find((u) => u.id === id) || null;
  }

  // ---------- users ----------

  createUser({ username, password, displayName, role = 'member' }) {
    const name = normalizeUsername(username);
    checkPassword(password);
    if (!ROLES.includes(role)) throw new AuthError(400, 'Unknown role.');
    if (role === 'owner' && this.users.some((u) => u.role === 'owner')) {
      throw new AuthError(400, 'There is already an owner.');
    }
    if (this.users.some((u) => u.username === name)) throw new AuthError(409, 'That username is taken.');
    const user = {
      id: randomUUID(),
      username: name,
      displayName: String(displayName || name).trim().slice(0, 40) || name,
      role,
      passwordHash: hashPassword(password),
      createdAt: Date.now()
    };
    this.users.push(user);
    this.store.save();
    return user;
  }

  setupOwner(fields) {
    if (!this.needsSetup()) throw new AuthError(409, 'Setup is already done.');
    return this.createUser({ ...fields, role: 'owner' });
  }

  // Admin-only management. `actor` is the signed-in user doing it.
  updateUser(actor, id, changes) {
    if (!isAdmin(actor)) throw new AuthError(403, 'Only admins can manage accounts.');
    const target = this.findUser(id);
    if (!target) throw new AuthError(404, 'No such account.');
    const self = target.id === actor.id;

    if (target.role === 'owner' && !self) throw new AuthError(403, "Only the owner can change the owner's account.");

    if (changes.role !== undefined) {
      if (!['admin', 'member'].includes(changes.role)) throw new AuthError(400, 'Role must be admin or member.');
      if (target.role === 'owner') throw new AuthError(400, 'Hand ownership to another admin first.');
      if (self && changes.role === 'member') throw new AuthError(400, "You can't demote yourself.");
      target.role = changes.role;
    }
    if (changes.displayName !== undefined) {
      target.displayName = String(changes.displayName).trim().slice(0, 40) || target.username;
    }
    if (changes.password !== undefined) {
      checkPassword(changes.password);
      target.passwordHash = hashPassword(changes.password);
      // Changing someone's password signs them out everywhere.
      this.store.data.sessions = this.store.data.sessions.filter((s) => s.userId !== target.id);
    }
    this.store.save();
    return target;
  }

  deleteUser(actor, id) {
    if (!isAdmin(actor)) throw new AuthError(403, 'Only admins can remove accounts.');
    const target = this.findUser(id);
    if (!target) throw new AuthError(404, 'No such account.');
    if (target.role === 'owner') throw new AuthError(400, 'The owner account can only be removed after handing ownership to another admin.');
    if (target.id === actor.id) throw new AuthError(400, "You can't remove your own account.");
    this.store.data.users = this.users.filter((u) => u.id !== id);
    this.store.data.sessions = this.store.data.sessions.filter((s) => s.userId !== id);
    this.store.save();
  }

  transferOwnership(actor, id) {
    if (!actor || actor.role !== 'owner') throw new AuthError(403, 'Only the owner can hand over ownership.');
    const target = this.findUser(id);
    if (!target || target.id === actor.id) throw new AuthError(400, 'Pick another account.');
    if (target.role !== 'admin') throw new AuthError(400, 'Make them an admin first.');
    target.role = 'owner';
    actor.role = 'admin';
    this.store.save();
  }

  changeOwnPassword(user, current, next) {
    if (!verifyPassword(String(current || ''), user.passwordHash)) throw new AuthError(400, 'Current password is wrong.');
    checkPassword(next);
    user.passwordHash = hashPassword(next);
    this.store.save();
  }

  // ---------- sessions ----------

  login(ip, username, password, userAgent = '') {
    const f = this.failures.get(ip);
    if (f && f.count >= 8 && Date.now() < f.until) {
      throw new AuthError(429, 'Too many attempts. Wait a few minutes and try again.');
    }
    const name = String(username || '').trim().toLowerCase();
    const user = this.users.find((u) => u.username === name);
    // Always run scrypt so response time doesn't reveal which usernames exist.
    const ok = verifyPassword(String(password || ''), user ? user.passwordHash : 'scrypt$AAAA$AAAA');
    if (!user || !ok) {
      const next = { count: (f && Date.now() < f.until ? f.count : 0) + 1, until: Date.now() + 10 * 60 * 1000 };
      this.failures.set(ip, next);
      throw new AuthError(401, 'Wrong username or password.');
    }
    this.failures.delete(ip);
    const token = randomBytes(32).toString('base64url');
    this.store.data.sessions.push({
      idHash: sha256(token),
      userId: user.id,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_DAYS * 864e5,
      userAgent: String(userAgent).slice(0, 160)
    });
    user.lastSeen = Date.now();
    this.pruneSessions();
    this.store.save();
    return { token, user, maxAge: SESSION_DAYS * 86400 };
  }

  userForToken(token) {
    if (!token) return null;
    const hash = sha256(token);
    const session = this.store.data.sessions.find((s) => s.idHash === hash);
    if (!session || session.expiresAt < Date.now()) return null;
    const user = this.findUser(session.userId);
    if (user && (!user.lastSeen || Date.now() - user.lastSeen > 60_000)) {
      user.lastSeen = Date.now();
      this.store.save();
    }
    return user;
  }

  logout(token) {
    if (!token) return;
    const hash = sha256(token);
    this.store.data.sessions = this.store.data.sessions.filter((s) => s.idHash !== hash);
    this.store.save();
  }

  pruneSessions() {
    const now = Date.now();
    this.store.data.sessions = this.store.data.sessions.filter((s) => s.expiresAt > now);
  }
}
