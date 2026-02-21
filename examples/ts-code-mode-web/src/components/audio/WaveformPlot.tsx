import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface WaveformPlotProps {
  samples: number[]
  sampleRate: number
  title?: string
  startTime?: number
  endTime?: number
}

export function WaveformPlot({
  samples,
  sampleRate,
  title = 'Waveform',
  startTime = 0,
}: WaveformPlotProps) {
  // Prepare data for chart
  const data = useMemo(() => {
    const result: Array<{ time: number; amplitude: number }> = []
    
    // Calculate time for each sample
    for (let i = 0; i < samples.length; i++) {
      result.push({
        time: startTime + i / sampleRate,
        amplitude: samples[i],
      })
    }
    
    return result
  }, [samples, sampleRate, startTime])

  // Calculate duration
  const duration = samples.length / sampleRate

  return (
    <div className="bg-gray-900/50 rounded-lg border border-cyan-500/20 p-4">
      <h3 className="text-sm font-medium text-cyan-300 mb-4">{title}</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="time"
              type="number"
              domain={[startTime, startTime + duration]}
              stroke="#6b7280"
              fontSize={10}
              tickFormatter={(value) => `${value.toFixed(2)}s`}
            />
            <YAxis
              domain={[-1, 1]}
              stroke="#6b7280"
              fontSize={10}
              ticks={[-1, -0.5, 0, 0.5, 1]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '0.5rem',
                fontSize: '0.75rem',
              }}
              labelFormatter={(value: number) => `${value.toFixed(4)}s`}
              formatter={(value: number) => [value.toFixed(4), 'Amplitude']}
            />
            <Line
              type="monotone"
              dataKey="amplitude"
              stroke="#10b981"
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 text-xs text-gray-500 text-center">
        Time (seconds) • Duration: {duration.toFixed(2)}s
      </div>
    </div>
  )
}

