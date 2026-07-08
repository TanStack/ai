'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
} from 'recharts'
import type { SparklineProps } from '@/lib/reports/types'

export function Sparkline({
  data,
  type = 'line',
  color = '#06b6d4',
  height = 32,
  width = 100,
  showEndValue = false,
}: SparklineProps) {
  // Transform data to recharts format
  const chartData = data.map((value, index) => ({ index, value }))
  const lastValue = data[data.length - 1]

  const formatValue = (val: number) => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`
    return val.toFixed(0)
  }

  const renderChart = () => {
    if (type === 'bar') {
      return (
        <BarChart data={chartData}>
          <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} />
        </BarChart>
      )
    }

    if (type === 'area') {
      return (
        <AreaChart data={chartData}>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            fill={color}
            fillOpacity={0.3}
            strokeWidth={1.5}
          />
        </AreaChart>
      )
    }

    return (
      <LineChart data={chartData}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <div style={{ width, height }}>
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
      {showEndValue && (
        <span className="text-sm font-medium" style={{ color }}>
          {formatValue(lastValue)}
        </span>
      )}
    </div>
  )
}
