/**
 * WeeklyBarChart — bar graph showing average consistency per week of the month.
 *
 * Each bar = one week (W1, W2, ...). Height = average consistency % across all habits.
 * Uses recharts BarChart.
 */

import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Cell, LabelList,
} from 'recharts'

function barColor(pct) {
  if (pct >= 80) return '#4caf50'
  if (pct >= 50) return '#ffa726'
  return '#ef5350'
}

export default function WeeklyBarChart({ weekAverages }) {
  const data = (weekAverages || []).map(w => ({
    week: w.label,
    pct: Math.round(w.avg * 100),
  }))

  if (data.length === 0) {
    return <p style={{ color: 'var(--text-dim)', fontSize: 13, padding: 20 }}>No data yet</p>
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
        <XAxis
          dataKey="week"
          tick={{ fill: '#999', fontSize: 12, fontWeight: 600 }}
          axisLine={{ stroke: '#252525' }}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: '#777', fontSize: 10 }}
          axisLine={{ stroke: '#252525' }}
          tickFormatter={v => `${v}%`}
        />
        <Tooltip
          contentStyle={{
            background: '#1a1a1a', border: '1px solid #333',
            borderRadius: 8, fontSize: 12,
          }}
          formatter={v => [`${v}%`, 'Consistency']}
          cursor={{ fill: 'rgba(76, 175, 80, 0.08)' }}
        />
        <Bar dataKey="pct" radius={[6, 6, 0, 0]} maxBarSize={48}>
          <LabelList
            dataKey="pct"
            position="top"
            formatter={v => `${v}%`}
            style={{ fill: '#ccc', fontSize: 11, fontWeight: 600 }}
          />
          {data.map((entry, i) => (
            <Cell key={i} fill={barColor(entry.pct)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
