import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

interface Series {
  label: string
  frequencies: number[]
  magnitudes: number[]
  color?: string
}

interface ComparisonPlotProps {
  series: Series[]
  title?: string
  xMin?: number
  xMax?: number
}

const DEFAULT_COLORS = ['#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6']

export function ComparisonPlot({
  series,
  title = 'Spectrum Comparison',
  xMin = 20,
  xMax = 20000,
}: ComparisonPlotProps) {
  // Prepare data - merge all series into one dataset
  const data = useMemo(() => {
    // Build a map of frequency -> values
    const freqMap = new Map<number, Record<string, number>>()
    
    for (const s of series) {
      for (let i = 0; i < s.frequencies.length && i < s.magnitudes.length; i++) {
        const freq = s.frequencies[i]
        if (freq >= xMin && freq <= xMax && freq > 0) {
          if (!freqMap.has(freq)) {
            freqMap.set(freq, { freq, logFreq: Math.log10(freq) })
          }
          freqMap.get(freq)![s.label] = s.magnitudes[i]
        }
      }
    }
    
    // Convert to array and sort by frequency
    let result = Array.from(freqMap.values()).sort((a, b) => a.freq - b.freq)
    
    // Downsample if needed
    const maxPoints = 500
    if (result.length > maxPoints) {
      const step = Math.ceil(result.length / maxPoints)
      result = result.filter((_, i) => i % step === 0)
    }
    
    return result
  }, [series, xMin, xMax])

  // Log scale tick values
  const logTicks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].filter(
    t => t >= xMin && t <= xMax
  )

  return (
    <div className="bg-gray-900/50 rounded-lg border border-cyan-500/20 p-4">
      <h3 className="text-sm font-medium text-cyan-300 mb-4">{title}</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="logFreq"
              type="number"
              domain={[Math.log10(xMin), Math.log10(xMax)]}
              ticks={logTicks.map(t => Math.log10(t))}
              tickFormatter={(value) => {
                const freq = Math.pow(10, value)
                return freq >= 1000 ? `${(freq / 1000).toFixed(0)}k` : freq.toFixed(0)
              }}
              stroke="#6b7280"
              fontSize={10}
            />
            <YAxis
              stroke="#6b7280"
              fontSize={10}
              tickFormatter={(value) => `${value}dB`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '0.5rem',
                fontSize: '0.75rem',
              }}
              labelFormatter={(_, payload) => {
                if (payload?.[0]?.payload?.freq) {
                  return `${payload[0].payload.freq.toFixed(1)} Hz`
                }
                return ''
              }}
              formatter={(value: number, name: string) => [`${value.toFixed(1)} dB`, name]}
            />
            <Legend />
            {series.map((s, i) => (
              <Line
                key={s.label}
                type="monotone"
                dataKey={s.label}
                stroke={s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 text-xs text-gray-500 text-center">
        Frequency (Hz) - Log Scale
      </div>
    </div>
  )
}

