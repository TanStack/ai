import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { TileResult } from '../types'

const COLORS = ['#34d399', '#fbbf24', '#38bdf8', '#fb7185', '#a78bfa', '#f472b6', '#4ade80']

function detectKeys(data: Array<Record<string, unknown>>) {
  const first = data[0]
  if (!first) return { labelKey: '', valueKeys: [] as string[] }

  const entries = Object.entries(first)
  const labelKey = entries.find(([, v]) => typeof v === 'string')?.[0] ?? entries[0]?.[0] ?? ''
  const valueKeys = entries.filter(([k, v]) => typeof v === 'number' && k !== labelKey).map(([k]) => k)
  return { labelKey, valueKeys }
}

export function BarChartViz({ result, accent }: { result: TileResult; accent?: string }) {
  const rows = Array.isArray(result.data) ? result.data as Array<Record<string, unknown>> : []
  if (rows.length === 0) return <div className="text-gray-500 text-xs p-2">No data</div>

  const { labelKey, valueKeys } = detectKeys(rows)
  if (valueKeys.length === 0) return <div className="text-gray-500 text-xs p-2">No numeric columns</div>

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        <XAxis dataKey={labelKey} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={50} />
        <Tooltip
          contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, fontSize: 11 }}
          labelStyle={{ color: '#d1d5db' }}
        />
        {valueKeys.map((key, ki) => (
          <Bar key={key} dataKey={key} radius={[3, 3, 0, 0]}>
            {rows.map((_, i) => (
              <Cell key={i} fill={valueKeys.length === 1 ? (accent ?? COLORS[i % COLORS.length]) : COLORS[ki % COLORS.length]} />
            ))}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
