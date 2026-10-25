// DeckOS Link dashboard.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (v) =>
  String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let info = null;
let me = null;
const isAdmin = () => me && (me.role === 'owner' || me.role === 'admin');
const onLaptop = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-DeckOS': '1' },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin'
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

let toastTimer;
function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('bad', bad);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

const initials = (u) => (u.displayName || u.username).trim().slice(0, 1).toUpperCase();
const roleBadge = (role) => `<span class="role ${role}">${role}</span>`;
function ago(ts) {
  if (!ts) return 'never';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

// ------------------------------------------------------------------ gate

function showGate() {
  $('#app').hidden = true;
  $('#gate').hidden = false;
  const setup = info.needsSetup;
  $('#gateSub').textContent = setup ? 'Create the owner account' : 'Sign in to your deck';
  $('#displayField').hidden = !setup;
  $('#gateBtn').textContent = setup ? 'Create owner & sign in' : 'Sign in';
  $('#gateForm').password.autocomplete = setup ? 'new-password' : 'current-password';
  $('#gateFine').textContent = setup
    ? 'The owner is an admin nobody else can remove. You can add family and friends afterwards.'
    : 'Ask an admin for an account if you don\'t have one.';
  $('#gateForm').username.focus();
}

$('#gateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = { username: f.username.value, password: f.password.value, displayName: f.displayName.value };
  $('#gateError').textContent = '';
  $('#gateBtn').disabled = true;
  try {
    await api(info.needsSetup ? '/api/setup' : '/api/login', { method: 'POST', body });
    f.password.value = '';
    await boot();
  } catch (err) {
    $('#gateError').textContent = err.message;
  } finally {
    $('#gateBtn').disabled = false;
  }
});

// ----------------------------------------------------------------- shell

const PAGES = [
  { id: 'overview', title: 'Overview', ico: '◎' },
  { id: 'people', title: 'People', ico: '☺', admin: true },
  { id: 'apps', title: 'Laptop apps', ico: '▦', admin: true },
  { id: 'dock', title: 'Dock buttons', ico: '▤', admin: true },
  { id: 'screen', title: 'Screen', ico: '▭', admin: true },
  { id: 'spotify', title: 'Spotify', ico: '♫', admin: true },
  { id: 'account', title: 'My account', ico: '⚙' }
];

function renderShell() {
  $('#gate').hidden = true;
  $('#app').hidden = false;
  $('#meAvatar').textContent = initials(me);
  $('#meName').textContent = me.displayName;
  $('#meRole').className = `role ${me.role}`;
  $('#meRole').textContent = me.role;
  $('#nav').innerHTML = PAGES.filter((p) => !p.admin || isAdmin())
    .map((p) => `<a href="#${p.id}" data-page="${p.id}"><span class="ico">${p.ico}</span>${p.title}</a>`)
    .join('');
}

function route() {
  const hash = location.hash.slice(1);
  // Spotify callback lands on #spotify=linked or #spotify-error=...
  if (hash.startsWith('spotify=')) toast('Spotify linked');
  if (hash.startsWith('spotify-error=')) toast(decodeURIComponent(hash.split('=')[1]), true);
  let id = hash.split(/[=-]/)[0] || 'overview';
  const page = PAGES.find((p) => p.id === id && (!p.admin || isAdmin()));
  if (!page) id = 'overview';
  $$('#nav a').forEach((a) => a.classList.toggle('is-active', a.dataset.page === id));
  $('#pageTitle').textContent = (PAGES.find((p) => p.id === id) || PAGES[0]).title;
  stopPreview();
  ({ overview, people, apps, dock, screen, spotify, account })[id]();
}

window.addEventListener('hashchange', route);

// -------------------------------------------------------------- overview

async function overview() {
  const page = $('#page');
  const deckUrl = (info.urls && info.urls[0]) || `${location.origin}/`;
  page.innerHTML = `
    <div class="card connect">
      <div>
        <h3>Open the deck on your iPad or phone</h3>
        <p class="muted">Same Wi-Fi as this laptop. Open one of these in Safari or Chrome, sign in, then <b>Add to Home Screen</b>.</p>
        <div class="url-list">
          ${(info.urls || []).map((u) => `<div class="url"><span>${esc(u)}</span><button class="btn btn-sm" data-copy="${esc(u)}">Copy</button></div>`).join('') || '<div class="banner">No Wi-Fi address found. Is the laptop connected to a network?</div>'}
        </div>
      </div>
      <div class="qr" id="qr" title="Scan with the iPad camera"></div>
    </div>
    <div class="grid-3">
      <div class="card stat"><div class="label">Signed in as</div><div class="value">${esc(me.displayName)} ${roleBadge(me.role)}</div></div>
      <div class="card stat"><div class="label">Laptop screen</div><div class="value"><span class="dot ${info.features.screen ? 'good' : 'warn'}"></span>${info.features.screen ? 'Ready to share' : 'Unavailable'}</div></div>
      <div class="card stat"><div class="label">Spotify</div><div class="value"><span class="dot ${info.spotify.linked ? 'good' : 'warn'}"></span>${info.spotify.linked ? esc(info.spotify.account || 'Linked') : 'Not linked'}</div></div>
    </div>
    <div class="card">
      <h3>What you can do</h3>
      <p class="muted">${
        isAdmin()
          ? 'As an admin you control everything: people, laptop apps, the screen and remote mouse/keyboard, and the Spotify link.'
          : 'As a member you can use the whole deck: music and lyrics, open the laptop apps an admin set up, watch the laptop screen and use its media keys. Admins handle accounts and remote control.'
      }</p>
    </div>`;
  $$('[data-copy]').forEach((b) =>
    b.addEventListener('click', () => {
      navigator.clipboard.writeText(b.dataset.copy).then(() => toast('Copied'));
    })
  );
  if (window.qrcode) {
    const qr = window.qrcode(0, 'M');
    qr.addData(deckUrl);
    qr.make();
    $('#qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  } else {
    $('#qr').hidden = true;
  }
}

// ---------------------------------------------------------------- people

async function people() {
  const page = $('#page');
  page.innerHTML = '<div class="card"><p class="muted">Loading…</p></div>';
  const { users } = await api('/api/users');
  const isOwner = me.role === 'owner';
  page.innerHTML = `
    <div class="card">
      <h3>Add someone</h3>
      <p class="muted">Members use the deck. Admins can also manage people, apps, the screen and Spotify.</p>
      <form id="addForm" class="form-row" autocomplete="off">
        <label class="field"><span>Name</span><input name="displayName" placeholder="Rozi" /></label>
        <label class="field"><span>Username</span><input name="username" required autocapitalize="off" /></label>
        <label class="field"><span>Password</span><input name="password" type="password" required minlength="8" autocomplete="new-password" /></label>
        <label class="field"><span>Role</span><select name="role"><option value="member">Member</option><option value="admin">Admin</option></select></label>
        <button class="btn btn-primary" style="margin-bottom:14px">Add</button>
      </form>
    </div>
    <div class="card">
      <h3>${users.length} ${users.length === 1 ? 'person' : 'people'}</h3>
      <div class="list" style="margin-top:12px">
        ${users
          .map((u) => {
            const self = u.id === me.id;
            const locked = u.role === 'owner' && !self;
            const actions = [];
            if (!locked && !self && u.role !== 'owner') {
              actions.push(u.role === 'admin'
                ? `<button class="btn btn-sm" data-act="role" data-role="member" data-id="${u.id}">Make member</button>`
                : `<button class="btn btn-sm" data-act="role" data-role="admin" data-id="${u.id}">Make admin</button>`);
            }
            if (isOwner && u.role === 'admin') actions.push(`<button class="btn btn-sm" data-act="owner" data-id="${u.id}">Make owner</button>`);
            if (!locked && !self) actions.push(`<button class="btn btn-sm" data-act="reset" data-id="${u.id}">Reset password</button>`);
            if (!locked && !self && u.role !== 'owner') actions.push(`<button class="btn btn-sm btn-danger" data-act="remove" data-id="${u.id}">Remove</button>`);
            return `<div class="item">
              <div class="avatar">${esc(initials(u))}</div>
              <div class="item-main"><strong>${esc(u.displayName)} ${roleBadge(u.role)} ${self ? '<span class="role">you</span>' : ''}</strong><span>@${esc(u.username)} · last seen ${ago(u.lastSeen)}</span></div>
              <div class="item-actions">${actions.join('')}</div>
            </div>`;
          })
          .join('')}
      </div>
    </div>`;

  $('#addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api('/api/users', {
        method: 'POST',
        body: { displayName: f.displayName.value, username: f.username.value, password: f.password.value, role: f.role.value }
      });
      toast(`Added ${f.displayName.value || f.username.value}`);
      people();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $$('[data-act]').forEach((b) =>
    b.addEventListener('click', async () => {
      const u = users.find((x) => x.id === b.dataset.id);
      try {
        if (b.dataset.act === 'role') {
          await api(`/api/users/${u.id}`, { method: 'PATCH', body: { role: b.dataset.role } });
          toast(`${u.displayName} is now ${b.dataset.role === 'admin' ? 'an admin' : 'a member'}`);
        } else if (b.dataset.act === 'reset') {
          const pw = prompt(`New password for ${u.displayName} (8+ characters):`);
          if (!pw) return;
          await api(`/api/users/${u.id}`, { method: 'PATCH', body: { password: pw } });
          toast('Password reset; they were signed out everywhere');
        } else if (b.dataset.act === 'remove') {
          if (!confirm(`Remove ${u.displayName}? They'll be signed out and can't sign back in.`)) return;
          await api(`/api/users/${u.id}`, { method: 'DELETE' });
          toast(`Removed ${u.displayName}`);
        } else if (b.dataset.act === 'owner') {
          if (!confirm(`Make ${u.displayName} the owner? You'll become a regular admin.`)) return;
          await api(`/api/users/${u.id}/transfer`, { method: 'POST' });
          toast(`${u.displayName} is now the owner`);
          await boot();
          return;
        }
        people();
      } catch (err) {
        toast(err.message, true);
      }
    })
  );
}

// ------------------------------------------------------------------ apps

const ICON_CHOICES = ['app', 'github', 'code', 'steam', 'discord', 'spotify', 'folder', 'browser', 'game', 'terminal'];

async function apps() {
  const page = $('#page');
  const { apps: list } = await api('/api/apps');
  const row = (a) => `
    <div class="app-row" data-id="${esc(a.id || '')}">
      <input name="name" value="${esc(a.name)}" placeholder="Name" />
      <input name="target" class="mono" value="${esc(a.target)}" placeholder="https://… or steam:// or C:\\Path\\App.exe" />
      <select name="icon">${ICON_CHOICES.map((i) => `<option ${i === a.icon ? 'selected' : ''}>${i}</option>`).join('')}</select>
      <button class="btn btn-sm" data-test>Open</button>
      <button class="btn btn-sm btn-danger" data-del>✕</button>
    </div>`;
  page.innerHTML = `
    <div class="card">
      <h3>Apps the deck can open on this laptop</h3>
      <p class="muted">Anyone signed in can launch these from the deck's Laptop tab. Use a web link, an app link like <code class="copy">steam://open/main</code>, or a program path like <code class="copy">C:\\Program Files\\App\\app.exe</code>.</p>
      <div class="list" id="appList">${list.map(row).join('')}</div>
      <div class="inline" style="margin-top:14px;justify-content:space-between">
        <button class="btn" id="addApp">+ Add app</button>
        <button class="btn btn-primary" id="saveApps">Save apps</button>
      </div>
    </div>`;
  const bind = () => {
    $$('#appList [data-del]').forEach((b) => (b.onclick = () => b.closest('.app-row').remove()));
    $$('#appList [data-test]').forEach(
      (b) =>
        (b.onclick = async () => {
          const id = b.closest('.app-row').dataset.id;
          if (!id) return toast('Save first, then test', true);
          try {
            await api(`/api/apps/${id}/launch`, { method: 'POST' });
            toast('Opened on the laptop');
          } catch (err) {
            toast(err.message, true);
          }
        })
    );
  };
  bind();
  $('#addApp').onclick = () => {
    $('#appList').insertAdjacentHTML('beforeend', row({ name: '', target: '', icon: 'app' }));
    bind();
  };
  $('#saveApps').onclick = async () => {
    const payload = $$('#appList .app-row').map((r) => ({
      id: r.dataset.id || undefined,
      name: r.querySelector('[name=name]').value,
      target: r.querySelector('[name=target]').value,
      icon: r.querySelector('[name=icon]').value
    }));
    try {
      await api('/api/apps', { method: 'PUT', body: { apps: payload } });
      toast('Apps saved');
      apps();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

// ------------------------------------------------------------------ dock

async function dock() {
  const page = $('#page');
  const [{ apps: list }, { slots, views }] = await Promise.all([api('/api/apps'), api('/api/dock')]);
  const options = (slot) =>
    `<optgroup label="Open on the laptop">${list
      .map((a) => `<option value="laptop:${esc(a.id)}" ${slot.kind === 'laptop' && slot.id === a.id ? 'selected' : ''}>${esc(a.name)}</option>`)
      .join('')}</optgroup>
     <optgroup label="Show on the deck">${Object.entries(views)
       .map(([k, label]) => `<option value="view:${k}" ${slot.kind === 'view' && slot.view === k ? 'selected' : ''}>${esc(label)}</option>`)
       .join('')}</optgroup>`;
  page.innerHTML = `
    <div class="card">
      <h3>The five buttons at the bottom of the deck</h3>
      <p class="muted">Pick what each hardware button does for everyone signed in to the deck: open a laptop app, or jump to a deck view. Add more apps under <a href="#apps" style="color:var(--accent)">Laptop apps</a>.</p>
      <div class="grid-3" style="grid-template-columns:repeat(5,minmax(0,1fr))" id="dockSlots">
        ${slots.map((s, i) => `<label class="field"><span>Button ${i + 1}</span><select data-slot="${i}">${options(s)}</select></label>`).join('')}
      </div>
      <div class="inline" style="justify-content:flex-end;margin-top:6px">
        <button class="btn btn-primary" id="saveDock">Save dock</button>
      </div>
    </div>`;
  $('#saveDock').onclick = async () => {
    const payload = $$('#dockSlots select').map((sel) => {
      const [kind, value] = sel.value.split(':');
      return kind === 'laptop' ? { kind, appId: value } : { kind, view: value };
    });
    try {
      await api('/api/dock', { method: 'PUT', body: { slots: payload } });
      toast('Dock saved. The deck updates within a minute, or reopen it.');
    } catch (err) {
      toast(err.message, true);
    }
  };
}

// ---------------------------------------------------------------- screen

let previewImg = null;
let previewToken = null;
function stopPreview() {
  previewToken = null;
  previewImg = null;
}

// Pull JPEG frames one at a time; Safari can't show multipart MJPEG in <img>.
async function runPreview(img) {
  const token = {};
  previewToken = token;
  let seq = 0;
  let shown = null;
  while (previewToken === token) {
    try {
      const res = await fetch(`/api/screen/frame?after=${seq}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`status ${res.status}`);
      seq = Number(res.headers.get('X-Frame-Seq')) || seq + 1;
      const url = URL.createObjectURL(await res.blob());
      if (previewToken !== token) {
        URL.revokeObjectURL(url);
        break;
      }
      img.src = url;
      if (shown) URL.revokeObjectURL(shown);
      shown = url;
    } catch (_) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  if (shown) URL.revokeObjectURL(shown);
}

const QUALITY = {
  smooth: { width: 960, quality: 50, fps: 14, label: 'Smooth' },
  balanced: { width: 1280, quality: 55, fps: 10, label: 'Balanced' },
  sharp: { width: 1920, quality: 70, fps: 6, label: 'Sharp' }
};

async function screen() {
  const page = $('#page');
  const s = await api('/api/screen/info');
  if (!s.available) {
    page.innerHTML = `<div class="card"><h3>Screen sharing unavailable</h3><p class="muted">Screen sharing and remote control need DeckOS Link running on Windows. This laptop reports <code class="copy">${esc(s.platform)}</code>.</p></div>`;
    return;
  }
  const current = Object.entries(QUALITY).find(([, q]) => q.width === s.stream.width && q.fps === s.stream.fps);
  page.innerHTML = `
    <div class="card">
      <h3>Live preview</h3>
      <p class="muted">This is what the deck's Laptop tab shows. Members can watch; only admins can tap to control the mouse and keyboard.</p>
      <img class="preview" id="preview" alt="Laptop screen" />
    </div>
    <div class="grid-2">
      <div class="card">
        <h3>Which screen</h3>
        <p class="muted">Pick the monitor to share.</p>
        <div class="segmented" id="screens">
          ${s.screens.map((m, i) => `<button data-i="${i}" class="${i === s.selected ? 'is-active' : ''}">${m.primary ? 'Main' : `Screen ${i + 1}`} · ${m.w}×${m.h}</button>`).join('')}
        </div>
      </div>
      <div class="card">
        <h3>Quality</h3>
        <p class="muted">Smooth for scrolling and games, Sharp for reading code.</p>
        <div class="segmented" id="quality">
          ${Object.entries(QUALITY).map(([k, q]) => `<button data-q="${k}" class="${current && current[0] === k ? 'is-active' : ''}">${q.label}</button>`).join('')}
        </div>
      </div>
    </div>`;
  previewImg = $('#preview');
  runPreview(previewImg);
  $$('#screens [data-i]').forEach((b) =>
    b.addEventListener('click', async () => {
      await api('/api/screen/select', { method: 'POST', body: { index: Number(b.dataset.i) } });
      screen();
    })
  );
  $$('#quality [data-q]').forEach((b) =>
    b.addEventListener('click', async () => {
      await api('/api/screen/quality', { method: 'POST', body: QUALITY[b.dataset.q] });
      $$('#quality button').forEach((x) => x.classList.toggle('is-active', x === b));
      toast(`${QUALITY[b.dataset.q].label} quality`);
    })
  );
}

// --------------------------------------------------------------- spotify

async function spotify() {
  const page = $('#page');
  const s = await api('/api/spotify/status');
  const loginHref = onLaptop ? '/api/spotify/login' : `http://127.0.0.1:${location.port || 80}/dashboard/#spotify`;
  page.innerHTML = `
    <div class="card">
      <h3>${s.linked ? `Linked to ${esc(s.account || 'Spotify')}` : 'Link Spotify for everyone'}</h3>
      <p class="muted">Link your Premium account once here. Everyone signed in to the deck then controls that Spotify, so nobody else needs a developer app.</p>
      ${s.linked
        ? `<div class="inline"><span class="dot good"></span><span>Spotify is linked and shared with the deck.</span><button class="btn btn-danger btn-sm" id="unlink" style="margin-left:auto">Unlink</button></div>`
        : `<ol class="steps">
            <li>Open <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener" style="color:var(--accent)">developer.spotify.com/dashboard</a> and open your DeckOS app (or create one, tick <b>Web API</b>).</li>
            <li>Under <b>Redirect URIs</b> add <code>${esc(s.redirectUri)}</code> and save.</li>
            <li>Paste the app's <b>Client ID</b> below, then press <b>Link Spotify</b>.</li>
          </ol>
          <div class="inline">
            <input id="clientId" class="mono" placeholder="Spotify Client ID" value="${esc(s.clientId || '')}" autocomplete="off" />
            <button class="btn" id="saveClient">Save</button>
            <a class="btn btn-spotify" id="linkBtn" href="${loginHref}">Link Spotify</a>
          </div>
          ${onLaptop ? '' : `<p class="muted" style="margin-top:12px">Spotify only allows linking from the laptop itself. Open <code class="copy">http://127.0.0.1:${esc(location.port)}/dashboard/</code> on the laptop.</p>`}`}
    </div>`;
  const save = $('#saveClient');
  if (save) {
    save.onclick = async () => {
      try {
        await api('/api/spotify/client', { method: 'PUT', body: { clientId: $('#clientId').value } });
        toast('Client ID saved');
      } catch (err) {
        toast(err.message, true);
      }
    };
    $('#linkBtn').addEventListener('click', async (e) => {
      if (!$('#clientId').value.trim()) {
        e.preventDefault();
        toast('Paste the Client ID first', true);
        return;
      }
      if ($('#clientId').value.trim() !== (s.clientId || '')) {
        e.preventDefault();
        try {
          await api('/api/spotify/client', { method: 'PUT', body: { clientId: $('#clientId').value } });
          location.href = $('#linkBtn').href;
        } catch (err) {
          toast(err.message, true);
        }
      }
    });
  }
  const unlink = $('#unlink');
  if (unlink) {
    unlink.onclick = async () => {
      if (!confirm('Unlink Spotify? The deck will stop controlling it until it is linked again.')) return;
      await api('/api/spotify/unlink', { method: 'POST' });
      info = await api('/api/link/info');
      spotify();
    };
  }
}

// --------------------------------------------------------------- account

function account() {
  $('#page').innerHTML = `
    <div class="grid-2">
      <div class="card">
        <h3>Change password</h3>
        <form id="pwForm" style="margin-top:12px">
          <label class="field"><span>Current password</span><input name="current" type="password" autocomplete="current-password" required /></label>
          <label class="field"><span>New password</span><input name="next" type="password" autocomplete="new-password" minlength="8" required /></label>
          <button class="btn btn-primary">Update password</button>
        </form>
      </div>
      <div class="card">
        <h3>${esc(me.displayName)} ${roleBadge(me.role)}</h3>
        <p class="muted">@${esc(me.username)} · member since ${new Date(me.createdAt).toLocaleDateString()}</p>
        <button class="btn btn-danger" id="logout">Sign out</button>
      </div>
    </div>`;
  $('#pwForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/me/password', { method: 'POST', body: { current: e.target.current.value, next: e.target.next.value } });
      e.target.reset();
      toast('Password updated');
    } catch (err) {
      toast(err.message, true);
    }
  });
  $('#logout').onclick = async () => {
    await api('/api/logout', { method: 'POST' });
    await boot();
  };
}

// ------------------------------------------------------------------ boot

async function boot() {
  info = await api('/api/link/info');
  me = info.user;
  if (!me) return showGate();
  renderShell();
  route();
}

boot().catch((err) => {
  document.body.innerHTML = `<p style="padding:40px;font-family:sans-serif">Can't reach DeckOS Link: ${esc(err.message)}</p>`;
});
