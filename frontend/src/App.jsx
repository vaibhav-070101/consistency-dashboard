/**
 * App.jsx — Root component. Handles auth flow and passes data to children.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import PinGate, { validateStoredToken, clearAuth, getStoredUser, getToken } from './components/PinGate'
import Header from './components/Header'
import StatsCards from './components/StatsCards'
import ConsistencyChart from './components/ConsistencyChart'
import HabitTracker from './components/HabitTracker'
import QuoteWidget from './components/QuoteWidget'
import WeeklyBarChart from './components/WeeklyBarChart'
import HabitScorecard from './components/HabitScorecard'
import * as api from './api'
import { onSaveStatus, onAuthExpired, flushQueue, getPendingCount } from './api'

export default function App() {
  const [authenticated, setAuthenticated] = useState(null)

  useEffect(() => {
    validateStoredToken().then(valid => setAuthenticated(valid))
  }, [])

  useEffect(() => {
    onAuthExpired(() => {
      clearAuth();
      setAuthenticated(false);
    })
  }, [])

  if (authenticated === null) {
    return <div className="loading">Loading...</div>
  }

  if (!authenticated) {
    return <PinGate onSuccess={() => setAuthenticated(true)} />
  }

  return <Dashboard onLogout={() => { clearAuth(); setAuthenticated(false) }} />
}

function Dashboard({ onLogout }) {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [habits, setHabits] = useState([])
  const [logs, setLogs] = useState({})
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState('saved')
  const trackerRef = useRef(null)
  const user = getStoredUser()

  useEffect(() => { onSaveStatus(setSaveStatus) }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [h, l, s] = await Promise.all([
        api.getHabits(month, year),
        api.getLogs(month, year),
        api.getMonthlyStats(month, year),
      ])
      setHabits(h)
      setLogs(l)
      setStats(s)
    } catch (e) {
      console.error('Failed to fetch data:', e)
    }
    setLoading(false)
  }, [month, year])

  useEffect(() => { fetchData() }, [fetchData])

  const handleToggle = async (habitId, dateStr) => {
    setLogs(prev => {
      const current = prev[habitId] || []
      const exists = current.includes(dateStr)
      return {
        ...prev,
        [habitId]: exists
          ? current.filter(d => d !== dateStr)
          : [...current, dateStr],
      }
    })
    await api.toggleLog(habitId, dateStr)
    const s = await api.getMonthlyStats(month, year)
    setStats(s)
  }

  const handleCreateHabit = async (data) => {
    await api.createHabit(data)
    fetchData()
  }

  const handleUpdateHabit = async (id, data) => {
    await api.updateHabit(id, data)
    fetchData()
  }

  const handleLifecycle = async (id, action) => {
    await api.habitLifecycle(id, action)
    fetchData()
  }

  const handleDeleteHabit = async (id) => {
    await api.deleteHabit(id)
    fetchData()
  }

  const handleLogout = async () => {
    const token = getToken()
    if (token) {
      try {
        await fetch(`${import.meta.env.VITE_API_URL || '/api'}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
      } catch { /* ignore */ }
    }
    onLogout()
  }

  return (
    <div className="app">
      <Header
        month={month}
        year={year}
        onMonthChange={setMonth}
        onYearChange={setYear}
        userName={user?.name}
        onLogout={handleLogout}
      />

      <div className="save-indicator-row">
        <span className={`save-indicator ${saveStatus}`}>
          {saveStatus === 'saved' && '✓ Saved'}
          {saveStatus === 'saving' && '⏳ Saving...'}
          {saveStatus === 'syncing' && '🔄 Syncing...'}
          {saveStatus === 'offline' && (
            <>
              ⚡ Offline ({getPendingCount()} queued)
              <button className="sync-btn" onClick={async () => { await flushQueue(); fetchData() }}>Sync now</button>
            </>
          )}
          {saveStatus === 'error' && '⚠ Error'}
        </span>
      </div>

      <QuoteWidget />

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <>
          <StatsCards stats={stats} />

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Consistency</div>
            <div className="chart-wrap">
              <ConsistencyChart dailyRates={stats?.daily_rates || []} />
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">
              <span>Habit Tracker <button className="mini-btn" onClick={() => trackerRef.current?.openAddModal()} title="Add a new habit" style={{ marginLeft: 8 }}>+ Add</button></span>
              <div className="card-title-actions">
                <button className="mini-btn" onClick={() => trackerRef.current?.scrollToToday()} title="Scroll to today">Today</button>
                <button className="mini-btn" onClick={fetchData} title="Refresh data">↻</button>
              </div>
            </div>
            <HabitTracker
              ref={trackerRef}
              habits={habits}
              logs={logs}
              stats={stats}
              month={month}
              year={year}
              onToggle={handleToggle}
              onCreate={handleCreateHabit}
              onUpdate={handleUpdateHabit}
              onLifecycle={handleLifecycle}
              onDelete={handleDeleteHabit}
            />
          </div>

          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div className="card">
              <div className="card-title">Monthly Progress</div>
              {stats?.habits.map(h => {
                const raw = habits.find(rh => rh.id === h.id)
                const isPaused = raw?.status === 'paused'
                return (
                  <div className="progress-item" key={h.id} style={isPaused ? { opacity: 0.45 } : undefined}>
                    <div className="progress-top">
                      <span className="progress-label">
                        {h.name}
                        {isPaused && <span style={{ fontSize: 9, color: 'var(--orange)', marginLeft: 6 }}>PAUSED</span>}
                      </span>
                      <span className="progress-meta">
                        <span className="progress-pct">{isPaused ? '—' : `${Math.round(h.percentage * 100)}%`}</span>
                        {!isPaused && h.streak_label !== '—' && (
                          <span className="progress-streak">🔥 {h.streak_label}</span>
                        )}
                      </span>
                    </div>
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill" style={{ width: isPaused ? '0%' : `${Math.round(h.percentage * 100)}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="card">
              <div className="card-title">Weekly Progress</div>
              {stats?.habits.map(h => {
                const raw = habits.find(rh => rh.id === h.id)
                const isPaused = raw?.status === 'paused'
                return (
                  <div className="progress-item" key={h.id} style={isPaused ? { opacity: 0.45 } : undefined}>
                    <div className="progress-top">
                      <span className="progress-label">
                        {h.name}
                        {isPaused && <span style={{ fontSize: 9, color: 'var(--orange)', marginLeft: 6 }}>PAUSED</span>}
                      </span>
                      <span className="progress-meta">
                        <span className="progress-pct">{isPaused ? '—' : `${Math.round((h.weekly_pct ?? 0) * 100)}%`}</span>
                        <span className="progress-streak" style={{ color: 'var(--text-dim)' }}>{h.frequency}/wk</span>
                      </span>
                    </div>
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill" style={{ width: isPaused ? '0%' : `${Math.round((h.weekly_pct ?? 0) * 100)}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div className="card">
              <div className="card-title">Weekly Consistency Average</div>
              <div className="chart-wrap">
                <WeeklyBarChart weekAverages={stats?.week_averages || []} />
              </div>
            </div>
            <div className="card">
              <div className="card-title">Habit Scorecard</div>
              <HabitScorecard stats={stats} habits={habits} logs={logs} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
