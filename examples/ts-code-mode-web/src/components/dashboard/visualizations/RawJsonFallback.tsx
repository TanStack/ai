import type { TileResult } from '../types'

export function RawJsonFallback({ result }: { result: TileResult }) {
  return (
    <pre className="text-[10px] text-gray-400 overflow-auto max-h-full p-2 font-mono whitespace-pre-wrap">
      {JSON.stringify(result.data, null, 2)}
    </pre>
  )
}
