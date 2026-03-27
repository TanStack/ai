'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type { ChartProps } from '@/lib/reports/types'

const DEFAULT_COLORS = [
  '#06b6d4', // cyan-500
  '#8b5cf6', // violet-500
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#ef4444', // red-500
  '#3b82f6', // blue-500
  '#ec4899', // pink-500
]

export function Chart({
  type,
  data,
  xKey,
  yKey,
  height = 300,
  showLegend,
  showGrid = true,
  showTooltip = true,
  colors = DEFAULT_COLORS,
  animate = true,
}: ChartProps) {
  const yKeys = Array.isArray(yKey) ? yKey : [yKey]
  const showLegendFinal = showLegend ?? yKeys.length > 1

  const commonAxisProps = {
    tick: { fill: 'var(--report-text-muted)', fontSize: 12 },
    axisLine: { stroke: 'var(--report-border)' },
    tickLine: { stroke: 'var(--report-border)' },
  }

  const tooltipStyle = {
    contentStyle: {
      backgroundColor: 'var(--report-card-bg)',
      border: '1px solid var(--report-border)',
      borderRadius: '8px',
      color: 'var(--report-text)',
    },
  }

  if (type === 'pie' || type === 'donut') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey={yKeys[0]}
            nameKey={xKey}
            cx="50%"
            cy="50%"
            innerRadius={type === 'donut' ? '60%' : 0}
            outerRadius="80%"
            paddingAngle={2}
            isAnimationActive={animate}
          >
            {data.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={colors[index % colors.length]}
              />
            ))}
          </Pie>
          {showTooltip && <Tooltip {...tooltipStyle} />}
          {showLegendFinal && (
            <Legend
              wrapperStyle={{ color: 'var(--report-text)' }}
              formatter={(value) => (
                <span style={{ color: 'var(--report-text)' }}>{value}</span>
              )}
            />
          )}
        </PieChart>
      </ResponsiveContainer>
    )
  }

  if (type === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data}>
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--report-border)"
              opacity={0.5}
            />
          )}
          <XAxis dataKey={xKey} {...commonAxisProps} />
          <YAxis {...commonAxisProps} />
          {showTooltip && <Tooltip {...tooltipStyle} />}
          {showLegendFinal && (
            <Legend
              wrapperStyle={{ color: 'var(--report-text)' }}
              formatter={(value) => (
                <span style={{ color: 'var(--report-text)' }}>{value}</span>
              )}
            />
          )}
          {yKeys.map((key, index) => (
            <Bar
              key={key}
              dataKey={key}
              fill={colors[index % colors.length]}
              isAnimationActive={animate}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (type === 'area') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data}>
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--report-border)"
              opacity={0.5}
            />
          )}
          <XAxis dataKey={xKey} {...commonAxisProps} />
          <YAxis {...commonAxisProps} />
          {showTooltip && <Tooltip {...tooltipStyle} />}
          {showLegendFinal && (
            <Legend
              wrapperStyle={{ color: 'var(--report-text)' }}
              formatter={(value) => (
                <span style={{ color: 'var(--report-text)' }}>{value}</span>
              )}
            />
          )}
          {yKeys.map((key, index) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stroke={colors[index % colors.length]}
              fill={colors[index % colors.length]}
              fillOpacity={0.2}
              isAnimationActive={animate}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  // Default: line chart
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        {showGrid && (
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--report-border)"
            opacity={0.5}
          />
        )}
        <XAxis dataKey={xKey} {...commonAxisProps} />
        <YAxis {...commonAxisProps} />
        {showTooltip && <Tooltip {...tooltipStyle} />}
        {showLegendFinal && (
          <Legend
            wrapperStyle={{ color: 'var(--report-text)' }}
            formatter={(value) => (
              <span style={{ color: 'var(--report-text)' }}>{value}</span>
            )}
          />
        )}
        {yKeys.map((key, index) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={colors[index % colors.length]}
            strokeWidth={2}
            dot={false}
            isAnimationActive={animate}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
