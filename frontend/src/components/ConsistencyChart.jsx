/**
 * ConsistencyChart — line graph showing daily consistency % over the month.
 *
 * Uses recharts (a React wrapper around D3). Key concepts:
 *   ResponsiveContainer → makes the chart fill its parent
 *   LineChart + Line    → the actual line graph
 *   XAxis, YAxis        → axes with labels
 *   Tooltip             → hover popup showing exact value
 *   Area (fill)         → shaded area under the line
 */

import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'

export default function ConsistencyChart({ dailyRates }) {
  const data = dailyRates.map(d => ({
    date: d.date.slice(8),  // "2026-03-05" → "05"
    pct: Math.round(d.rate * 100),
  }))

  if (data.length === 0) {
    return <p style={{ color: 'var(--text-dim)', fontSize: 13, padding: 20 }}>No data yet</p>
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4caf50" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#4caf50" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
        <XAxis dataKey="date" tick={{ fill: '#777', fontSize: 10 }} axisLine={{ stroke: '#252525' }} />
        <YAxis domain={[0, 100]} tick={{ fill: '#777', fontSize: 10 }} axisLine={{ stroke: '#252525' }}
          tickFormatter={v => `${v}%`} />
        <Tooltip
          contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
          labelFormatter={l => `Day ${l}`}
          formatter={v => [`${v}%`, 'Consistency']}
        />
        <Area type="monotone" dataKey="pct" stroke="#4caf50" strokeWidth={2}
          fill="url(#greenGrad)" dot={{ r: 2, fill: '#4caf50' }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
