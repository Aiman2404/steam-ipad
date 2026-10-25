import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../link/lib/store.js';
import { Auth } from '../link/lib/auth.js';

function fresh() {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'deckos-')), 'link.json'));
  return { store, auth: new Auth(store) };
}

test('first account becomes the owner; setup only runs once', () => {
  const { auth } = fresh();
  assert.equal(auth.needsSetup(), true);
  const owner = auth.setupOwner({ username: 'Aiman', password: 'correct horse' });
  assert.equal(owner.role, 'owner');
  assert.equal(owner.username, 'aiman');
  assert.throws(() => auth.setupOwner({ username: 'x2', password: 'whatever12' }), /already/);
});

test('login issues a session; wrong password is rejected', () => {
  const { auth } = fresh();
  auth.setupOwner({ username: 'aiman', password: 'correct horse' });
  assert.throws(() => auth.login('1.1.1.1', 'aiman', 'nope'), /Wrong/);
  const { token, user } = auth.login('1.1.1.1', 'AIMAN', 'correct horse');
  assert.equal(auth.userForToken(token).id, user.id);
  auth.logout(token);
  assert.equal(auth.userForToken(token), null);
});

test('repeated failures are rate limited per address', () => {
  const { auth } = fresh();
  auth.setupOwner({ username: 'aiman', password: 'correct horse' });
  for (let i = 0; i < 8; i++) assert.throws(() => auth.login('9.9.9.9', 'aiman', 'bad'));
  assert.throws(() => auth.login('9.9.9.9', 'aiman', 'correct horse'), /Too many/);
  assert.ok(auth.login('8.8.8.8', 'aiman', 'correct horse').token);
});

test('members cannot manage accounts; admins can, except the owner', () => {
  const { auth } = fresh();
  const owner = auth.setupOwner({ username: 'aiman', password: 'correct horse' });
  const admin = auth.createUser({ username: 'roz', password: 'password1', role: 'admin' });
  const member = auth.createUser({ username: 'guest', password: 'password1' });
  assert.equal(member.role, 'member');
  assert.throws(() => auth.updateUser(member, admin.id, { role: 'member' }), /Only admins/);
  assert.throws(() => auth.deleteUser(admin, owner.id), /owner/);
  assert.throws(() => auth.updateUser(admin, owner.id, { password: 'hijacked1' }), /Only the owner/);
  auth.updateUser(admin, member.id, { role: 'admin' });
  assert.equal(member.role, 'admin');
  auth.deleteUser(owner, member.id);
  assert.equal(auth.findUser(member.id), null);
});

test('owner can hand ownership to an admin, then be removed by the new owner', () => {
  const { auth } = fresh();
  const owner = auth.setupOwner({ username: 'aiman', password: 'correct horse' });
  const member = auth.createUser({ username: 'roz', password: 'password1' });
  assert.throws(() => auth.transferOwnership(owner, member.id), /admin first/);
  auth.updateUser(owner, member.id, { role: 'admin' });
  auth.transferOwnership(owner, member.id);
  assert.equal(member.role, 'owner');
  assert.equal(owner.role, 'admin');
  auth.deleteUser(member, owner.id);
  assert.equal(auth.users.length, 1);
});

test('resetting a password signs that user out everywhere', () => {
  const { auth } = fresh();
  const owner = auth.setupOwner({ username: 'aiman', password: 'correct horse' });
  const m = auth.createUser({ username: 'guest', password: 'password1' });
  const { token } = auth.login('1.1.1.1', 'guest', 'password1');
  auth.updateUser(owner, m.id, { password: 'newpassword' });
  assert.equal(auth.userForToken(token), null);
});

test('store persists to disk atomically', async () => {
  const { store, auth } = fresh();
  auth.setupOwner({ username: 'aiman', password: 'correct horse' });
  await new Promise((r) => setImmediate(r));
  assert.ok(existsSync(store.file));
  const again = new Store(store.file);
  assert.equal(again.data.users[0].username, 'aiman');
});
