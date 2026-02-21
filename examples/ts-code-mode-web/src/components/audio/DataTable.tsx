interface Column {
  key: string
  label?: string
}

interface DataTableProps {
  data: Array<Record<string, unknown>>
  title?: string
  columns?: Column[]
}

export function DataTable({ data, title, columns }: DataTableProps) {
  if (data.length === 0) {
    return (
      <div className="bg-gray-900/50 rounded-lg border border-cyan-500/20 p-4">
        {title && <h3 className="text-sm font-medium text-cyan-300 mb-4">{title}</h3>}
        <p className="text-gray-500 text-sm">No data</p>
      </div>
    )
  }

  // Derive columns from data if not provided
  const derivedColumns: Column[] = columns || Object.keys(data[0]).map(key => ({ key, label: key }))

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '-'
    if (typeof value === 'number') {
      if (Number.isInteger(value)) return value.toString()
      return value.toFixed(2)
    }
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  return (
    <div className="bg-gray-900/50 rounded-lg border border-cyan-500/20 p-4 overflow-hidden">
      {title && <h3 className="text-sm font-medium text-cyan-300 mb-4">{title}</h3>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              {derivedColumns.map(col => (
                <th
                  key={col.key}
                  className="text-left py-2 px-3 text-gray-400 font-medium"
                >
                  {col.label || col.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50">
                {derivedColumns.map(col => (
                  <td key={col.key} className="py-2 px-3 text-gray-300">
                    {formatValue(row[col.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

