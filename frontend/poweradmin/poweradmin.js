import { api, session, setUnauthorizedHandler } from '../shared/api-client.js';
import { esc } from '../shared/live.js';

// ============================================================
// SafeOut — PowerAdmin (Panou SuperAdmin / ONG)
// ============================================================

// Starea globală a aplicației (încărcată din API)
let ACCOUNT_CITY = '';
let ACCOUNT_ROLE = '';
let ACCOUNT_CITY_COORDS = [47.0722, 21.9217]; // Oradea default

let VENUES = [];
let DISPATCHERS = [];
let QRCODES = [];
let EVIDENCE = [];
let INCIDENTS = [];
let pollTimer = null;

// ---- Poartă de Securitate (Gatekeeper) ----
const SUPER_ADMIN_KEY = 'sinca-2026-safeout';

function checkAccessGate() {
    const key = new URLSearchParams(window.location.search).get('key');
    if (key === SUPER_ADMIN_KEY) {
        try { sessionStorage.setItem('safeout_gate', '1'); } catch (e) {}
        return true;
    }
    try { if (sessionStorage.getItem('safeout_gate') === '1') return true; } catch (e) {}
    return false;
}

function showGateBlock() {
    document.body.innerHTML = '<div style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0d0d1a;color:#5a5a6a;font-family:system-ui,sans-serif;text-align:center;padding:24px"><div style="font-size:64px;font-weight:700;margin-bottom:8px;color:#2a2a3a">404</div><div style="font-size:15px">Page not found.</div></div>';
}

// ---- Autentificare ----
// Intră în aplicație cu un utilizator deja autentificat (după login sau la refresh cu token salvat)
async function enterApp(user) {
    ACCOUNT_CITY = user.city;
    ACCOUNT_ROLE = user.role;

    const orgCity = document.getElementById('orgCity');
    if (orgCity) orgCity.textContent = `All cities · ${ACCOUNT_CITY}`;

    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');

    geocodeCity(ACCOUNT_CITY).then(coords => { if (coords) ACCOUNT_CITY_COORDS = coords; });

    await loadAllData();
    renderAll();
    clearInterval(pollTimer);
    pollTimer = setInterval(pollLiveData, 5000);
}

window.doLogin = async function() {
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const pass = document.getElementById('loginPass').value;
    const err = document.getElementById('loginError');
    const showErr = (msg) => { if (err) { err.textContent = msg; err.style.display = 'block'; } };

    if (!email || !pass) { showErr('Introdu emailul și parola.'); return; }

    let data;
    try {
        data = await api.login(email, pass);
    } catch (error) {
        showErr(error.status === 401 ? 'Date de autentificare incorecte.'
              : error.status === 0 ? 'Serverul nu poate fi contactat.'
              : (error.message || 'Autentificare eșuată.'));
        return;
    }

    if (data.dispatcher.role !== 'super_admin') {
        showErr('Acces permis doar administratorilor.');
        return;
    }
    session.set(data.access_token);
    if (err) err.style.display = 'none';
    await enterApp(data.dispatcher);
};

window.doLogout = function() {
    clearInterval(pollTimer); pollTimer = null;
    session.clear();
    VENUES = []; DISPATCHERS = []; QRCODES = []; EVIDENCE = []; INCIDENTS = [];
    document.getElementById('appShell').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    const p = document.getElementById('loginPass');
    if (p) p.value = '';
};

// Token expirat (după 8h) => înapoi la login, nu un panou care arată date vechi
setUnauthorizedHandler(() => {
    if (!pollTimer) return;
    window.doLogout();
    const err = document.getElementById('loginError');
    if (err) { err.textContent = 'Sesiunea a expirat. Autentifică-te din nou.'; err.style.display = 'block'; }
});

// ---- Încărcare Date din API ----
let CONTACT_PINGS = 0;

async function loadAllData() {
    try {
        let contacts;
        [VENUES, DISPATCHERS, QRCODES, EVIDENCE, INCIDENTS, contacts] = await Promise.all([
            api.listVenues().catch(() => []),
            api.listDispatchers().catch(() => []),
            api.listQrcodes().catch(() => []),
            api.listEvidence().catch(() => []),
            api.listIncidents().catch(() => []),
            api.contactStats().catch(() => null)
        ]);
        if (contacts) CONTACT_PINGS = contacts.total;
    } catch (e) {
        console.warn('Eroare la încărcarea datelor inițiale', e);
    }
}

async function pollLiveData() {
    try {
        INCIDENTS = await api.listIncidents().catch(() => INCIDENTS);
        EVIDENCE = await api.listEvidence().catch(() => EVIDENCE);
        const contacts = await api.contactStats().catch(() => null);
        if (contacts) CONTACT_PINGS = contacts.total;
        refreshPA();
    } catch (e) { /* ignore, se reîncearcă la următorul tick */ }
}

// ---- UI & Navigare ----
const TITLES = { dashboard: 'Dashboard', analytics: 'Analytics', venues: 'Venues', qrcodes: 'QR Codes', dispatchers: 'Dispatchers', evidence: 'Evidence', reports: 'Reports & Export' };

window.switchPage = function(id, event) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`page-${id}`).classList.add('active');
    // butoanele din sidebar apelează switchPage('x') fără event, deci găsim itemul după id
    const navItem = document.querySelector(`.nav-item[onclick*="'${id}'"]`);
    if (navItem) navItem.classList.add('active');
    document.getElementById('topbarTitle').textContent = TITLES[id];
    
    if (id === 'dashboard') renderDashboard();
    if (id === 'analytics') renderAnalytics();
    if (id === 'reports') renderReport();
    if (id === 'venues') renderVenues();
    if (id === 'dispatchers') renderDispatchers();
    if (id === 'qrcodes') renderQR();
    if (id === 'evidence') renderEvidence();
};

function renderAll() {
    renderDashboard();
    renderVenues();
    renderDispatchers();
    renderQR();
    renderEvidence();
}

function refreshPA() {
    const active = document.querySelector('.page.active');
    const id = active ? active.id : '';
    if (id === 'page-dashboard') renderDashboard();
    else if (id === 'page-evidence') renderEvidence();
    else if (id === 'page-analytics') renderAnalytics();
    else if (id === 'page-reports') renderReport();
}

const empty = (msg) => `<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:36px 0;font-size:13px">${msg}</td></tr>`;

// ---- Renderere Specifice ----
function renderDashboard() {
    const emergency = INCIDENTS.filter(i => i.situation_type === 'emergency').length;
    const resolved = INCIDENTS.filter(i => i.status === 'resolved').length;
    
    document.getElementById('paVenues').textContent = VENUES.filter(v => v.active).length;
    document.getElementById('paScans').textContent = QRCODES.reduce((s, q) => s + (q.scans || 0), 0);
    document.getElementById('paIncidents').textContent = INCIDENTS.length;
    document.getElementById('paDispatchers').textContent = DISPATCHERS.length;
    
    const em = document.getElementById('paEmergency'); if (em) em.textContent = emergency;
    const rr = document.getElementById('paResRate'); if (rr) rr.textContent = INCIDENTS.length ? Math.round(resolved / INCIDENTS.length * 100) + '%' : '—';
    const set = (elId, v) => { const el = document.getElementById(elId); if (el) el.textContent = v; };
    set('paTypeEmergency', emergency);
    set('paTypeEscort', INCIDENTS.filter(i => i.situation_type === 'escort').length);
    set('paTypeContact', CONTACT_PINGS);
    
    renderCharts(INCIDENTS);
}

function renderVenues() {
    const vs = ACCOUNT_ROLE === 'super_admin' ? VENUES : VENUES.filter(v => (v.city || '') === ACCOUNT_CITY);
    document.getElementById('venuesTable').innerHTML = vs.length ? vs.map(v => {
        const count = v.id ? QRCODES.filter(q => q.venue_id === v.id).length : 0;
        return `<tr>
            <td class="cell-main">${esc(v.name)}</td>
            <td style="text-transform:capitalize">${esc(v.type || '—')}</td>
            <td>${esc(v.city || '')}</td>
            <td>${count} codes</td>
            <td><span class="status-pill ${v.active ? 'active' : 'inactive'}">${v.active ? 'Active' : 'Inactive'}</span></td>
            <td>
                <button class="table-action" onclick="editVenue('${v.id}')">Edit</button>
                <button class="table-action" onclick="deleteVenue('${v.id}')">Delete</button>
            </td>
        </tr>`;
    }).join('') : empty(`No venues${ACCOUNT_ROLE === 'super_admin' ? '' : ' in ' + ACCOUNT_CITY} yet.`);
}

function renderDispatchers() {
    document.getElementById('dispatchersTable').innerHTML = DISPATCHERS.length ? DISPATCHERS.map(d => 
        `<tr>
            <td class="cell-main">${esc(d.full_name)}</td>
            <td style="color:var(--text2)">${esc(d.email)}</td>
            <td>${esc(d.city || '—')}</td>
            <td style="text-transform:capitalize">${esc(String(d.role).replace('_', ' '))}</td>
            <td><span class="status-pill active">Active</span></td>
            <td><button class="table-action" onclick="deleteDispatcher('${d.id}')">Delete</button></td>
        </tr>`
    ).join('') : empty('No dispatchers yet.');
}

function renderQR() {
    const grid = document.getElementById('qrGrid');
    const list = ACCOUNT_ROLE === 'super_admin' ? QRCODES : QRCODES.filter(q => (q.city || '') === ACCOUNT_CITY);
    
    if (!list.length) { 
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--text3);padding:36px 0;font-size:13px">No QR codes yet.</div>`; 
        return; 
    }

    grid.innerHTML = list.map((q, idx) => {
        const locBadge = (q.latitude !== null && q.longitude !== null) ? '<div style="font-size:9px;color:var(--teal);margin-bottom:8px">&#128205; Fixed location</div>' : '<div style="font-size:9px;color:var(--text3);margin-bottom:8px">&#128225; GPS (street)</div>';
        const place = q.placement ? `<div class="qr-venue">${esc(q.placement)}</div>` : '';
        const cityTag = q.city ? `<div style="font-size:9px;color:var(--text3)">${esc(q.city)}</div>` : '';
        const inactive = q.active ? '' : '<div style="font-size:9px;color:var(--amber, #ffb347);margin-bottom:6px">Inactive</div>';
        return `<div class="qr-card">
            <div class="qr-visual" id="qrimg-${idx}"></div>
            <div class="qr-code-label">${esc(q.code)}</div>
            <div class="qr-venue">${esc(q.venue_name || '—')}</div>
            ${place}${cityTag}${locBadge}${inactive}
            <div class="qr-scans">${q.scans || 0} scans</div>
            <button class="table-action" onclick="downloadQR(${idx})">Download PNG</button>
            <button class="table-action" onclick="toggleQR(${q.id}, ${!q.active})">${q.active ? 'Deactivate' : 'Activate'}</button>
        </div>`;
    }).join('');

    list.forEach((q, idx) => {
        const el = document.getElementById(`qrimg-${idx}`);
        if (el && typeof QRCode !== 'undefined') { 
            el.innerHTML = '';
            const url = `${window.location.origin}/pwa/pwa.html?q=${encodeURIComponent(q.code)}`;
            try { new QRCode(el, { text: url, width: 72, height: 72, colorDark: '#1C1C1E', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H }); } catch (e) { el.textContent = 'QR'; }
        }
    });
}

function renderEvidence() {
    const rows = EVIDENCE.map(e => {
        const hold = e.legal_hold;
        const inc = String(e.incident_id ?? '—');
        const type = e.file_type || 'file';
        const viewBtn = `<button class="table-action" onclick="${type === 'audio' ? 'playEvidence' : 'viewEvidence'}('${e.id}')">${type === 'audio' ? 'Play' : 'View'}</button>`;
        return `<tr>
            <td class="cell-main">#${esc(inc)}</td>
            <td style="text-transform:capitalize">${esc(type)}</td>
            <td style="color:var(--text2)">${new Date(e.uploaded_at).toLocaleDateString()}</td>
            <td><span class="status-pill ${hold ? 'active' : 'inactive'}">${hold ? 'Legal hold' : 'None'}</span></td>
            <td>${viewBtn}<button class="table-action" onclick="toggleHold('${e.id}', ${!hold})">${hold ? 'Release' : 'Hold'}</button></td>
        </tr>`;
    }).join('');
    const tbody = document.getElementById('evidenceTable');
    if (tbody) tbody.innerHTML = rows || '<tr><td colspan="5" style="text-align:center;color:var(--text3)">No evidence yet</td></tr>';
}

window.viewEvidence = async function(evidenceId) {
    // Deschidem fereastra sincron (altfel popup blocker-ul o blochează după await)
    const win = window.open('', '_blank');
    try {
        const item = await api.getEvidence(evidenceId);
        if (!win) { alert('Permite ferestrele pop-up pentru a vedea dovada.'); return; }
        win.document.title = `Evidence #${item.id}`;
        const img = win.document.createElement('img');
        img.src = item.storage_url;
        img.style.maxWidth = '100%';
        win.document.body.appendChild(img);
    } catch (e) {
        if (win) win.close();
        alert('Eroare la încărcarea dovezii.');
    }
};

window.playEvidence = async function(evidenceId) {
    try {
        const item = await api.getEvidence(evidenceId);
        const audio = new Audio(item.storage_url);
        audio.play();
    } catch (e) { alert('Eroare la încărcarea dovezii.'); }
};

function renderReport() {
    const set = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
    set('rTotal', INCIDENTS.length);
    set('rEmergency', INCIDENTS.filter(i => i.situation_type === 'emergency').length);
    set('rResolved', INCIDENTS.filter(i => i.status === 'resolved').length);
    set('rVenues', VENUES.filter(v => v.active).length);
    set('rDispatchers', DISPATCHERS.length);
    const t = document.getElementById('reportTitle');
    if(t) t.textContent = 'Report preview — ' + new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

// ---- Grafice & Analize ----
function barChart(elId, entries) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (!entries.length) { el.innerHTML = '<div style="margin:auto;color:var(--text3);font-size:12px">No data yet</div>'; return; }
    const max = Math.max(1, ...entries.map(([, v]) => v));
    el.innerHTML = entries.map(([label, v]) =>
        `<div class="bar-col" title="${esc(label)}: ${v}"><div class="bar" style="height:${v / max * 100}%"></div><div class="bar-label">${esc(label)}</div></div>`
    ).join('');
}

function renderCharts(incidents) {
    const now = Date.now(); const weekMs = 7 * 24 * 3600 * 1000;
    const weeks = new Array(8).fill(0);
    incidents.forEach(i => {
        const t = new Date(i.created_at || Date.now()).getTime();
        const wIdx = 7 - Math.min(7, Math.floor((now - t) / weekMs));
        if (wIdx >= 0 && wIdx < 8) weeks[wIdx]++;
    });
    const maxW = Math.max(1, ...weeks);
    const wc = document.getElementById('weekChart');
    if (wc) wc.innerHTML = weeks.map((v, i) => `<div class="bar-col"><div class="bar" style="height:${(v / maxW * 100)}%"></div><div class="bar-label">W${i + 1}</div></div>`).join('');
}

function renderAnalytics() {
    const scoped = ACCOUNT_ROLE === 'super_admin' ? INCIDENTS : INCIDENTS.filter(i => (i.city || '') === ACCOUNT_CITY);
    const scopedQRs = ACCOUNT_ROLE === 'super_admin' ? QRCODES : QRCODES.filter(q => (q.city || '') === ACCOUNT_CITY);

    const emergency = scoped.filter(i => i.situation_type === 'emergency').length;
    const resolved = scoped.filter(i => i.status === 'resolved').length;
    const totalScans = scopedQRs.reduce((s, q) => s + (q.scans || 0), 0);

    const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
    set('anResRate', scoped.length ? Math.round(resolved / scoped.length * 100) + '%' : '—');
    set('anEmergency', emergency);
    set('anScans', totalScans);
    const acked = scoped.filter(i => i.acknowledged_at && i.created_at);
    const avgSec = acked.length
        ? acked.reduce((s, i) => s + (new Date(i.acknowledged_at) - new Date(i.created_at)) / 1000, 0) / acked.length
        : null;
    set('anAvgResp', avgSec === null ? '—' : avgSec < 60 ? Math.round(avgSec) + 's' : Math.round(avgSec / 60) + ' min');

    // Scanări pe tip de locație (QR-urile fără locație = stradă / public)
    const byType = {};
    scopedQRs.forEach(q => {
        const venue = VENUES.find(v => v.id === q.venue_id);
        const type = venue ? (venue.type || 'other') : 'street';
        byType[type] = (byType[type] || 0) + (q.scans || 0);
    });
    barChart('venueTypeChart', Object.entries(byType).sort((a, b) => b[1] - a[1]));

    // Ore de vârf: incidente pe intervale de 3 ore
    const buckets = new Array(8).fill(0);
    scoped.forEach(i => { buckets[Math.floor(new Date(i.created_at).getHours() / 3)]++; });
    barChart('hoursChart', scoped.length ? buckets.map((v, b) => [String(b * 3).padStart(2, '0') + 'h', v]) : []);
}

// ---- Geocoding ----
async function geocodeCity(cityName) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(cityName)}`);
        if (res.ok) {
            const d = await res.json();
            if (d && d.length) return [parseFloat(d[0].lat), parseFloat(d[0].lon)];
        }
    } catch (e) {}
    return null;
}

// ---- Operațiuni CRUD (API Calls) ----
window.editVenue = async function(id) {
    const v = VENUES.find(x => String(x.id) === String(id)); if (!v) return;
    const name = prompt('Venue name:', v.name); if (!name) return;
    const type = prompt('Type:', v.type);

    try {
        await api.updateVenue(id, { name: name.trim(), type: type?.trim() || v.type });
        VENUES = await api.listVenues();
        renderVenues();
    } catch (e) { alert(e.message || "Eroare la actualizarea locației."); }
};

window.deleteVenue = async function(id) {
    if (!confirm('Are you sure you want to delete this venue?')) return;
    try {
        await api.deleteVenue(id);
        VENUES = await api.listVenues();
        renderVenues();
    } catch (e) { alert("Eroare la ștergerea locației."); }
};

window.deleteDispatcher = async function(dispatcherId) {
    if (!confirm('Delete dispatcher?')) return;
    try {
        await api.deleteDispatcher(dispatcherId);
        DISPATCHERS = await api.listDispatchers();
        renderDispatchers();
    } catch (e) { alert(e.message || "Eroare la ștergerea dispecerului."); }
};

// Codurile QR nu se șterg (incidentele vechi le referă) — doar se activează / dezactivează
window.toggleQR = async function(qrId, active) {
    if (!active && !confirm('Deactivate this QR code? Scanning it will no longer work.')) return;
    try {
        await api.toggleQrActive(qrId, active);
        QRCODES = await api.listQrcodes();
        renderQR();
    } catch (e) { alert(e.message || 'Eroare la modificarea codului QR.'); }
};

window.toggleHold = async function(evidenceId, newState) {
    try {
        await api.toggleLegalHold(evidenceId, newState);
        await pollLiveData();
    } catch (e) { alert("Eroare la modificarea statusului."); }
};

// ---- Modal Logic (Add Items) ----
const MODAL_CONFIG = {
  venue: { title: 'Add venue', sub: 'Register a partner location. Click the map to pin the exact venue.', fields: [['Venue name','text','Club Neptun'],['Type','text','bar / hotel / transport / mall'],['City','text','Oradea'],['__MAP__','map','']] },
  dispatcher: { title: 'Add dispatcher', sub: 'Create a new dispatcher account. The city determines which incidents they see.', fields: [['Full name','text','Full name'],['Email','email','user@admin.ro'],['City','text','Oradea'],['Temporary password','password','']] },
  qr: { title: 'Generate QR code', sub: 'Pick a venue (the QR inherits its location), or choose Street/public to drop a pin manually.', fields: [['__VENUE__','venueselect',''],['__MAP__','map',''],['Placement / cabin','text','Baie femei, cabina 2'],['Short code (optional)','text','auto-generated']] }
};

let currentModalType = null;
let _qrPinLat = null, _qrPinLng = null, _qrModalMap = null, _selectedVenue = null;

window.openModal = function(type) {
  currentModalType = type;
  const cfg = MODAL_CONFIG[type];
  document.getElementById('modalTitle').textContent = cfg.title;
  document.getElementById('modalSub').textContent = cfg.sub;
  document.getElementById('modalOverlay').dataset.type = type;
  _qrPinLat = null; _qrPinLng = null; _selectedVenue = null;

  document.getElementById('modalFields').innerHTML = cfg.fields.map((f, idx) => {
    if (f[1] === 'venueselect') {
      const vs = ACCOUNT_ROLE === 'super_admin' ? VENUES : VENUES.filter(v => (v.city || '') === ACCOUNT_CITY);
      const opts = vs.map(v => `<option value="${v.id}">${esc(v.name)} (${esc(v.city || '?')})</option>`).join('');
      return `<div class="field"><label>Venue</label><select id="mf-${idx}" class="modal-select" onchange="onVenueSelect(this.value)"><option value="">— Choose a venue —</option>${opts}<option value="__street__">Street / public (pin manually)</option></select></div>`;
    }
    if (f[1] === 'map') {
      return `<div class="field" id="qrMapWrap" style="display:none"><label id="qrMapLabel">Click the map to place the pin</label><div id="qrMap" class="qr-map"></div><div id="qrPinStatus" style="font-size:11px;color:var(--text3)">No pin set yet. Click the location.</div></div>`;
    }
    return `<div class="field"><label>${f[0]}</label><input id="mf-${idx}" type="${f[1]}" placeholder="${f[2]}"></div>`;
  }).join('');

  document.getElementById('modalOverlay').classList.add('open');

  if (type === 'venue' && cfg.fields.some(f => f[1] === 'map')) {
    const wrap = document.getElementById('qrMapWrap');
    if (wrap) wrap.style.display = 'block';
    setTimeout(initQRModalMap, 150);
  }
};

window.onVenueSelect = function(val) {
  const wrap = document.getElementById('qrMapWrap');
  _qrPinLat = null; _qrPinLng = null; _selectedVenue = null;
  if (val === '__street__') {
    if (wrap) wrap.style.display = 'block';
    setTimeout(initQRModalMap, 150);
  } else if (val) {
    _selectedVenue = VENUES.find(v => String(v.id) === val) || null;
    if (wrap) wrap.style.display = 'none';
  } else {
    if (wrap) wrap.style.display = 'none';
  }
};

function initQRModalMap() {
  const el = document.getElementById('qrMap');
  if (!el || typeof L === 'undefined') return;
  if (_qrModalMap) { _qrModalMap.remove(); _qrModalMap = null; }
  const center = ACCOUNT_CITY_COORDS || [47.0722, 21.9217];
  _qrModalMap = L.map('qrMap', { attributionControl: false }).setView(center, 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(_qrModalMap);
  let marker = null;
  _qrModalMap.on('click', (e) => {
    _qrPinLat = e.latlng.lat; _qrPinLng = e.latlng.lng;
    if (marker) marker.setLatLng(e.latlng); else marker = L.marker(e.latlng).addTo(_qrModalMap);
    document.getElementById('qrPinStatus').innerHTML = '📍 Pin set: ' + _qrPinLat.toFixed(6) + ', ' + _qrPinLng.toFixed(6);
    document.getElementById('qrPinStatus').style.color = 'var(--teal)';
  });
  setTimeout(() => _qrModalMap.invalidateSize(), 200);
}

window.closeModal = function() {
  document.getElementById('modalOverlay').classList.remove('open');
};

window.closeModalOutside = function(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
};

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

window.submitModal = async function() {
  const get = (i) => { const el = document.getElementById('mf-' + i); return el ? el.value.trim() : ''; };

  try {
    if (currentModalType === 'venue') {
      const name = get(0);
      if (!name) { alert('Venue name is required'); return; }
      if (_qrPinLat === null || _qrPinLng === null) {
        if (!confirm('No pin placed for this venue. Add it without a fixed location?')) return;
      }
      await api.addVenue({ name, type: get(1) || 'venue', city: get(2) || ACCOUNT_CITY, latitude: _qrPinLat, longitude: _qrPinLng });
      VENUES = await api.listVenues();
      renderVenues();
    }

    else if (currentModalType === 'dispatcher') {
      const full_name = get(0), email = get(1).toLowerCase(), city = get(2) || ACCOUNT_CITY, password = get(3);
      if (!full_name || !email) { alert('Name and email are required'); return; }
      if (!isValidEmail(email)) { alert('Please enter a valid email address (e.g. name@example.com).'); return; }
      if (!password || password.length < 6) { alert('Temporary password must be at least 6 characters'); return; }
      await api.register({ email, password, full_name, city, role: 'dispatcher' });
      DISPATCHERS = await api.listDispatchers();
      renderDispatchers();
      alert(`Dispatcher created for ${city}. They can sign in with:\n\nEmail: ${email}\nPassword: ${password}\n\n(Share these credentials securely.)`);
    }

    else if (currentModalType === 'qr') {
      const venueVal = get(0);
      const placement = get(2), shortInput = get(3);
      const code = shortInput || ('SO-' + Math.random().toString(36).slice(2, 6).toUpperCase());

      let payload;
      if (venueVal && venueVal !== '__street__') {
        const v = VENUES.find(x => String(x.id) === venueVal);
        if (!v) { alert('Please choose a valid venue'); return; }
        payload = { code, venue_id: v.id, venue_name: v.name, placement, city: v.city, latitude: v.latitude, longitude: v.longitude };
      } else if (venueVal === '__street__') {
        if (_qrPinLat === null || _qrPinLng === null) {
          if (!confirm('No pin placed. Generate this street QR anyway (it will use the phone GPS)?')) return;
        }
        payload = { code, venue_id: null, venue_name: 'Street / public', placement, city: ACCOUNT_CITY, latitude: _qrPinLat, longitude: _qrPinLng };
      } else {
        alert('Please choose a venue or Street/public'); return;
      }

      await api.addQr(payload);
      QRCODES = await api.listQrcodes();
      renderQR();
      alert(`QR "${code}" created for ${payload.venue_name}.`);
    }

    closeModal();
    renderDashboard();
  } catch (e) {
    alert(e.message || 'Eroare la salvare');
  }
};

// ---- Export ----
function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toCSV(rows) {
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '\ufeff' + rows.map(r => r.map(cell).join(',')).join('\n');   // BOM => Excel citește corect diacriticele
}

const today = () => new Date().toISOString().slice(0, 10);

function exportIncidentsCSV() {
  const cols = ['id', 'created_at', 'situation_type', 'status', 'city', 'venue_name', 'placement', 'latitude', 'longitude',
                'location_method', 'live_tracking', 'acknowledged_at', 'resolved_at', 'evidence_count', 'notes'];
  downloadFile(`safeout-incidents-${today()}.csv`, toCSV([cols, ...INCIDENTS.map(i => cols.map(c => i[c]))]), 'text/csv;charset=utf-8');
}

// Rezumat agregat pe oraș (fără date personale) — pentru raportarea către ANITP
function exportSummaryCSV() {
  const cities = [...new Set(INCIDENTS.map(i => i.city))].sort();
  const rows = [['city', 'total_incidents', 'emergency_112', 'escort', 'resolved', 'avg_minutes_to_acknowledge']];
  cities.forEach(city => {
    const list = INCIDENTS.filter(i => i.city === city);
    const acked = list.filter(i => i.acknowledged_at);
    const avg = acked.length ? acked.reduce((s, i) => s + (new Date(i.acknowledged_at) - new Date(i.created_at)), 0) / acked.length / 60000 : null;
    rows.push([city, list.length, list.filter(i => i.situation_type === 'emergency').length,
               list.filter(i => i.situation_type === 'escort').length, list.filter(i => i.status === 'resolved').length,
               avg === null ? '' : avg.toFixed(1)]);
  });
  downloadFile(`safeout-summary-${today()}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
}

// PDF: deschidem raportul într-o fereastră curată și folosim „Save as PDF” din dialogul de print
function exportReportPDF() {
  renderReport();
  const win = window.open('', '_blank');
  if (!win) { alert('Permite ferestrele pop-up pentru a genera raportul.'); return; }
  const val = (id) => esc((document.getElementById(id) || {}).textContent || '—');
  const rows = [['Total incidents', 'rTotal'], ['Emergency escalations', 'rEmergency'], ['Resolved', 'rResolved'],
                ['Active venues', 'rVenues'], ['Registered dispatchers', 'rDispatchers']];
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>SafeOut report ${today()}</title>
    <style>body{font-family:system-ui,sans-serif;padding:40px;color:#111}h1{font-size:22px;margin-bottom:4px}
    p{color:#666;margin-top:0}table{border-collapse:collapse;width:100%;max-width:520px;margin-top:24px}
    td{border-bottom:1px solid #ddd;padding:10px 4px}td:last-child{text-align:right;font-weight:600}</style></head>
    <body><h1>SafeOut — ${val('reportTitle').replace('Report preview — ', 'Report ')}</h1><p>Generated ${new Date().toLocaleString('ro-RO')}</p>
    <table>${rows.map(([label, id]) => `<tr><td>${label}</td><td>${val(id)}</td></tr>`).join('')}</table></body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

window.mockExport = function(type) {
  if (type === 'CSV') exportIncidentsCSV();
  else if (type === 'ANITP') exportSummaryCSV();
  else exportReportPDF();
};

window.downloadQR = function(idx) {
  const list = ACCOUNT_ROLE === 'super_admin' ? QRCODES : QRCODES.filter(q => (q.city || '') === ACCOUNT_CITY);
  const code = list[idx] ? list[idx].code : 'code';
  const el = document.getElementById(`qrimg-${idx}`);
  const img = el && (el.querySelector('img') || el.querySelector('canvas'));
  if (!img) { alert('QR not ready'); return; }
  const a = document.createElement('a');
  a.href = img.tagName === 'CANVAS' ? img.toDataURL('image/png') : img.src;
  a.download = `SafeOut-QR-${code.replace(/[^\w-]/g, '_')}.png`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
};

// Inițializare aplicație
document.addEventListener('DOMContentLoaded', () => {
    if (!checkAccessGate()) { showGateBlock(); return; }
    const p = document.getElementById('loginPass');
    if (p) p.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

    // Refresh cu token încă valid => rămânem logați
    if (session.token) {
        api.me()
            .then(user => { if (user.role === 'super_admin') return enterApp(user); session.clear(); })
            .catch(() => session.clear());
    }
    
    // Ceas
    const updateClock = () => {
        const el = document.getElementById('topbarTime');
        if (el) el.textContent = new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
    };
    updateClock(); setInterval(updateClock, 30000);
});