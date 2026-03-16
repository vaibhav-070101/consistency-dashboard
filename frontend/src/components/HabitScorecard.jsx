/**
 * HabitScorecard — compact analytics panel showing per-habit breakdown.
 * Excludes paused/stopped habits from KPIs and highlights.
 */

export default function HabitScorecard({ stats, habits: rawHabits, logs }) {
  if (!stats || stats.habits.length === 0) {
    return <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>No data yet</p>
  }

  const allHabits = stats.habits
  const habitMap = {}
  if (rawHabits) rawHabits.forEach(h => { habitMap[h.id] = h })

  const activeHabits = allHabits.filter(h => {
    const raw = habitMap[h.id]
    return !raw || raw.status === 'active'
  })

  const best = activeHabits.length > 0
    ? activeHabits.reduce((a, b) => a.percentage > b.percentage ? a : b)
    : null
  const worst = activeHabits.length > 0
    ? activeHabits.reduce((a, b) => a.percentage < b.percentage ? a : b)
    : null

  // Count distinct days where at least one active habit was completed
  const activeDates = new Set()
  if (logs) {
    const activeIds = new Set(activeHabits.map(h => h.id))
    for (const [hid, dates] of Object.entries(logs)) {
      if (activeIds.has(Number(hid))) {
        dates.forEach(d => activeDates.add(d))
      }
    }
  }
  const totalCompleted = activeDates.size
  const activeDays = activeHabits.length > 0
    ? Math.max(...activeHabits.map(h => h.expected > 0 ? h.expected : 0))
    : 0
  const avgPct = activeHabits.length > 0
    ? activeHabits.filter(h => h.expected > 0).reduce((s, h) => s + h.percentage, 0) /
      Math.max(1, activeHabits.filter(h => h.expected > 0).length)
    : 0

  return (
    <div className="scorecard">
      <div className="scorecard-summary">
        <div className="scorecard-kpi">
          <span className="scorecard-kpi-value">{totalCompleted}</span>
          <span className="scorecard-kpi-label">Days Tracked</span>
        </div>
        <div className="scorecard-kpi">
          <span className="scorecard-kpi-value">{activeDays}</span>
          <span className="scorecard-kpi-label">Active Days</span>
        </div>
        <div className="scorecard-kpi">
          <span className="scorecard-kpi-value" style={{ color: '#4caf50' }}>
            {Math.round(avgPct * 100)}%
          </span>
          <span className="scorecard-kpi-label">Hit Rate</span>
        </div>
      </div>

      <div className="scorecard-highlight">
        {best && (
          <div className="scorecard-badge good">
            <span className="scorecard-badge-label">Best</span>
            <span className="scorecard-badge-name">{best.name}</span>
            <span className="scorecard-badge-pct">{Math.round(best.percentage * 100)}%</span>
          </div>
        )}
        {worst && worst.id !== best?.id && (
          <div className="scorecard-badge warn">
            <span className="scorecard-badge-label">Needs Work</span>
            <span className="scorecard-badge-name">{worst.name}</span>
            <span className="scorecard-badge-pct">{Math.round(worst.percentage * 100)}%</span>
          </div>
        )}
      </div>

      <table className="scorecard-table">
        <thead>
          <tr>
            <th>Habit</th>
            <th>Done</th>
            <th>Month</th>
            <th>Week</th>
            <th>Streak</th>
          </tr>
        </thead>
        <tbody>
          {allHabits.map(h => {
            const raw = habitMap[h.id]
            const isPaused = raw?.status === 'paused'
            return (
              <tr key={h.id} style={isPaused ? { opacity: 0.45 } : undefined}>
                <td className="scorecard-habit-name">
                  {h.name}
                  {isPaused && <span style={{ fontSize: 9, color: 'var(--orange)', marginLeft: 6 }}>PAUSED</span>}
                </td>
                <td>{h.completed}/{h.expected}</td>
                <td style={{ color: isPaused ? 'var(--text-dim)' : pctColor(h.percentage) }}>
                  {isPaused ? '—' : `${Math.round(h.percentage * 100)}%`}
                </td>
                <td style={{ color: isPaused ? 'var(--text-dim)' : pctColor(h.weekly_pct ?? 0) }}>
                  {isPaused ? '—' : `${Math.round((h.weekly_pct ?? 0) * 100)}%`}
                </td>
                <td className="scorecard-streak">
                  {isPaused ? '—' : h.streak_label !== '—' ? `🔥 ${h.streak_label}` : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function pctColor(pct) {
  if (pct >= 0.8) return '#4caf50'
  if (pct >= 0.5) return '#ffa726'
  return '#ef5350'
}
