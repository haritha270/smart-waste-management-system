/**
 * API client + session store.
 *
 * Every request goes through request() which handles JSON, errors and the
 * "session expired" case (401) by clearing local state and redirecting to login.
 */

const BASE = '/api';

/** Current session state (filled in on boot from /api/auth/me). */
export const session = {
  user: null,
  worker: null,
  unreadNotifications: 0,
  loaded: false,
};

const listeners = [];
/** Subscribe to session changes (login, logout, unread count updates). */
export function onSessionChange(fn) {
  listeners.push(fn);
  return () => listeners.splice(listeners.indexOf(fn), 1);
}
function emit() {
  listeners.forEach((fn) => {
    try { fn(session); } catch (err) { console.error(err); }
  });
}

export function setSession(data) {
  session.user = data.user || null;
  session.worker = data.worker || null;
  session.unreadNotifications = data.unreadNotifications || 0;
  session.loaded = true;
  emit();
}

export function clearSession() {
  session.user = null;
  session.worker = null;
  session.unreadNotifications = 0;
  session.loaded = true;
  emit();
}

export function setUnread(count) {
  session.unreadNotifications = count;
  emit();
}

class ApiError extends Error {
  constructor(message, status, errors) {
    super(message);
    this.status = status;
    this.errors = errors || [];
  }
}

/** Low level fetch wrapper. */
async function request(method, path, body, isForm = false) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined && body !== null) {
    if (isForm) opts.body = body;
    else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }

  let res;
  try {
    res = await fetch(BASE + path, opts);
  } catch (err) {
    throw new ApiError('Cannot reach the server. Please check your connection and try again.', 0);
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch (err) { data = { ok: false, message: text }; }
  }

  if (res.status === 401 && !path.startsWith('/auth/')) {
    clearSession();
    if (!location.hash.startsWith('#/login')) {
      // Store the path without the leading '#' so redirects never double-hash it.
      sessionStorage.setItem('wms_return', location.hash.replace(/^#/, '') || '/');
      location.hash = '#/login';
    }
    throw new ApiError((data && data.message) || 'Your session has expired. Please log in again.', 401);
  }

  if (!res.ok || (data && data.ok === false)) {
    throw new ApiError((data && data.message) || `Request failed (${res.status})`, res.status, data && data.errors);
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  put: (path, body) => request('PUT', path, body),
  del: (path) => request('DELETE', path),
  delete: (path) => request('DELETE', path),
  upload: (path, formData) => request('POST', path, formData, true),
};

export { ApiError };

/** Refresh the unread notification badge (used by the top bar). */
export async function refreshUnread() {
  if (!session.user) return;
  try {
    const data = await api.get('/notifications/unread-count');
    if (typeof data.count === 'number' && data.count !== session.unreadNotifications) {
      session.unreadNotifications = data.count;
      emit();
    }
  } catch (err) { /* silent */ }
}
