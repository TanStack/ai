import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { AgentActivityEvent } from './types'
import { TILE_COLORS, ORCHESTRATOR_COLORS } from './types'

export function TileLogs({ events }: { events: AgentActivityEvent[] }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [events])

  if (events.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <p className="text-xs">No events yet</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
      {events.map((event) => {
        const colors = event.tileId
          ? TILE_COLORS[event.tileId] ?? ORCHESTRATOR_COLORS
          : ORCHESTRATOR_COLORS
        return <LogEntry key={event.id} event={event} colors={colors} />
      })}
    </div>
  )
}

function LogEntry({
  event,
  colors,
}: {
  event: AgentActivityEvent
  colors: { bg: string; text: string; border: string }
}) {
  const [expanded, setExpanded] = useState(false)
  const hasData = event.data !== undefined
  const isMemory = event.type.includes('memory')

  const time = new Date(event.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  return (
    <div className={`rounded border ${colors.border} ${colors.bg} px-2 py-1 text-[10px]`}>
      <div className="flex items-center gap-1.5">
        <span className="text-gray-500 font-mono shrink-0">{time}</span>
        <span className={`${isMemory ? 'text-yellow-300' : colors.text} flex-1 truncate`}>
          {event.message}
        </span>
        {hasData && (
          <button onClick={() => setExpanded(!expanded)} className="text-gray-500 hover:text-gray-300 shrink-0">
            {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </button>
        )}
      </div>
      {expanded && hasData && (
        <pre className="mt-1 text-[9px] text-gray-400 overflow-x-auto max-h-16 overflow-y-auto font-mono whitespace-pre-wrap border-t border-gray-700/50 pt-1">
          {JSON.stringify(event.data, null, 2)}
        </pre>
      )}
    </div>
  )
}
