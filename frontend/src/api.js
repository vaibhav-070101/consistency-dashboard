/**
 * API client — all backend communication goes through here.
 *
 * Every function maps to one backend endpoint.
 * Using plain fetch() instead of axios to keep dependencies minimal.
 * The Vite proxy (vite.config.js) forwards /api/* to localhost:8000.
 */

// In dev: Vite proxy handles /api → localhost:8000
// In production: VITE_API_URL points to the Render backend (e.g. https://consistency-api.onrender.com/api)
const BASE = import.meta.env.VITE_API_URL || '/api';

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

// ── Habits ───────────────────────────────────────────────────

export const getHabits = () => request('/habits');

export const createHabit = (data) =>
  request('/habits', { method: 'POST', body: JSON.stringify(data) });

export const updateHabit = (id, data) =>
  request(`/habits/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

export const deleteHabit = (id) =>
  request(`/habits/${id}`, { method: 'DELETE' });

export const habitLifecycle = (id, action) =>
  request(`/habits/${id}/lifecycle`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });

// ── Logs ─────────────────────────────────────────────────────

export const toggleLog = (habitId, date) =>
  request(`/habits/${habitId}/toggle`, {
    method: 'POST',
    body: JSON.stringify({ date }),
  });

export const getLogs = (month, year) =>
  request(`/logs?month=${month}&year=${year}`);

// ── Stats ────────────────────────────────────────────────────

export const getMonthlyStats = (month, year) =>
  request(`/stats/monthly?month=${month}&year=${year}`);

// ── Quote ────────────────────────────────────────────────────

export const getQuote = () => request('/quote');
