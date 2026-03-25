import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react'
import type { AgentActivityEvent } from './types'
import { TILE_COLORS, ORCHESTRATOR_COLORS } from './types'

export function ActivityDrawer({
  events,
  onClear,
}: {
  events: AgentActivityEvent[]
  onClear: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current && expanded) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [events, expanded])

  return (
    <div className={`border-t border-gray-800 bg-gray-900/80 ${expanded ? 'h-[40vh]' : ''} flex flex-col shrink-0`}>
      {/* Collapse bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between px-3 py-1.5 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronUp size={12} className="text-gray-400" />}
          <span className="text-xs text-gray-400 font-medium">Activity Log</span>
          {events.length > 0 && (
            <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded-full">
              {events.length}
            </span>
          )}
        </div>
        {events.length > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClear()
            }}
            className="text-[10px] text-gray-500 hover:text-gray-300"
          >
            Clear
          </button>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div ref={containerRef} className="flex-1 overflow-y-auto px-3 pb-2 space-y-1">
          {events.length === 0 ? (
            <div className="flex items-center justify-center py-4 text-gray-500 text-xs">
              No events yet
            </div>
          ) : (
            events.map((event) => {
              const colors = event.tileId
                ? TILE_COLORS[event.tileId] ?? ORCHESTRATOR_COLORS
                : ORCHESTRATOR_COLORS
              return <DrawerEntry key={event.id} event={event} colors={colors} />
            })
          )}
        </div>
      )}
    </div>
  )
}

function DrawerEntry({
  event,
  colors,
}: {
  event: AgentActivityEvent
  colors: { bg: string; text: string; border: string }
}) {
  const [expanded, setExpanded] = useState(false)
  const hasData = event.data !== undefined
  const isMemory = event.type.includes('memory')
  const isComplete = event.type.includes('complete')

  const time = new Date(event.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  return (
    <div className={`rounded-md border ${colors.border} ${colors.bg} px-2.5 py-1 text-xs`}>
      <div className="flex items-center gap-2">
        <span className="text-gray-500 font-mono text-[10px] shrink-0">{time}</span>
        {event.tileName ? (
          <span className={`${colors.text} font-medium text-[10px] px-1.5 py-0.5 rounded-full ${colors.bg} border ${colors.border} shrink-0`}>
            {event.tileName}
          </span>
        ) : (
          <span className="text-violet-300 font-medium text-[10px] px-1.5 py-0.5 rounded-full bg-violet-900/20 border border-violet-500/30 shrink-0">
            Orchestrator
          </span>
        )}
        <span className={`${isMemory ? 'text-yellow-300' : isComplete ? 'text-green-300' : 'text-gray-300'} flex-1 truncate`}>
          {event.message}
        </span>
        {hasData && (
          <button onClick={() => setExpanded(!expanded)} className="text-gray-500 hover:text-gray-300 shrink-0">
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        )}
      </div>
      {expanded && hasData && (
        <pre className="mt-1.5 text-[10px] text-gray-400 overflow-x-auto max-h-24 overflow-y-auto font-mono whitespace-pre-wrap border-t border-gray-700/50 pt-1.5">
          {JSON.stringify(event.data, null, 2)}
        </pre>
      )}
    </div>
  )
}
