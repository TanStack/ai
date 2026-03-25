import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { AgentSessionSummary } from './types'

export function TileMemory({
  session,
  accentColor,
}: {
  session: AgentSessionSummary | null
  accentColor: string
}) {
  if (!session) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <p className="text-xs">No session data — tile hasn't been queried yet</p>
      </div>
    )
  }

  const entries = Object.entries(session.memory)
  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <p className="text-xs">Agent memory is empty</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
      {entries.map(([key, value]) => (
        <MemoryEntry key={key} memKey={key} value={value} accentColor={accentColor} />
      ))}
    </div>
  )
}

function MemoryEntry({ memKey, value, accentColor }: { memKey: string; value: unknown; accentColor: string }) {
  const [expanded, setExpanded] = useState(false)
  const isComplex = typeof value === 'object' && value !== null

  return (
    <div className="rounded border border-gray-700/40 bg-gray-800/30 px-2 py-1">
      <div className="flex items-center gap-1.5">
        {isComplex && (
          <button onClick={() => setExpanded(!expanded)} className="text-gray-500 hover:text-gray-300 shrink-0">
            {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </button>
        )}
        <span className="text-[10px] font-mono font-medium shrink-0" style={{ color: accentColor }}>
          {memKey}
        </span>
        {!isComplex && (
          <span className="text-[10px] text-gray-300 flex-1 truncate ml-1">
            {String(value)}
          </span>
        )}
        {isComplex && !expanded && (
          <span className="text-[10px] text-gray-500 flex-1 truncate ml-1">
            {Array.isArray(value) ? `[${value.length} items]` : `{${Object.keys(value as object).length} keys}`}
          </span>
        )}
      </div>
      {expanded && isComplex && (
        <pre className="mt-1 text-[9px] text-gray-400 overflow-x-auto max-h-24 overflow-y-auto font-mono whitespace-pre-wrap border-t border-gray-700/50 pt-1">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  )
}
