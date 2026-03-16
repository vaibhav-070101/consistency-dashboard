/**
 * Header — branding + month/year navigation.
 * Month and year are large clickable text that open native select dropdowns.
 * The <select> is visually hidden but overlays the text, so clicking the
 * text opens the native scroll picker (especially nice on mobile).
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function Header({ month, year, onMonthChange, onYearChange, userName, onLogout }) {
  const currentYear = new Date().getFullYear()
  const years = []
  for (let y = currentYear - 3; y <= currentYear + 2; y++) years.push(y)

  return (
    <div className="header">
      <div className="header-brand">
        <div className="logo-mark">
          <svg viewBox="0 0 64 64" fill="none" aria-label="Consistency Dashboard logo">
            <rect x="4" y="4" width="56" height="56" rx="16" fill="#17472a" />

            {/* Mountain peaks — simple zigzag */}
            <path d="M14 42 L24 22 L32 34 L42 18 L50 42"
              stroke="#8edba8" strokeWidth="3.5"
              fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="brand-words">
          <span className="brand-sub">THE</span>
          <span className="brand-main">Consistency Dashboard</span>
        </div>
      </div>

      <div className="header-right">
        {userName && (
          <div className="user-badge">
            <span className="user-name">{userName}</span>
            <button className="logout-btn" onClick={onLogout} title="Sign out">✕</button>
          </div>
        )}
      <div className="date-picker">
        <div className="date-picker-item">
          <span className="date-display month-display">{MONTHS[month - 1]}</span>
          <select
            className="date-hidden-select"
            value={month}
            onChange={e => onMonthChange(Number(e.target.value))}
          >
            {MONTHS.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
        </div>
        <div className="date-picker-item">
          <span className="date-display year-display">{year}</span>
          <select
            className="date-hidden-select"
            value={year}
            onChange={e => onYearChange(Number(e.target.value))}
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>
      </div>
    </div>
  )
}
