import type { TileResult } from '../types'

export function ListViz({ result, accent }: { result: TileResult; accent?: string }) {
  const rows = Array.isArray(result.data) ? result.data : []
  if (rows.length === 0) return <div className="text-gray-500 text-xs p-2">No data</div>

  // Auto-detect label and value keys
  const first = rows[0]
  if (!first || typeof first !== 'object') {
    return (
      <div className="space-y-1 overflow-auto max-h-full p-2">
        {rows.map((item, i) => (
          <div key={i} className="text-xs text-gray-300">{String(item)}</div>
        ))}
      </div>
    )
  }

  const entries = Object.entries(first as Record<string, unknown>)
  const labelKey = entries.find(([, v]) => typeof v === 'string')?.[0] ?? entries[0]?.[0]
  const valueKey = entries.find(([k, v]) => typeof v === 'number' && k !== labelKey)?.[0]

  return (
    <div className="space-y-1 overflow-auto max-h-full p-1">
      {rows.map((row, i) => {
        const obj = row as Record<string, unknown>
        const label = labelKey ? String(obj[labelKey] ?? '') : String(i + 1)
        const value = valueKey ? obj[valueKey] : undefined

        return (
          <div key={i} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5">
            <span className="text-[10px] text-gray-500 w-4 shrink-0 text-right">{i + 1}</span>
            <span className="flex-1 text-xs text-gray-200 truncate">{label}</span>
            {value !== undefined && (
              <span className="text-xs font-mono font-medium shrink-0" style={{ color: accent ?? '#d1d5db' }}>
                {typeof value === 'number' ? value.toLocaleString() : String(value)}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
