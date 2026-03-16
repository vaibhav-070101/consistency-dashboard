/**
 * API client with auth headers and offline support.
 *
 * - Attaches Authorization: Bearer <token> to every request
 * - GET requests: network-first, falls back to localStorage cache
 * - Writes: attempt network, queue in localStorage on failure
 * - On 401: clears auth and triggers re-login
 */

const BASE = import.meta.env.VITE_API_URL || '/api';

const QUEUE_KEY = 'offline_queue';
const CACHE_PREFIX = 'api_cache:';
const TOKEN_KEY = 'auth_token';

// ── Auth header ──────────────────────────────────────────────

function authHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// ── Save status callback ─────────────────────────────────────

let _onStatusChange = () => {};
export function onSaveStatus(cb) { _onStatusChange = cb; }
function setStatus(status) { _onStatusChange(status); }

// ── 401 handler (triggers re-login) ──────────────────────────

let _onAuthExpired = () => {};
export function onAuthExpired(cb) { _onAuthExpired = cb; }

// ── LocalStorage cache ───────────────────────────────────────

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > 3600000) return null;
    return data;
  } catch { return null; }
}

function cacheSet(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* storage full */ }
}

// ── Offline queue ────────────────────────────────────────────

function getQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}

function pushQueue(entry) {
  const q = getQueue();
  q.push({ ...entry, ts: Date.now() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

function clearQueue() { localStorage.removeItem(QUEUE_KEY); }

export function getPendingCount() { return getQueue().length; }

export async function flushQueue() {
  const q = getQueue();
  if (q.length === 0) return;
  setStatus('syncing');
  const failed = [];
  for (const entry of q) {
    try {
      await fetch(`${BASE}${entry.path}`, {
        method: entry.method,
        headers: authHeaders(),
        ...(entry.body ? { body: JSON.stringify(entry.body) } : {}),
      });
    } catch { failed.push(entry); }
  }
  if (failed.length > 0) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(failed));
    setStatus('offline');
  } else {
    clearQueue();
    setStatus('saved');
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => flushQueue());

  // Retry queued actions every 30s (handles Render cold starts where
  // we're technically online but the server is just slow to respond)
  setInterval(() => {
    if (getQueue().length > 0) flushQueue();
  }, 30000);
}

// ── Core request ─────────────────────────────────────────────

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: authHeaders(),
    ...options,
  });
  if (res.status === 401) {
    _onAuthExpired();
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `API error ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function cachedGet(path) {
  const cacheKey = path;
  try {
    setStatus('saving');
    const data = await request(path);
    cacheSet(cacheKey, data);
    setStatus('saved');
    return data;
  } catch (e) {
    if (e.message === 'Unauthorized') throw e;
    const cached = cacheGet(cacheKey);
    if (cached !== null) {
      setStatus('offline');
      return cached;
    }
    setStatus('error');
    throw e;
  }
}

async function mutate(path, method, body) {
  try {
    setStatus('saving');
    const res = await request(path, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    setStatus('saved');
    return res;
  } catch (e) {
    if (e.message === 'Unauthorized') throw e;
    pushQueue({ path, method, body });
    setStatus('offline');
    return null;
  }
}

// ── Habits ───────────────────────────────────────────────────

export const getHabits = (month, year) =>
  cachedGet(month && year ? `/habits?month=${month}&year=${year}` : '/habits');
export const createHabit = (data) => mutate('/habits', 'POST', data);
export const updateHabit = (id, data) => mutate(`/habits/${id}`, 'PATCH', data);
export const deleteHabit = (id) => mutate(`/habits/${id}`, 'DELETE');
export const habitLifecycle = (id, action) => mutate(`/habits/${id}/lifecycle`, 'POST', { action });

// ── Logs ─────────────────────────────────────────────────────

export const toggleLog = (habitId, date) => mutate(`/habits/${habitId}/toggle`, 'POST', { date });
export const getLogs = (month, year) => cachedGet(`/logs?month=${month}&year=${year}`);

// ── Stats ────────────────────────────────────────────────────

export const getMonthlyStats = (month, year) => cachedGet(`/stats/monthly?month=${month}&year=${year}`);

// ── Quote (no auth) ──────────────────────────────────────────

export const getQuote = () => cachedGet('/quote');
