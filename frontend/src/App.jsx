/**
 * App.jsx — Root component. Holds all state and passes data to children.
 *
 * React key concepts used here:
 *   useState  → declares a piece of state that triggers re-render when changed
 *   useEffect → runs side effects (API calls) when dependencies change
 *   useCallback → memoizes a function so it doesn't get recreated every render
 *
 * Data flow: App fetches from API → passes data as props to child components
 *            Child components call callbacks (passed as props) to trigger actions
 */

import { useState, useEffect, useCallback } from 'react'
import Header from './components/Header'
import StatsCards from './components/StatsCards'
import ConsistencyChart from './components/ConsistencyChart'
import HabitTracker from './components/HabitTracker'
import QuoteWidget from './components/QuoteWidget'
import WeeklyBarChart from './components/WeeklyBarChart'
import HabitScorecard from './components/HabitScorecard'
import * as api from './api'

export default function App() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1) // 1-12
  const [year, setYear] = useState(now.getFullYear())
  const [habits, setHabits] = useState([])
  const [logs, setLogs] = useState({})      // { habitId: ["2026-03-01", ...] }
  const [stats, setStats] = useState(null)  // MonthlyStats from backend
  const [loading, setLoading] = useState(true)

  // Fetch all data whenever month/year changes
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [h, l, s] = await Promise.all([
        api.getHabits(),
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

  // Toggle a habit log — optimistic update for snappy UX
  const handleToggle = async (habitId, dateStr) => {
    // Immediately update local state (optimistic)
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

    // Then sync with backend
    await api.toggleLog(habitId, dateStr)
    // Re-fetch stats (streaks, percentages need server-side recalc)
    const s = await api.getMonthlyStats(month, year)
    setStats(s)
  }

  // Create a new habit
  const handleCreateHabit = async (data) => {
    await api.createHabit(data)
    fetchData()
  }

  // Update a habit (name, frequency, etc.)
  const handleUpdateHabit = async (id, data) => {
    await api.updateHabit(id, data)
    fetchData()
  }

  const handleLifecycle = async (id, action) => {
    await api.habitLifecycle(id, action)
    fetchData()
  }

  // Delete a habit
  const handleDeleteHabit = async (id) => {
    await api.deleteHabit(id)
    fetchData()
  }

  return (
    <div className="app">
      <Header
        month={month}
        year={year}
        onMonthChange={setMonth}
        onYearChange={setYear}
      />

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
            <div className="card-title">Habit Tracker</div>
            <HabitTracker
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
              {stats?.habits.map(h => (
                <div className="progress-item" key={h.id}>
                  <div className="progress-top">
                    <span className="progress-label">{h.name}</span>
                    <span className="progress-meta">
                      <span className="progress-pct">
                        {Math.round(h.percentage * 100)}%
                      </span>
                      {h.streak_label !== '—' && (
                        <span className="progress-streak">
                          🔥 {h.streak_label}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="progress-bar-bg">
                    <div className="progress-bar-fill"
                      style={{ width: `${Math.round(h.percentage * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="card-title">Weekly Progress</div>
              {stats?.habits.map(h => (
                <div className="progress-item" key={h.id}>
                  <div className="progress-top">
                    <span className="progress-label">{h.name}</span>
                    <span className="progress-meta">
                      <span className="progress-pct">
                        {Math.round((h.weekly_pct ?? 0) * 100)}%
                      </span>
                      <span className="progress-streak" style={{ color: 'var(--text-dim)' }}>
                        {h.frequency}/wk
                      </span>
                    </span>
                  </div>
                  <div className="progress-bar-bg">
                    <div className="progress-bar-fill"
                      style={{ width: `${Math.round((h.weekly_pct ?? 0) * 100)}%` }} />
                  </div>
                </div>
              ))}
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
              <HabitScorecard stats={stats} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
