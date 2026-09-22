// SafeOut — Dispatch Center (frontend). Talks to the backend ONLY through /shared/api-client.js.
import { api, session, setUnauthorizedHandler } from '../shared/api-client.js';
import { esc, timeAgo, patchList, resetList, createPoller, startAgoTicker, syncMarkers } from '../shared/live.js';

const $ = (id) => document.getElementById(id);
const setText = (id, v) => { const el = $(id); const s = String(v); if (el && el.textContent !== s) el.textContent = s; };

const TYPE_META = {
  emergency: { label: '112 \u2014 Emergency', icon: '\u{1F198}', color: 'red' },
  escort: { label: 'Get me out', icon: '\u{1F6AA}', color: 'amber' },
  contact: { label: 'Call somebody', icon: '\u{1F4F1}', color: 'blue' },
};
const PAGE_TITLES = { live: 'Live Incidents', map: 'Map View', history: 'History', audit: 'Audit Log', settings: 'Settings' };
const ICON_PIN = '<svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
const ICON_QR = '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>';
const EMPTY = (msg) => '<div style="text-align:center;color:var(--text3);padding:48px 0;font-size:13px">' + msg + '</div>';

const S = {
  user: null,
  incidents: [],            // display models, contact pings excluded
  loaded: false,            // first response received (avoids flashing "No incidents" before data arrives)
  filter: 'all',
  page: 'live',
  pending: new Map(),       // id -> status set optimistically, kept until the PATCH settles
  seen: new Set(),          // incident ids already announced (sound)
  audit: [],
  map: null, markers: new Map(), mapFitted: false,
  cityCoords: [47.0722, 21.9217],
};

// ---------- data mapping ----------
function toDisplay(raw) {
  const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));   // pg numeric arrives as string
  return {
    id: raw.id,
    type: raw.situation_type === 'emergency' ? 'emergency' : raw.situation_type === 'escort' ? 'escort' : 'contact',
    status: raw.status || 'pending',
    venue: raw.venue_name || (raw.qr_code_id && raw.qr_code_id !== 'demo' ? 'QR ' + raw.qr_code_id : 'Unknown location'),
    placement: raw.placement || '',
    qr: raw.qr_code_id || '\u2014',
    fixed: raw.location_method === 'qr_fixed',
    live: raw.live_tracking === true,
    createdAt: raw.created_at,
    updated: raw.updated_at || '',
    message: raw.victim_message || '',
    lat: num(raw.latitude), lng: num(raw.longitude),
  };
}
const cardHash = (i) => [i.updated, i.status, i.lat, i.lng, i.live, i.message, i.placement, i.venue, i.qr, i.fixed].join('|');

function applyServerList(rows) {
  const list = rows.filter((r) => r.situation_type !== 'contact').map(toDisplay);
  for (const inc of list) { const p = S.pending.get(inc.id); if (p) inc.status = p; }
  const fresh = S.loaded ? list.filter((i) => i.status === 'pending' && !S.seen.has(i.id)) : [];
  list.forEach((i) => S.seen.add(i.id));
  S.incidents = list; S.loaded = true;
  if (fresh.length) beep();
  renderAll();
}

// ---------- rendering ----------
function cardHTML(inc) {
  const m = TYPE_META[inc.type] || TYPE_META.escort;
  const resolved = inc.status === 'resolved';
  const actions = resolved ? '' :
    (inc.status === 'pending' ? '<button class="inc-btn primary" data-action="ack">Acknowledge</button>' : '') +
    '<button class="inc-btn danger" data-action="call112">Call 112</button>' +
    '<button class="inc-btn success" data-action="resolve">Resolve</button>';
  return '<div class="incident-card ' + m.color + (resolved ? ' resolved' : '') + '">' +
    '<div class="inc-top"><div class="inc-type"><span class="inc-type-icon">' + m.icon + '</span><span class="inc-type-label">' + m.label +
    '</span><span class="badge ' + m.color + '">' + esc(inc.status.toUpperCase()) + '</span></div>' +
    '<span class="inc-time" data-ago="' + esc(inc.createdAt) + '">' + esc(timeAgo(inc.createdAt)) + '</span></div>' +
    '<div class="inc-meta"><div class="inc-meta-item">' + ICON_PIN + esc(inc.venue) + '</div>' +
    '<div class="inc-meta-item">' + ICON_QR + 'QR: ' + esc(inc.qr) + '</div>' +
    (inc.fixed ? '<div class="inc-meta-item" style="color:var(--teal);font-size:10px">&#128205; exact location</div>' : '') +
    (inc.live ? '<div class="inc-meta-item" style="color:#ff5c5c;font-size:10px;font-weight:700">&#128308; LIVE &middot; tracking</div>' : '') + '</div>' +
    (inc.placement ? '<div class="inc-msg" style="border-left-color:var(--amber-border);color:var(--amber)">&#128682; ' + esc(inc.placement) + '</div>' : '') +
    (inc.message ? '<div class="inc-msg">"' + esc(inc.message) + '"</div>' : '') +
    '<div class="inc-actions">' + actions + '<button class="inc-btn secondary" data-action="notes">Notes</button></div>' +
    '<div class="notes-box" data-local="notes"><textarea class="notes-area" placeholder="Add operational notes..."></textarea>' +
    '<button class="notes-submit" data-action="save-note">Save note</button></div></div>';
}

function mapCardHTML(inc) {
  const m = TYPE_META[inc.type] || TYPE_META.escort;
  return '<div class="incident-card ' + m.color + '" style="margin-bottom:8px;cursor:default"><div class="inc-top"><div class="inc-type"><span>' + m.icon +
    '</span><span class="inc-type-label">' + m.label + '</span><span class="badge ' + m.color + '">' + esc(inc.status) + '</span></div>' +
    '<span class="inc-time" data-ago="' + esc(inc.createdAt) + '">' + esc(timeAgo(inc.createdAt)) + '</span></div>' +
    '<div class="inc-meta"><div class="inc-meta-item">' + esc(inc.venue) + '</div></div>' +
    '<div class="inc-meta"><div class="inc-meta-item" style="font-size:10px;color:var(--text3)">' +
    (inc.lat !== null && inc.lng !== null ? inc.lat.toFixed(6) + ', ' + inc.lng.toFixed(6) : 'No GPS location') + '</div></div></div>';
}

function renderAll() {
  const active = S.incidents.filter((i) => i.status !== 'resolved');
  const pending = active.filter((i) => i.status === 'pending').length;
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  setText('activeCount', pending + ' pending');
  setText('statActive', pending);
  setText('statAck', active.filter((i) => i.status === 'acknowledged').length);
  setText('statTonight', S.incidents.filter((i) => new Date(i.createdAt).getTime() >= dayAgo).length);
  setText('statContacts', '\u2014');               // no backend route for contact pings yet
  setText('notifBadge', pending);
  const title = (pending ? '(' + pending + ') ' : '') + 'SafeOut \u00b7 Dispatch';
  if (document.title !== title) document.title = title;
  renderActivePage();
}

function renderActivePage() {
  if (S.page === 'live' && S.loaded) {
    const list = S.incidents.filter((i) => i.status !== 'resolved' && (S.filter === 'all' || i.type === S.filter));
    patchList($('incidentList'), list, { key: (i) => i.id, hash: cardHash, render: cardHTML, empty: EMPTY('No active incidents. New alerts appear here automatically.') });
  } else if (S.page === 'history' && S.loaded) {
    const list = S.incidents.filter((i) => i.status === 'resolved');
    patchList($('historyList'), list, { key: (i) => i.id, hash: cardHash, render: cardHTML, empty: EMPTY('No resolved incidents yet') });
  } else if (S.page === 'map' && S.loaded) {
    renderMap();
  } else if (S.page === 'audit') {
    renderAudit();
  }
}

// ---------- map ----------
function ensureMap() {
  if (S.map) return S.map;
  if (typeof L === 'undefined') {
    $('mapContainer').innerHTML = '<div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:13px">Map library could not load (check connection)</div>';
    return null;
  }
  S.map = L.map('mapContainer', { zoomControl: true, attributionControl: false }).setView(S.cityCoords, 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(S.map);
  return S.map;
}
function makeMarker(inc) {
  const COLORS = { emergency: '#ff6b6b', escort: '#ffb347', contact: '#7b8fff' };
  const color = COLORS[inc.type] || '#7b8fff';
  const icon = L.divIcon({
    className: '', iconSize: [16, 16], iconAnchor: [8, 8],
    html: '<div style="width:16px;height:16px;border-radius:50%;background:' + color + ';box-shadow:0 0 0 4px ' + color + '33,0 0 0 8px ' + color + '1a;border:2px solid #0d0d1a"></div>',
  });
  const m = (TYPE_META[inc.type] || TYPE_META.escort).label;
  return L.marker([inc.lat, inc.lng], { icon }).bindPopup('<b>' + esc(m) + '</b><br>' + esc(inc.venue));
}
function renderMap() {
  const map = ensureMap();
  const active = S.incidents.filter((i) => i.status !== 'resolved');
  if (map) {
    syncMarkers(map, S.markers, active, { key: (i) => i.id, latlng: (i) => (i.lat !== null && i.lng !== null ? [i.lat, i.lng] : null), create: makeMarker });
    // Fit ONCE (first time there is something to show). Never on later polls: it would fight the dispatcher's pan/zoom.
    if (!S.mapFitted && S.markers.size) {
      map.fitBounds(L.featureGroup([...S.markers.values()]).getBounds().pad(0.3), { maxZoom: 15 });
      S.mapFitted = true;
    }
  }
  patchList($('mapIncidentList'), active, { key: (i) => i.id, hash: cardHash, render: mapCardHTML, empty: EMPTY('No active incidents on map') });
}

// ---------- audit ----------
const ACTION_LABEL = { called_112: 'Called 112', note_added: 'Note added', acknowledged: 'Acknowledged', resolved: 'Resolved' };
const ACTION_COLOR = { called_112: 'red', note_added: 'blue', acknowledged: 'amber', resolved: 'teal' };
function auditKey(e) { return e.id !== undefined ? e.id : e.created_at + '|' + e.action + '|' + e.detail; }
function auditHTML(e) {
  const when = new Date(e.created_at).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return '<div class="log-item"><div class="log-dot ' + (ACTION_COLOR[e.action] || 'gray') + '"></div><div class="log-body"><div class="log-action">' +
    esc(ACTION_LABEL[e.action] || e.action) + '</div><div class="log-meta">' + esc(e.detail || '') + ' &middot; ' + esc(when) + '</div></div></div>';
}
function renderAudit() {
  patchList($('auditLog'), S.audit, { key: auditKey, hash: auditKey, render: auditHTML, empty: '<div style="color:var(--text3);font-size:12px;text-align:center;padding:20px">No actions yet</div>' });
}

// ---------- polling ----------
const poller = createPoller(async (signal) => {
  const [rows, audit] = await Promise.all([
    api.listIncidents({ signal }),
    S.page === 'audit' ? api.listAudit({ signal }) : null,
  ]);
  signal.throwIfAborted();
  applyServerList(rows);
  if (audit) { S.audit = audit; renderAudit(); }
}, {
  onStatus(s) {
    const off = s === 'offline';
    $('connBadge').classList.toggle('off', off);
    setText('connText', off ? 'Reconnecting\u2026' : 'Online \u00b7 Active');
  },
});

// ---------- session ----------
let stopAgo = null;
function showLoginError(msg) { const el = $('loginError'); el.textContent = msg; el.style.display = 'block'; }

async function doLogin() {
  const email = $('loginEmail').value.trim().toLowerCase();
  const pass = $('loginPass').value;
  const btn = document.querySelector('[data-action="login"]');
  if (!email || !pass) { showLoginError('Enter your email and password.'); return; }
  btn.disabled = true; $('loginError').style.display = 'none';
  try {
    const data = await api.login(email, pass);
    session.set(data.access_token);
    $('loginPass').value = '';
    startSession(data.dispatcher);
  } catch (e) {
    showLoginError(e.status === 401 ? 'Access denied. Invalid credentials.' : e.status === 0 ? 'Cannot reach the server. Check your connection.' : (e.message || 'Login failed.'));
  } finally { btn.disabled = false; }
}

function startSession(user) {
  S.user = user;
  $('loginScreen').classList.add('hidden'); $('appShell').classList.remove('hidden');
  setText('dispatcherName', user.full_name);
  setText('dispatcherCity', user.role === 'super_admin' ? 'All cities \u00b7 ' + user.city : user.city + ' \u00b7 Dispatch');
  ['statActive', 'statAck', 'statTonight'].forEach((id) => setText(id, '\u2014'));
  unlockAudio();
  geocodeCity(user.city).then((co) => { if (co) { S.cityCoords = co; if (S.map && !S.mapFitted) S.map.setView(co, 13); } });
  switchPage('live');
  poller.start();
  stopAgo = startAgoTicker(document);
}

function endSession(msg) {
  poller.stop(); if (stopAgo) { stopAgo(); stopAgo = null; }
  session.clear();
  S.user = null; S.incidents = []; S.loaded = false; S.audit = []; S.pending.clear(); S.seen.clear();
  S.markers.forEach((m) => m.remove()); S.markers.clear(); S.mapFitted = false;
  ['incidentList', 'historyList', 'mapIncidentList', 'auditLog'].forEach((id) => resetList($(id)));   // never show the previous user's data
  document.title = 'SafeOut \u00b7 Dispatch';
  $('appShell').classList.add('hidden'); $('loginScreen').classList.remove('hidden');
  if (msg) showLoginError(msg); else $('loginError').style.display = 'none';
}
setUnauthorizedHandler(() => { if (S.user) endSession('Session expired. Please sign in again.'); });

async function boot() {
  if (session.token) {
    try { startSession(await api.me()); return; } catch (e) { session.clear(); }
  }
  $('loginScreen').classList.remove('hidden');
}

// ---------- navigation ----------
function switchPage(id) {
  S.page = id;
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.page === id));
  $('page-' + id).classList.add('active');
  setText('topbarTitle', PAGE_TITLES[id]);
  if (id === 'settings') renderSettings();
  else if (id === 'audit') { renderAudit(); poller.refresh(); }
  else renderActivePage();
  if (id === 'map') setTimeout(() => { if (S.map) S.map.invalidateSize(); }, 250);
}

// ---------- incident actions ----------
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 3200);
}
const errMsg = (e) => (e && e.status === 0 ? 'Cannot reach the server. Try again.' : (e && e.message) || 'Something went wrong.');

async function setStatus(id, status) {
  const inc = S.incidents.find((i) => i.id === id);
  if (!inc || inc.status === status) return;
  const prev = inc.status;
  inc.status = status; S.pending.set(id, status); renderAll();           // optimistic
  try {
    await api.patchIncident(id, { status });
  } catch (e) {
    const cur = S.incidents.find((i) => i.id === id); if (cur) cur.status = prev;
    toast(errMsg(e)); renderAll();
  } finally {
    S.pending.delete(id); poller.refresh();                               // aborts any in-flight (older) poll, fetches fresh
  }
}
async function call112(id) {
  try { await api.logAction(id, { action_type: 'called_112' }); toast('112 call logged. Document the outcome in Notes.'); }
  catch (e) { toast(errMsg(e)); }
}
async function saveNote(id, card) {
  const ta = card.querySelector('textarea'); const text = ta.value.trim();
  if (!text) return;
  try {
    await api.logAction(id, { action_type: 'note_added', note: text });
    ta.value = ''; card.querySelector('.notes-box').classList.remove('open'); toast('Note saved.');
  } catch (e) { toast(errMsg(e)); }
}

// ---------- settings ----------
function renderSettings() {
  const u = S.user; if (!u) return;
  setText('setEmail', u.email || '\u2014'); setText('setRole', u.role || 'dispatcher');
  $('setName').value = u.full_name || '';
  const city = $('setCity'); city.value = u.city || ''; city.disabled = u.role !== 'super_admin';   // city drives access scope: not self-service
  $('setSound').checked = soundOn();
}
async function saveProfile() {
  const name = $('setName').value.trim(); const city = $('setCity').value.trim();
  if (!name) { toast('Display name cannot be empty.'); return; }
  const body = { full_name: name };
  if (S.user.role === 'super_admin' && city && city !== S.user.city) body.city = city;
  try {
    const updated = await api.patchMe(body);
    S.user = { ...S.user, ...updated };
    setText('dispatcherName', S.user.full_name);
    setText('dispatcherCity', S.user.role === 'super_admin' ? 'All cities \u00b7 ' + S.user.city : S.user.city + ' \u00b7 Dispatch');
    toast('Profile saved.');
  } catch (e) { toast(errMsg(e)); }
}
async function changePassword() {
  const cur = $('curPass').value, np = $('newPass').value, np2 = $('newPass2').value;
  const msg = $('passMsg');
  const show = (text, ok) => { msg.style.display = 'block'; msg.textContent = text; msg.style.color = ok ? '#4ecfaa' : '#ff8080'; };
  if (!cur) return show('Enter your current password.', false);
  if (np.length < 6) return show('New password must be at least 6 characters.', false);
  if (np !== np2) return show('New passwords do not match.', false);
  if (np === cur) return show('New password must be different from the current one.', false);
  try {
    await api.changePassword(cur, np);
    show('Password updated successfully.', true);
    $('curPass').value = ''; $('newPass').value = ''; $('newPass2').value = '';
  } catch (e) { show(e.status === 401 || e.status === 403 ? 'Current password is incorrect.' : errMsg(e), false); }
}

// ---------- sound ----------
let audioCtx = null;
function soundOn() { try { const s = localStorage.getItem('safeout_pref_sound'); return s === null || s === '1'; } catch (e) { return true; } }
function unlockAudio() {   // called from the login click, which counts as the user gesture browsers require
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) { /* no audio */ }
}
function beep() {
  if (!audioCtx || !soundOn()) return;
  const t = audioCtx.currentTime;
  [880, 660].forEach((f, i) => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain(), at = t + i * 0.18;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.25, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
    o.connect(g); g.connect(audioCtx.destination); o.start(at); o.stop(at + 0.18);
  });
}

// ---------- geocoding (city name -> map center), cached per tab ----------
async function geocodeCity(name) {
  if (!name) return null;
  const key = 'safeout_geo_' + name.toLowerCase();
  try { const c = sessionStorage.getItem(key); if (c) return JSON.parse(c); } catch (e) { /* ignore */ }
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(name));
    if (r.ok) {
      const d = await r.json();
      if (d && d.length) { const co = [parseFloat(d[0].lat), parseFloat(d[0].lon)]; try { sessionStorage.setItem(key, JSON.stringify(co)); } catch (e) { /* ignore */ } return co; }
    }
  } catch (e) { /* offline: keep default */ }
  return null;
}

// ---------- events (delegation: no inline handlers, works under a strict CSP) ----------
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]'); if (!el) return;
  const card = el.closest('[data-key]'); const id = card ? card.dataset.key : null;
  switch (el.dataset.action) {
    case 'login': doLogin(); break;
    case 'logout': endSession(); break;
    case 'page': switchPage(el.dataset.page); break;
    case 'filter':
      S.filter = el.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.toggle('active', b === el));
      renderActivePage(); break;
    case 'ack': setStatus(id, 'acknowledged'); break;
    case 'resolve': setStatus(id, 'resolved'); break;
    case 'call112': call112(id); break;
    case 'notes': { const box = card.querySelector('.notes-box'); box.classList.toggle('open'); if (box.classList.contains('open')) box.querySelector('textarea').focus(); break; }
    case 'save-note': saveNote(id, card); break;
    case 'save-profile': saveProfile(); break;
    case 'change-password': changePassword(); break;
  }
});
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'setSound') { try { localStorage.setItem('safeout_pref_sound', e.target.checked ? '1' : '0'); } catch (err) { /* ignore */ } }
});
['loginEmail', 'loginPass'].forEach((id) => $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); }));

function updateClock() { const n = new Date(); setText('topbarTime', String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0')); }
updateClock(); setInterval(updateClock, 30000);

boot();