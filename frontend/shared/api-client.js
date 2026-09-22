// shared/api-client.js — the ONLY place in the frontend that calls fetch() towards the backend.
//
// Auth: Bearer JWT returned by POST /auth/login. Kept in sessionStorage (per tab, cleared when the tab closes).
// Same-origin deploy expected (Express serves the frontend), so API_BASE stays ''.

const API_BASE = '';

// Mount paths as in backend/src/app.js (confirmed).
const ROUTES = {
  login: '/auth/login',
  me: '/dispatchers/me',
  password: '/dispatchers/me/password',
  incidents: '/incidents',
  audit: '/audit-log',
  qr: '/qrcodes',
  dispatchers: '/dispatchers',
  venues: '/venues',
  evidence: '/evidence',
};

const TOKEN_KEY = 'safeout_token';
export const session = {
  get token() { try { return sessionStorage.getItem(TOKEN_KEY); } catch (e) { return null; } },
  set(t) { try { sessionStorage.setItem(TOKEN_KEY, t); } catch (e) { /* private mode */ } },
  clear() { try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } },
};

export class ApiError extends Error {
  constructor(status, message, body) { super(message); this.name = 'ApiError'; this.status = status; this.body = body; }
}

let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

// opts: { body, signal, query, auth = true, sessionFailure = true }
//  - auth: attach the Bearer token (false for public endpoints)
//  - sessionFailure: a 401 means "session expired" -> global handler. Set false for endpoints where 401 is an
//    expected business answer (wrong login, wrong current password).
async function request(method, path, opts = {}) {
  const { body, signal, query, auth = true, sessionFailure = true } = opts;
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && session.token) headers.Authorization = 'Bearer ' + session.token;

  let url = API_BASE + path;
  if (query) { const qs = new URLSearchParams(query).toString(); if (qs) url += '?' + qs; }

  let res;
  try {
    res = await fetch(url, {
      method, headers, signal,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: method === 'GET' ? 'no-cache' : undefined,   // always revalidate (ETag -> cheap 304)
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'Cannot reach the server', null);
  }

  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch (e) { /* non-JSON body (e.g. proxy error page) */ }

  if (!res.ok) {
    if (res.status === 401 && auth && sessionFailure && onUnauthorized) onUnauthorized();
    const msg = (data && (data.detail || data.error || data.title)) || res.statusText || 'Request failed';
    throw new ApiError(res.status, msg, data);
  }
  return data;
}

const id = encodeURIComponent;
export const api = {
  // auth / account
  login: (email, password) => request('POST', ROUTES.login, { body: { email, password }, auth: false }),
  me: (o = {}) => request('GET', ROUTES.me, o),
  patchMe: (body) => request('PATCH', ROUTES.me, { body }),
  changePassword: (current_password, new_password) =>
    request('POST', ROUTES.password, { body: { current_password, new_password }, sessionFailure: false }),

  // incidents
  listIncidents: (o = {}) => request('GET', ROUTES.incidents, { signal: o.signal, query: o.query }),
  patchIncident: (incidentId, body) => request('PATCH', `${ROUTES.incidents}/${id(incidentId)}`, { body }),
  listIncidentEvidence: (incidentId) => request('GET', `${ROUTES.incidents}/${id(incidentId)}/evidence`),
  logAction: (incidentId, body) => request('POST', `${ROUTES.incidents}/${id(incidentId)}/actions`, { body }),
  listAudit: (o = {}) => request('GET', ROUTES.audit, { signal: o.signal }),

  // public (used by the PWA)
  createIncident: (body) => request('POST', ROUTES.incidents, { body, auth: false }),
  updateIncidentLocation: (incidentId, body) =>
    request('PATCH', `${ROUTES.incidents}/${id(incidentId)}/location`, { body, auth: false }),
  getQr: (code) => request('GET', `${ROUTES.qr}/${id(code)}`, { auth: false }),

  register: (body) => request('POST', '/auth/register', { body }),
  listDispatchers: (o = {}) => request('GET', ROUTES.dispatchers, { signal: o.signal }),
  deleteDispatcher: (dispatcherId) => request('DELETE', `${ROUTES.dispatchers}/${id(dispatcherId)}`),

  listVenues: (o = {}) => request('GET', ROUTES.venues, { signal: o.signal }),
  addVenue: (body) => request('POST', ROUTES.venues, { body }),
  updateVenue: (venueId, body) => request('PATCH', `${ROUTES.venues}/${id(venueId)}`, { body }),
  deleteVenue: (venueId) => request('DELETE', `${ROUTES.venues}/${id(venueId)}`),

  addQr: (body) => request('POST', ROUTES.qr, { body }),
  toggleQrActive: (qrId, active) => request('PATCH', `${ROUTES.qr}/${id(qrId)}`, { body: { active } }),
  listQrcodes: (o = {}) => request('GET', ROUTES.qr, { signal: o.signal }),

  listEvidence: (o = {}) => request('GET', ROUTES.evidence, { signal: o.signal }),
  getEvidence: (evidenceId) => request('GET', `${ROUTES.evidence}/${id(evidenceId)}`),
  addEvidence: (body) => request('POST', ROUTES.evidence, { body, auth: false }), 

  toggleLegalHold: (evidenceId, legal_hold) => request('PATCH', `${ROUTES.evidence}/${id(evidenceId)}`, { body: { legal_hold } }),

  recordContactPing: () => request('POST', '/contact-pings', { auth: false }),
  contactStats: (o = {}) => request('GET', '/contact-pings/stats', { signal: o.signal }),
};