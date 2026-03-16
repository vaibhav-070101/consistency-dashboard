/**
 * API client with offline support.
 *
 * - GET requests: network-first, falls back to localStorage cache
 * - Writes (POST/PATCH/DELETE): attempt network, queue in localStorage on failure
 * - Pending queue is flushed when network returns (online event or manual sync)
 */

const BASE = import.meta.env.VITE_API_URL || '/api';

const QUEUE_KEY = 'offline_queue';
const CACHE_PREFIX = 'api_cache:';

// ── Save status callback (set by App.jsx) ────────────────────
let _onStatusChange = () => {};
export function onSaveStatus(cb) { _onStatusChange = cb; }

function setStatus(status) { _onStatusChange(status); }

// ── LocalStorage cache helpers ───────────────────────────────

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    // Cache valid for 1 hour
    if (Date.now() - ts > 3600000) return null;
    return data;
  } catch { return null; }
}

function cacheSet(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* storage full — ignore */ }
}

// ── Offline queue helpers ────────────────────────────────────

function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch { return []; }
}

function pushQueue(entry) {
  const q = getQueue();
  q.push({ ...entry, ts: Date.now() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

function clearQueue() {
  localStorage.removeItem(QUEUE_KEY);
}

export function getPendingCount() {
  return getQueue().length;
}

export async function flushQueue() {
  const q = getQueue();
  if (q.length === 0) return;

  setStatus('syncing');
  const failed = [];
  for (const entry of q) {
    try {
      await fetch(`${BASE}${entry.path}`, {
        method: entry.method,
        headers: { 'Content-Type': 'application/json' },
        ...(entry.body ? { body: JSON.stringify(entry.body) } : {}),
      });
    } catch {
      failed.push(entry);
    }
  }

  if (failed.length > 0) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(failed));
    setStatus('offline');
  } else {
    clearQueue();
    setStatus('saved');
  }
}

// Auto-flush when back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => flushQueue());
}

// ── Core request function ────────────────────────────────────

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
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
  } catch {
    pushQueue({ path, method, body });
    setStatus('offline');
    return null;
  }
}

// ── Habits ───────────────────────────────────────────────────

export const getHabits = () => cachedGet('/habits');

export const createHabit = (data) => mutate('/habits', 'POST', data);

export const updateHabit = (id, data) => mutate(`/habits/${id}`, 'PATCH', data);

export const deleteHabit = (id) => mutate(`/habits/${id}`, 'DELETE');

export const habitLifecycle = (id, action) =>
  mutate(`/habits/${id}/lifecycle`, 'POST', { action });

// ── Logs ─────────────────────────────────────────────────────

export const toggleLog = (habitId, date) =>
  mutate(`/habits/${habitId}/toggle`, 'POST', { date });

export const getLogs = (month, year) =>
  cachedGet(`/logs?month=${month}&year=${year}`);

// ── Stats ────────────────────────────────────────────────────

export const getMonthlyStats = (month, year) =>
  cachedGet(`/stats/monthly?month=${month}&year=${year}`);

// ── Quote ────────────────────────────────────────────────────

export const getQuote = () => cachedGet('/quote');
