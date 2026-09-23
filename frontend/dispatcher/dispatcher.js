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
  contacts: null,           // anonymous "Call somebody" uses in the last 24h
  map: null, markers: new Map(), mapFitted: false,
  cityCoords: [47.0722, 21.9217],
};

// ---------- gestiune audio & sunete ----------
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}
document.addEventListener('click', initAudio, { once: true });

function unlockAudio() {
  initAudio();
}

function soundOn() {
  try {
    return localStorage.getItem('safeout_pref_sound') !== '0';
  } catch (e) {
    return true;
  }
}

function beep(freq = 440, type = 'sine', duration = 0.2) {
  if (!soundOn()) return;
  if (!audioCtx) return;

  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (err) {
    console.warn("Nu s-a putut reda sunetul beep:", err);
  }
}
window.beep = beep;

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
    notes: raw.notes || '',
    evidence: Number(raw.evidence_count) || 0,
    lat: num(raw.latitude), lng: num(raw.longitude),
  };
}
const cardHash = (i) => [i.updated, i.status, i.lat, i.lng, i.live, i.message, i.notes, i.evidence, i.placement, i.venue, i.qr, i.fixed].join('|');

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
    (inc.notes ? '<div class="inc-notes">' + esc(inc.notes) + '</div>' : '') +
    '<div class="inc-actions">' + actions + '<button class="inc-btn secondary" data-action="notes">Notes</button>' +
    (inc.evidence ? '<button class="inc-btn secondary" data-action="evidence">&#128206; Evidence (' + inc.evidence + ')</button>' : '') + '</div>' +
    '<div class="evidence-box" data-local="evidence"></div>' +
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
  setText('statContacts', S.contacts === null ? '\u2014' : S.contacts);
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
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const list = S.incidents.filter((i) => i.status === 'resolved' && new Date(i.createdAt).getTime() >= weekAgo);
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
    const mapEl = $('mapContainer');
    if (mapEl) mapEl.innerHTML = '<div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:13px">Map library could not load (check connection)</div>';
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
  const [rows, audit, contacts] = await Promise.all([
    api.listIncidents({ signal }),
    S.page === 'audit' ? api.listAudit({ signal }) : null,
    api.contactStats({ signal }).catch(() => null),   // optional stat, never breaks the poll
  ]);
  signal.throwIfAborted();
  if (contacts) S.contacts = contacts.last_24h;
  applyServerList(rows);
  if (audit) { S.audit = audit; renderAudit(); }
}, {
  onStatus(s) {
    const off = s === 'offline';
    const badge = $('connBadge');
    if (badge) badge.classList.toggle('off', off);
    setText('connText', off ? 'Reconnecting\u2026' : 'Online \u00b7 Active');
  },
});

// ---------- session ----------
let stopAgo = null;
function showLoginError(msg) { const el = $('loginError'); if (el) { el.textContent = msg; el.style.display = 'block'; } }

async function doLogin() {
  const emailEl = $('loginEmail');
  const passEl = $('loginPass');
  if (!emailEl || !passEl) return;
  const email = emailEl.value.trim().toLowerCase();
  const pass = passEl.value;
  const btn = document.querySelector('[data-action="login"]');
  if (!email || !pass) { showLoginError('Enter your email and password.'); return; }
  if (btn) btn.disabled = true;
  const errEl = $('loginError');
  if (errEl) errEl.style.display = 'none';
  try {
    const data = await api.login(email, pass);
    session.set(data.access_token);
    passEl.value = '';
    startSession(data.dispatcher);
  } catch (e) {
    showLoginError(e.status === 401 ? 'Access denied. Invalid credentials.' : e.status === 0 ? 'Cannot reach the server. Check your connection.' : (e.message || 'Login failed.'));
  } finally { if (btn) btn.disabled = false; }
}

function startSession(user) {
  S.user = user;
  const loginScr = $('loginScreen');
  const appSh = $('appShell');
  if (loginScr) loginScr.classList.add('hidden');
  if (appSh) appSh.classList.remove('hidden');
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
  S.user = null; S.incidents = []; S.loaded = false; S.audit = []; S.contacts = null; S.pending.clear(); S.seen.clear();
  S.markers.forEach((m) => m.remove()); S.markers.clear(); S.mapFitted = false;
  ['incidentList', 'historyList', 'mapIncidentList', 'auditLog'].forEach((id) => resetList($(id)));
  document.title = 'SafeOut \u00b7 Dispatch';
  const appSh = $('appShell');
  const loginScr = $('loginScreen');
  if (appSh) appSh.classList.add('hidden');
  if (loginScr) loginScr.classList.remove('hidden');
  if (msg) showLoginError(msg); else { const errEl = $('loginError'); if (errEl) errEl.style.display = 'none'; }
}
setUnauthorizedHandler(() => { if (S.user) endSession('Session expired. Please sign in again.'); });

async function boot() {
  if (session.token) {
    try { startSession(await api.me()); return; } catch (e) { session.clear(); }
  }
  const loginScr = $('loginScreen');
  if (loginScr) loginScr.classList.remove('hidden');
}

// ---------- navigation ----------
function switchPage(id) {
  S.page = id;
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.page === id));
  const targetPage = $('page-' + id);
  if (targetPage) targetPage.classList.add('active');
  setText('topbarTitle', PAGE_TITLES[id]);
  if (id === 'settings') renderSettings();
  else if (id === 'audit') { renderAudit(); poller.refresh(); }
  else renderActivePage();
  if (id === 'map') setTimeout(() => { if (S.map) S.map.invalidateSize(); }, 250);
}

// ---------- incident actions ----------
function toast(message) {
  const t = document.getElementById('toast');
  if (!t) {
    console.warn("Elementul #toast nu a fost găsit în DOM:", message);
    return;
  }
  t.textContent = message;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}
const errMsg = (e) => (e && e.status === 0 ? 'Cannot reach the server. Try again.' : (e && e.message) || 'Something went wrong.');

async function setStatus(id, status) {
  const inc = S.incidents.find((i) => i.id === id);
  if (!inc || inc.status === status) return;
  const prev = inc.status;
  inc.status = status; S.pending.set(id, status); renderAll();
  try {
    await api.patchIncident(id, { status });
  } catch (e) {
    const cur = S.incidents.find((i) => i.id === id); if (cur) cur.status = prev;
    toast(errMsg(e)); renderAll();
  } finally {
    S.pending.delete(id); poller.refresh();
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
    poller.refresh();
  } catch (e) { toast(errMsg(e)); }
}

// Photos / audio captured by the victim's phone. Loaded on demand (they are large data URLs).
async function toggleEvidence(id, card) {
  const box = card.querySelector('.evidence-box'); if (!box) return;
  if (box.classList.contains('open')) { box.classList.remove('open'); return; }
  box.classList.add('open');
  box.innerHTML = '<div class="evidence-empty">Loading evidence\u2026</div>';
  try {
    const items = await api.listIncidentEvidence(id);
    const safeUrl = (u) => (/^(data:(image|audio)\/|https?:\/\/|\/uploads\/)/.test(u) ? u : '');
    box.innerHTML = items.length ? items.map((e) => {
      const url = safeUrl(e.storage_url);
      const when = new Date(e.uploaded_at).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
      if (!url) return '';
      return e.file_type === 'audio'
        ? '<div class="evidence-item audio"><audio controls preload="none" src="' + esc(url) + '"></audio><span>' + esc(when) + '</span></div>'
        : '<a class="evidence-item" href="' + esc(url) + '" data-action="evidence-open" title="Open full size"><img src="' + esc(url) + '" alt="Photo evidence"><span>' + esc(when) + '</span></a>';
    }).join('') : '<div class="evidence-empty">No evidence uploaded yet</div>';
  } catch (e) {
    box.innerHTML = '<div class="evidence-empty">' + esc(errMsg(e)) + '</div>';
  }
}

// data: URLs can't be opened as top-level navigations, so show the photo in a new tab ourselves
function openEvidence(url) {
  const win = window.open('', '_blank');
  if (!win) { toast('Allow pop-ups to open the photo.'); return; }
  const img = win.document.createElement('img');
  img.src = url; img.style.maxWidth = '100%';
  win.document.title = 'SafeOut evidence';
  win.document.body.style.cssText = 'margin:0;background:#111;display:flex;justify-content:center';
  win.document.body.appendChild(img);
}

// ---------- settings ----------
function renderSettings() {
  const u = S.user; if (!u) return;
  setText('setEmail', u.email || '\u2014'); setText('setRole', u.role || 'dispatcher');
  const nameInput = $('setName');
  if (nameInput) nameInput.value = u.full_name || '';
  setText('setCityVal', u.city || '\u2014');
  const soundInput = $('setSound');
  if (soundInput) soundInput.checked = soundOn();
}

async function saveProfile() {
  const name = $('setName') ? $('setName').value.trim() : '';
  if (!name) { toast('Display name cannot be empty.'); return; }
  try {
    const updated = await api.patchMe({ full_name: name });
    S.user = { ...S.user, ...updated };
    setText('dispatcherName', S.user.full_name);
    setText('dispatcherCity', S.user.role === 'super_admin' ? 'All cities \u00b7 ' + S.user.city : S.user.city + ' \u00b7 Dispatch');
    toast('Profile saved.');
  } catch (e) { toast(errMsg(e)); }
}

async function changePassword() {
  const cur = $('curPass') ? $('curPass').value : '';
  const np = $('newPass') ? $('newPass').value : '';
  const np2 = $('newPass2') ? $('newPass2').value : '';
  const msg = $('passMsg');
  const show = (text, ok) => { if (msg) { msg.style.display = 'block'; msg.textContent = text; msg.style.color = ok ? '#4ecfaa' : '#ff8080'; } };
  if (!cur) return show('Enter your current password.', false);
  if (np.length < 6) return show('New password must be at least 6 characters.', false);
  if (np !== np2) return show('New passwords do not match.', false);
  if (np === cur) return show('New password must be different from the current one.', false);
  try {
    await api.changePassword(cur, np);
    show('Password updated successfully.', true);
    if ($('curPass')) $('curPass').value = '';
    if ($('newPass')) $('newPass').value = '';
    if ($('newPass2')) $('newPass2').value = '';
  } catch (e) { show(e.status === 401 || e.status === 403 ? 'Current password is incorrect.' : errMsg(e), false); }
}

// ---------- geocoding ----------
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
  } catch (e) { /* offline */ }
  return null;
}

// ---------- exports globali pntru HTML ----------
function filterIncidents(type) {
  S.filter = type;
  document.querySelectorAll('.filter-btn').forEach((b) => b.classList.toggle('active', b.dataset.filter === type));
  renderActivePage();
}

function doLogout() {
  endSession();
}

window.filterIncidents = filterIncidents;
window.doLogout = doLogout;

// ---------- event delegation ----------
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]'); if (!el) return;
  // data-key is a string, incident ids from the API are numbers
  const card = el.closest('[data-key]'); const id = card ? Number(card.dataset.key) : null;
  switch (el.dataset.action) {
    case 'login': doLogin(); break;
    case 'logout': endSession(); break;
    case 'page': switchPage(el.dataset.page); break;
    case 'filter':
      filterIncidents(el.dataset.filter); break;
    case 'ack': setStatus(id, 'acknowledged'); break;
    case 'resolve': setStatus(id, 'resolved'); break;
    case 'call112': call112(id); break;
    case 'notes': { const box = card.querySelector('.notes-box'); if (box) { box.classList.toggle('open'); if (box.classList.contains('open')) { const ta = box.querySelector('textarea'); if (ta) ta.focus(); } } break; }
    case 'save-note': saveNote(id, card); break;
    case 'evidence': toggleEvidence(id, card); break;
    case 'evidence-open': e.preventDefault(); openEvidence(el.getAttribute('href')); break;
    case 'save-profile': saveProfile(); break;
    case 'change-password': changePassword(); break;
  }
});

document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'setSound') { try { localStorage.setItem('safeout_pref_sound', e.target.checked ? '1' : '0'); } catch (err) { /* ignore */ } }
});

['loginEmail', 'loginPass'].forEach((id) => {
  const el = $(id);
  if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
});

function updateClock() { const n = new Date(); setText('topbarTime', String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0')); }
updateClock(); setInterval(updateClock, 30000);

boot();