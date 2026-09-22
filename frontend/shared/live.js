// shared/live.js
// Helpers for "invisible" updates: polling that never overlaps, and keyed DOM patching
// so a poll that returns nothing new touches nothing on screen.
//
// Usage (dispatcher):
//   const poller = createPoller(async (signal) => {
//     const incidents = await api.listIncidents({ signal });   // must pass the signal to fetch()
//     signal.throwIfAborted();                                 // drop stale responses
//     const r = patchList(listEl, incidents, { key: i => i.id, hash: i => i.updated_at, render: cardHTML, empty: emptyHTML });
//     if (r.added.length && !r.initial) playSound();
//   }, { onStatus: s => setConnectionDot(s) });
//   poller.start();
//   // after a user action (PATCH), call poller.refresh() to re-sync immediately.

// ---------- escaping (use in EVERY render function for server-provided strings) ----------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// ---------- relative time, painted client-side (no refetch needed) ----------
export function timeAgo(iso, now = Date.now()) {
  const diff = Math.floor((now - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(diff)) return '';
  if (diff < 45) return 'just now';
  if (diff < 3600) return Math.max(1, Math.round(diff / 60)) + ' min ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ' + Math.floor((diff % 3600) / 60) + 'm ago';
  return Math.floor(diff / 86400) + 'd ago';
}
// Render `<span data-ago="ISO">${timeAgo(ISO)}</span>` in your cards; this keeps them current.
export function startAgoTicker(root = document, everyMs = 20000) {
  const paint = () => root.querySelectorAll('[data-ago]').forEach((el) => {
    const t = timeAgo(el.dataset.ago);
    if (el.textContent !== t) el.textContent = t;   // only touch the DOM when the text changed
  });
  const id = setInterval(paint, everyMs);
  return () => clearInterval(id);
}

// ---------- polling ----------
// - one request at a time (next one is scheduled AFTER the previous finishes)
// - slower when the tab is hidden, immediate refresh when it becomes visible / network returns
// - exponential backoff on errors; 'offline' status only after `offlineAfter` consecutive failures
// - 401/403 stops polling and reports 'unauthorized' (errors need a numeric `.status`)
// - refresh() aborts the in-flight request and starts a new one (avoids stale data overwriting an optimistic update)
export function createPoller(task, opts = {}) {
  const { visibleMs = 3000, hiddenMs = 10000, maxBackoffMs = 30000, offlineAfter = 3, onStatus } = opts;
  let timer = null, running = false, ctrl = null, failures = 0, status = 'idle';

  const setStatus = (s) => { if (s !== status) { status = s; onStatus && onStatus(s); } };
  const delay = () => {
    const base = document.hidden ? hiddenMs : visibleMs;
    return failures ? Math.min(maxBackoffMs, base * 2 ** (failures - 1)) : base * (0.9 + Math.random() * 0.2);
  };

  async function run() {
  clearTimeout(timer); timer = null;
  if (!running) return;
  
  const mine = (ctrl = new AbortController());
  
  try {
    await task(mine.signal);
    failures = 0; 
    safeSetStatus('ok');
  } catch (e) {
    if (mine.signal.aborted) return; // anulat de refresh() sau stop()
    
    if (e && (e.status === 401 || e.status === 403)) { 
      running = false; 
      safeSetStatus('unauthorized'); 
      return; 
    }
    
    failures++;
    if (failures >= (offlineAfter || 3)) safeSetStatus('offline');
  }

  // Calculăm delay-ul și punem o valoare minimă de siguranță (ex: 3000ms)
  // Dacă eșuează de mai multe ori, mărim timpul de așteptare (Backoff)
  let nextDelay = typeof delay === 'function' ? delay() : 3000;
  if (!nextDelay || nextDelay < 1000) nextDelay = 3000; 
  if (failures > 0) nextDelay = Math.min(nextDelay * 2, 30000); // Maxim 30 secunde pauză la erori

  if (running && ctrl === mine) {
    timer = setTimeout(run, nextDelay);
  }
}

// Funcție de siguranță pentru a preveni prăbușirea buclei dacă elementele DOM lipsesc
function safeSetStatus(s) {
  try {
    if (typeof setStatus === 'function') setStatus(s);
  } catch (err) {
    console.warn('Eroare la actualizarea statusului UI:', err);
  }
}

const wake = () => { 
  if (running && timer && !document.hidden) run(); 
};

return {
  start() {
    if (running) return;
    running = true; failures = 0;
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    run();
  },
  stop() {
    running = false; 
    clearTimeout(timer); 
    timer = null;
    if (ctrl) ctrl.abort();
    document.removeEventListener('visibilitychange', wake);
    window.removeEventListener('online', wake);
  },
  refresh() { 
    if (!running) return; 
    if (ctrl) ctrl.abort(); 
    run(); 
  },
  get status() { return status; },
};
}

// ---------- keyed list patching ----------
// Only creates / replaces / moves / removes the cards that actually changed.
// - key(item)   -> stable id
// - hash(item)  -> string; card is re-rendered only when it changes (use `updated_at` or a JSON of the visible fields)
// - render(item)-> HTML string with ONE root element
// - empty       -> HTML string shown when items is empty
// Local UI state: mark any child that holds user-typed state (e.g. the notes box) with data-local="name".
// That child is carried over into the re-rendered card, keeping its text, visibility and focus.
const listState = new WeakMap();
const toEl = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

export function patchList(container, items, { key, hash, render, empty = '', animate = true }) {
  let st = listState.get(container);
  if (!st) { st = { nodes: new Map(), initial: true, emptyEl: null }; listState.set(container, st); }
  const result = { added: [], updated: [], removed: [], initial: st.initial };

  // remove cards whose key is gone
  const live = new Set(items.map((i) => String(key(i))));
  for (const [k, rec] of st.nodes) {
    if (!live.has(k)) { rec.el.remove(); st.nodes.delete(k); result.removed.push(k); }
  }

  // empty state
  if (!items.length) {
    if (!st.emptyEl) { st.emptyEl = toEl(empty || '<div></div>'); container.appendChild(st.emptyEl); }
    st.initial = false;
    return result;
  }
  if (st.emptyEl) { st.emptyEl.remove(); st.emptyEl = null; }

  // create / update
  const ordered = [];
  for (const item of items) {
    const k = String(key(item)); const h = String(hash(item));
    let rec = st.nodes.get(k);
    if (!rec) {
      const el = toEl(render(item)); el.dataset.key = k;
      if (animate && !st.initial) el.classList.add('is-new');
      rec = { el, h }; st.nodes.set(k, rec); result.added.push(item);
    } else if (rec.h !== h) {
      const next = toEl(render(item)); next.dataset.key = k;
      const active = document.activeElement;
      const hadFocus = active && rec.el.contains(active);
      const sel = hadFocus && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
      rec.el.querySelectorAll('[data-local]').forEach((oldLocal) => {
        const fresh = next.querySelector('[data-local="' + oldLocal.dataset.local + '"]');
        if (fresh) fresh.replaceWith(oldLocal);
      });
      rec.el.replaceWith(next);
      if (hadFocus && active.isConnected) { active.focus({ preventScroll: true }); if (sel) active.setSelectionRange(sel[0], sel[1]); }
      rec.el = next; rec.h = h; result.updated.push(item);
    }
    ordered.push(rec.el);
  }

  // order (moves only nodes that are out of place)
  let ref = container.firstElementChild;
  for (const el of ordered) {
    if (el === ref) ref = ref.nextElementSibling; else container.insertBefore(el, ref);
  }
  st.initial = false;
  return result;
}

// Forget everything rendered in a container (call on logout so the next user never sees stale cards).
export function resetList(container) { listState.delete(container); container.textContent = ''; }

// ---------- map markers (Leaflet-style API: setLatLng / addTo / remove) ----------
// Updates markers in place. Does NOT touch the map view: call fitBounds yourself only on first load
// or on a "recenter" button, never on every poll (it would fight the dispatcher while panning/zooming).
export function syncMarkers(map, store, items, { key, latlng, create }) {
  const seen = new Set(); let added = 0;
  for (const item of items) {
    const ll = latlng(item); if (!ll) continue;
    const k = String(key(item)); seen.add(k);
    const m = store.get(k);
    if (m) { const cur = m.getLatLng(); if (cur.lat !== ll[0] || cur.lng !== ll[1]) m.setLatLng(ll); }
    else { store.set(k, create(item).addTo(map)); added++; }
  }
  for (const [k, m] of store) if (!seen.has(k)) { m.remove(); store.delete(k); }
  return added;
}