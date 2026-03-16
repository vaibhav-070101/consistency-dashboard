/**
 * StatsCards — 4 summary cards at the top of the dashboard.
 *
 * Shows: weekly consistency, monthly consistency, total habits, best streak.
 */

export default function StatsCards({ stats }) {
  if (!stats) return null

  let bestLabel = '—'
  let bestHabitName = ''
  let bestDays = 0
  for (const h of stats.habits) {
    const days = h.frequency === 7 ? h.streak_weeks : h.streak_weeks * 7
    if (days > bestDays) {
      bestDays = days
      bestLabel = h.streak_label
      bestHabitName = h.name
    }
  }

  return (
    <div className="stats-row">
      <div className="stat-card">
        <div className="stat-value">{Math.round(stats.overall_weekly * 100)}%</div>
        <div className="stat-label">This Week</div>
      </div>
      <div className="stat-card">
        <div className="stat-value">{Math.round(stats.overall_monthly * 100)}%</div>
        <div className="stat-label">This Month</div>
      </div>
      <div className="stat-card">
        <div className="stat-value">{stats.habits.length}</div>
        <div className="stat-label">Active Habits</div>
      </div>
      <div className="stat-card">
        <div className="stat-value" style={{ fontSize: bestLabel.length > 4 ? 20 : undefined }}>
          {bestLabel}
        </div>
        <div className="stat-label">
          Best Streak{bestHabitName ? ` · ${bestHabitName}` : ''}
        </div>
      </div>
    </div>
  )
}
