import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

interface Highlight {
  frequency?: number
  x?: number
  label?: string
  color?: string
}

interface SpectrumPlotProps {
  frequencies: number[]
  magnitudes: number[]
  title?: string
  xMin?: number
  xMax?: number
  yMin?: number
  yMax?: number
  highlights?: Highlight[]
}

export function SpectrumPlot({
  frequencies,
  magnitudes,
  title = 'Frequency Spectrum',
  xMin = 20,
  xMax = 20000,
  yMin,
  yMax,
}: SpectrumPlotProps) {
  // Prepare data for chart - filter to frequency range and downsample if needed
  const data = useMemo(() => {
    const filtered: Array<{ freq: number; mag: number; logFreq: number }> = []
    
    for (let i = 0; i < frequencies.length && i < magnitudes.length; i++) {
      const freq = frequencies[i]
      if (freq >= xMin && freq <= xMax && freq > 0) {
        filtered.push({
          freq,
          mag: magnitudes[i],
          logFreq: Math.log10(freq),
        })
      }
    }
    
    // Downsample if too many points
    const maxPoints = 500
    if (filtered.length > maxPoints) {
      const step = Math.ceil(filtered.length / maxPoints)
      return filtered.filter((_, i) => i % step === 0)
    }
    
    return filtered
  }, [frequencies, magnitudes, xMin, xMax])

  // Calculate y-axis domain
  const yDomain = useMemo(() => {
    if (yMin !== undefined && yMax !== undefined) {
      return [yMin, yMax] as [number, number]
    }
    const mags = data.map(d => d.mag).filter(m => isFinite(m))
    const min = Math.min(...mags)
    const max = Math.max(...mags)
    return [
      yMin ?? Math.floor(min / 10) * 10,
      yMax ?? Math.ceil(max / 10) * 10,
    ] as [number, number]
  }, [data, yMin, yMax])

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
              domain={yDomain}
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
              formatter={(value: number) => [`${value.toFixed(1)} dB`, 'Magnitude']}
            />
            <Line
              type="monotone"
              dataKey="mag"
              stroke="#06b6d4"
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
            />
            {/* Reference line at -60dB */}
            <ReferenceLine y={-60} stroke="#4b5563" strokeDasharray="3 3" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 text-xs text-gray-500 text-center">
        Frequency (Hz) - Log Scale
      </div>
    </div>
  )
}

