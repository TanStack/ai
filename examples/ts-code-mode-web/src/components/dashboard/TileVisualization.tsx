import type { TileResult } from './types'
import { TableViz } from './visualizations/TableViz'
import { BarChartViz } from './visualizations/BarChartViz'
import { LineChartViz } from './visualizations/LineChartViz'
import { MetricViz } from './visualizations/MetricViz'
import { ListViz } from './visualizations/ListViz'
import { RawJsonFallback } from './visualizations/RawJsonFallback'

export function TileVisualization({
  result,
  isLoading,
  accent,
}: {
  result: TileResult | null
  isLoading: boolean
  accent?: string
}) {
  if (isLoading && !result) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="w-5 h-5 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />
          <span className="text-xs text-gray-500">Querying agent...</span>
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <p className="text-xs">Ask a question to activate this tile</p>
        </div>
      </div>
    )
  }

  const overlay = isLoading ? (
    <div className="absolute inset-0 bg-gray-900/40 flex items-center justify-center z-10 rounded-b-lg">
      <div className="w-4 h-4 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />
    </div>
  ) : null

  return (
    <div className="flex-1 min-h-0 relative flex flex-col">
      {overlay}
      {result.title && (
        <div className="px-2 pt-1.5 pb-0.5 text-[11px] font-medium text-gray-300">{result.title}</div>
      )}
      {result.summary && (
        <div className="px-2 pb-1 text-[10px] text-gray-500">{result.summary}</div>
      )}
      <div className="flex-1 min-h-0">
        <VizRenderer result={result} accent={accent} />
      </div>
    </div>
  )
}

function VizRenderer({ result, accent }: { result: TileResult; accent?: string }) {
  switch (result.display) {
    case 'table':
      return <TableViz result={result} />
    case 'bar_chart':
      return <BarChartViz result={result} accent={accent} />
    case 'line_chart':
      return <LineChartViz result={result} accent={accent} />
    case 'metric':
      return <MetricViz result={result} accent={accent} />
    case 'list':
      return <ListViz result={result} accent={accent} />
    default:
      return <RawJsonFallback result={result} />
  }
}
