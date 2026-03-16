/**
 * HabitTracker — checkbox grid + add/edit form.
 *
 * Uses spacer columns between weeks for clean visual separation.
 * Custom styled checkboxes (not native inputs).
 */

import { useState, useMemo, useRef, useImperativeHandle, forwardRef } from 'react'

const DAY_ABBR = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function daysInMonth(month, year) {
  return new Date(year, month, 0).getDate()
}

function formatDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function buildWeeks(month, year) {
  const numDays = daysInMonth(month, year)
  const weeks = []
  let currentWeek = null

  for (let d = 1; d <= numDays; d++) {
    const dt = new Date(year, month - 1, d)
    const dow = dt.getDay()
    const mondayIndex = dow === 0 ? 6 : dow - 1
    const isWeekend = dow === 0 || dow === 6

    if (mondayIndex === 0 || d === 1) {
      currentWeek = { label: `W${weeks.length + 1}`, cols: [] }
      weeks.push(currentWeek)
    }

    currentWeek.cols.push({ day: d, dayAbbr: DAY_ABBR[mondayIndex], isWeekend })
  }

  return weeks
}

function EditableName({ value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef(null)

  const startEdit = () => {
    setDraft(value)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const commit = () => {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onSave(trimmed)
  }

  if (editing) {
    return (
      <input ref={inputRef} className="edit-name-input" value={draft}
        onChange={e => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        autoFocus />
    )
  }
  return <span className="editable-name" onClick={startEdit} title="Click to rename">{value}</span>
}

function EditableFreq({ value, onSave }) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <select className="edit-freq-select" value={value}
        onChange={e => { onSave(Number(e.target.value)); setEditing(false) }}
        onBlur={() => setEditing(false)} autoFocus>
        {[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n}/wk</option>)}
      </select>
    )
  }
  return <span className="habit-freq" onClick={() => setEditing(true)} title="Click to change">{value}/wk</span>
}

function prettyDateLabel(value) {
  // Input is ISO yyyy-mm-dd; show compact label.
  if (!value || value.length < 10) return 'start'
  const mm = value.slice(5, 7)
  const dd = value.slice(8, 10)
  return `${dd}/${mm}`
}

function EditableStartDate({ value, onSave }) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <input
        type="date"
        className="edit-date-input"
        value={value}
        onChange={e => { onSave(e.target.value); setEditing(false) }}
        onBlur={() => setEditing(false)}
        autoFocus
      />
    )
  }

  return (
    <span className="habit-start-date" onClick={() => setEditing(true)} title="Click to change start date">
      {prettyDateLabel(value)}
    </span>
  )
}

const CheckIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"
    strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const HabitTracker = forwardRef(function HabitTracker({
  habits, logs, stats, month, year, onToggle, onCreate, onUpdate, onLifecycle, onDelete,
}, ref) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newFreq, setNewFreq] = useState(5)
  const [newStartDate, setNewStartDate] = useState(formatDate(year, month, new Date().getDate()))
  const [menuState, setMenuState] = useState(null)
  const wrapperRef = useRef(null)
  const gridRef = useRef(null)

  useImperativeHandle(ref, () => ({
    scrollToToday() {
      const grid = gridRef.current
      if (!grid) return
      const todayCell = grid.querySelector('[data-today="true"]')
      if (!todayCell) return
      const gridRect = grid.getBoundingClientRect()
      const cellRect = todayCell.getBoundingClientRect()
      const scrollLeft = cellRect.left - gridRect.left + grid.scrollLeft - gridRect.width / 2 + cellRect.width / 2
      grid.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' })
    },
    openAddModal() {
      setShowAddModal(true)
    }
  }))

  const openMenu = (habitId, e) => {
    const btn = e.currentTarget
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const wrapperRect = wrapper.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    setMenuState({
      habitId,
      top: btnRect.bottom - wrapperRect.top + 6,
      left: btnRect.left - wrapperRect.left,
    })
  }
  const closeMenu = () => setMenuState(null)

  const today = new Date().toISOString().slice(0, 10)
  const weeks = useMemo(() => buildWeeks(month, year), [month, year])

  const handleAddSubmit = (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    onCreate({ name: newName.trim(), frequency: newFreq, start_date: newStartDate, end_date: null })
    setNewName('')
    setNewFreq(5)
    setShowAddModal(false)
  }

  // Build flat column list with spacer markers
  const columns = []
  weeks.forEach((w, wi) => {
    if (wi > 0) columns.push({ type: 'spacer', key: `sp-${wi}` })
    w.cols.forEach(c => columns.push({ type: 'day', ...c, week: w.label }))
  })

  return (
    <div className="habit-wrapper" ref={wrapperRef}>
      <div className="habit-grid" ref={gridRef}>
        <table className="habit-table">
          <colgroup>
            <col className="col-name" />
            {columns.map((c, i) =>
              c.type === 'spacer'
                ? <col key={c.key} className="col-spacer" />
                : <col key={c.day} className="col-day" />
            )}
            <col className="col-pct" />
          </colgroup>

          <thead>
            {/* Row 1: Week labels */}
            <tr className="row-weeks">
              <th className="th-name"></th>
              {(() => {
                const cells = []
                weeks.forEach((w, wi) => {
                  if (wi > 0) cells.push(<th key={`sp-${wi}`} className="th-spacer"></th>)
                  cells.push(
                    <th key={w.label} colSpan={w.cols.length} className="th-week">
                      {w.label}
                    </th>
                  )
                })
                return cells
              })()}
              <th className="th-pct"></th>
            </tr>

            {/* Row 2: Day letters + numbers combined */}
            <tr className="row-days">
              <th className="th-name">Habit</th>
              {columns.map((c, i) =>
                c.type === 'spacer'
                  ? <th key={c.key} className="th-spacer"></th>
                  : <th key={c.day}
                      className={c.isWeekend ? 'th-day weekend-th' : 'th-day'}
                      data-today={formatDate(year, month, c.day) === today ? 'true' : undefined}>
                      <span className="day-letter">{c.dayAbbr}</span>
                      <span className="day-num">{c.day}</span>
                    </th>
              )}
              <th className="th-pct">%</th>
            </tr>
          </thead>

          <tbody>
            {habits.map(habit => {
              const habitLogs = new Set(logs[habit.id] || [])
              const habitStat = stats?.habits?.find(s => s.id === habit.id)
              const pct = habitStat ? Math.round(habitStat.percentage * 100) : 0

              return (
                <tr key={habit.id}>
                  <td className="td-name">
                    <div className="habit-name-cell">
                      <EditableName value={habit.name}
                        onSave={n => onUpdate(habit.id, { name: n })} />
                      <EditableFreq value={habit.frequency}
                        onSave={f => onUpdate(habit.id, { frequency: f })} />
                      <span
                        className="habit-actions-btn"
                        onClick={e => menuState?.habitId === habit.id ? closeMenu() : openMenu(habit.id, e)}
                        title="Habit controls"
                      >
                        ⋯
                      </span>
                    </div>
                  </td>
                  {columns.map((c, i) => {
                    if (c.type === 'spacer') {
                      return <td key={c.key} className="td-spacer"></td>
                    }
                    const dateStr = formatDate(year, month, c.day)
                    const checked = habitLogs.has(dateStr)
                    const isFuture = dateStr > today
                    const beforeStart = dateStr < habit.start_date
                    const disabled = isFuture || beforeStart

                    let cls = 'habit-check-cell'
                    if (checked) cls += ' checked'
                    if (disabled) cls += ' disabled'

                    return (
                      <td key={c.day} className="td-day">
                        <div className={cls}
                          onClick={disabled ? undefined : () => onToggle(habit.id, dateStr)}>
                          {CheckIcon}
                        </div>
                      </td>
                    )
                  })}
                  <td className="td-pct">{pct}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {habits.length === 0 && (
          <p style={{ color: 'var(--text-dim)', fontSize: 13, padding: '20px 0' }}>
            No habits yet — add one below!
          </p>
        )}
      </div>

      {/* Popover rendered outside the table so it's not clipped by sticky/overflow */}
      {menuState && (() => {
        const habit = habits.find(h => h.id === menuState.habitId)
        if (!habit) return null
        return (
          <>
            <div className="habit-popover-backdrop" onClick={closeMenu} />
            <div className="habit-actions-popover"
              style={{ top: menuState.top, left: menuState.left }}>
              <div className="habit-actions-row">
                <span className="popover-label">Start date</span>
                <EditableStartDate value={habit.start_date}
                  onSave={d => { onUpdate(habit.id, { start_date: d }); closeMenu() }} />
              </div>
              <div className="habit-actions-buttons">
                {habit.status !== 'paused' && (
                  <button type="button" className="popover-btn"
                    onClick={() => { onLifecycle(habit.id, 'pause'); closeMenu() }}>
                    Pause
                  </button>
                )}
                {habit.status === 'paused' && (
                  <button type="button" className="popover-btn"
                    onClick={() => { onLifecycle(habit.id, 'resume'); closeMenu() }}>
                    Resume
                  </button>
                )}
                {habit.status !== 'stopped' && (
                  <button type="button" className="popover-btn stop"
                    onClick={() => { onLifecycle(habit.id, 'stop'); closeMenu() }}>
                    Stop
                  </button>
                )}
              </div>
              <button type="button" className="popover-delete"
                onClick={() => { if (confirm(`Delete "${habit.name}"?`)) { onDelete(habit.id); closeMenu() } }}>
                Delete habit
              </button>
            </div>
          </>
        )
      })()}

      {showAddModal && (
        <>
          <div className="habit-popover-backdrop" onClick={() => setShowAddModal(false)} />
          <div className="add-habit-modal">
            <div className="add-modal-header">
              <span>New Habit</span>
              <button type="button" className="add-modal-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <form className="add-modal-form" onSubmit={handleAddSubmit}>
              <label className="add-modal-label">
                Name
                <input type="text" placeholder="e.g. Gym, Reading..." value={newName}
                  onChange={e => setNewName(e.target.value)} autoFocus />
              </label>
              <label className="add-modal-label">
                Frequency
                <select value={newFreq} onChange={e => setNewFreq(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n} days/week</option>)}
                </select>
              </label>
              <label className="add-modal-label">
                Start date
                <input type="date" value={newStartDate} onChange={e => setNewStartDate(e.target.value)} />
              </label>
              <button type="submit" className="btn" disabled={!newName.trim()}>Add Habit</button>
            </form>
          </div>
        </>
      )}
    </div>
  )
})

export default HabitTracker
