/**
 * HabitScorecard — compact analytics panel showing per-habit breakdown.
 *
 * For each habit shows: completed/expected, monthly %, weekly %, streak.
 * Also highlights the best and worst performing habit this month.
 */

export default function HabitScorecard({ stats }) {
  if (!stats || stats.habits.length === 0) {
    return <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>No data yet</p>
  }

  const habits = stats.habits
  const best = habits.reduce((a, b) => a.percentage > b.percentage ? a : b)
  const worst = habits.reduce((a, b) => a.percentage < b.percentage ? a : b)
  const totalCompleted = habits.reduce((s, h) => s + h.completed, 0)
  const totalExpected = habits.reduce((s, h) => s + h.expected, 0)

  return (
    <div className="scorecard">
      <div className="scorecard-summary">
        <div className="scorecard-kpi">
          <span className="scorecard-kpi-value">{totalCompleted}</span>
          <span className="scorecard-kpi-label">Total Check-ins</span>
        </div>
        <div className="scorecard-kpi">
          <span className="scorecard-kpi-value">{totalExpected}</span>
          <span className="scorecard-kpi-label">Expected</span>
        </div>
        <div className="scorecard-kpi">
          <span className="scorecard-kpi-value" style={{ color: '#4caf50' }}>
            {totalExpected > 0 ? Math.round(totalCompleted / totalExpected * 100) : 0}%
          </span>
          <span className="scorecard-kpi-label">Hit Rate</span>
        </div>
      </div>

      <div className="scorecard-highlight">
        <div className="scorecard-badge good">
          <span className="scorecard-badge-label">Best</span>
          <span className="scorecard-badge-name">{best.name}</span>
          <span className="scorecard-badge-pct">{Math.round(best.percentage * 100)}%</span>
        </div>
        {worst.id !== best.id && (
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
          {habits.map(h => (
            <tr key={h.id}>
              <td className="scorecard-habit-name">{h.name}</td>
              <td>{h.completed}/{h.expected}</td>
              <td style={{ color: pctColor(h.percentage) }}>
                {Math.round(h.percentage * 100)}%
              </td>
              <td style={{ color: pctColor(h.weekly_pct ?? 0) }}>
                {Math.round((h.weekly_pct ?? 0) * 100)}%
              </td>
              <td className="scorecard-streak">
                {h.streak_label !== '—' ? `🔥 ${h.streak_label}` : '—'}
              </td>
            </tr>
          ))}
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
