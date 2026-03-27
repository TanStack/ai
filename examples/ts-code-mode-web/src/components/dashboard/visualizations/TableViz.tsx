import type { TileResult } from '../types'

export function TableViz({ result }: { result: TileResult }) {
  // If the data is a string, render it as text
  if (typeof result.data === 'string') {
    return (
      <div className="overflow-auto max-h-full p-2">
        <p className="text-xs text-gray-300 whitespace-pre-wrap">{result.data}</p>
      </div>
    )
  }

  const rows = Array.isArray(result.data) ? result.data : [result.data]
  if (rows.length === 0) return <div className="text-gray-500 text-xs p-2">No data</div>

  // Filter out non-object rows and skip objects with parseError
  const objectRows = rows.filter(
    (r): r is Record<string, unknown> =>
      r != null && typeof r === 'object' && !('parseError' in r),
  )
  if (objectRows.length === 0) {
    return (
      <pre className="text-[10px] text-gray-400 overflow-auto max-h-full p-2 font-mono whitespace-pre-wrap">
        {JSON.stringify(result.data, null, 2)}
      </pre>
    )
  }

  const columns = result.columns ?? Object.keys(objectRows[0])
  if (columns.length === 0) return <div className="text-gray-500 text-xs p-2">No columns detected</div>

  return (
    <div className="overflow-auto max-h-full">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-700/50">
            {columns.map((col) => (
              <th key={col} className="text-left px-2 py-1.5 text-gray-400 font-medium whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {objectRows.map((row, i) => (
            <tr key={i} className="border-b border-gray-800/30 hover:bg-white/5">
              {columns.map((col) => {
                const val = row[col]
                return (
                  <td key={col} className="px-2 py-1.5 text-gray-300 whitespace-nowrap">
                    {val === null || val === undefined ? '-' : typeof val === 'number' ? val.toLocaleString() : String(val)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
