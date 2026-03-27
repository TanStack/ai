import type { TileResult } from '../types'

export function MetricViz({ result, accent }: { result: TileResult; accent?: string }) {
  const data = result.data as Record<string, unknown> | undefined
  if (!data || typeof data !== 'object') return <div className="text-gray-500 text-xs p-2">No data</div>

  // Try to find the main metric value
  const entries = Object.entries(data)
  const numericEntries = entries.filter(([, v]) => typeof v === 'number')
  const mainEntry = numericEntries[0]

  if (!mainEntry) {
    // If no numeric value, show the first value as a big string
    const firstEntry = entries[0]
    if (!firstEntry) return <div className="text-gray-500 text-xs p-2">No data</div>
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1">
        <div className="text-2xl font-bold text-white">{String(firstEntry[1])}</div>
        <div className="text-xs text-gray-400">{firstEntry[0]}</div>
      </div>
    )
  }

  const [label, value] = mainEntry
  const delta = data.delta ?? data.change ?? data.growth
  const deltaNum = typeof delta === 'number' ? delta : typeof delta === 'string' ? parseFloat(delta) : null

  return (
    <div className="flex flex-col items-center justify-center h-full gap-1">
      <div className="text-3xl font-bold" style={{ color: accent ?? '#fff' }}>
        {typeof value === 'number' ? value.toLocaleString() : String(value)}
      </div>
      <div className="text-xs text-gray-400">{label}</div>
      {deltaNum !== null && !isNaN(deltaNum) && (
        <div className={`text-sm font-medium ${deltaNum >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {deltaNum >= 0 ? '\u2191' : '\u2193'} {Math.abs(deltaNum).toFixed(1)}%
        </div>
      )}
      {result.summary && (
        <div className="text-[10px] text-gray-500 mt-1 text-center px-2">{result.summary}</div>
      )}
    </div>
  )
}
