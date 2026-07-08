import { useState, useEffect, useRef } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Terminal,
  Zap,
  AlertCircle,
  AlertTriangle,
  MessageSquare,
  Info,
} from 'lucide-react'

// Custom event types
export interface VMEvent {
  id: string
  eventType: string
  data: unknown
  timestamp: number
}

interface JavaScriptVMProps {
  events: Array<VMEvent>
  isExecuting?: boolean
}

export default function JavaScriptVM({
  events,
  isExecuting,
}: JavaScriptVMProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [userControlled, setUserControlled] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const prevExecutingRef = useRef(isExecuting)

  // Auto-collapse when execution completes (with delay)
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    if (!userControlled) {
      const wasExecuting = prevExecutingRef.current
      const isComplete = !isExecuting

      if (wasExecuting && isComplete && events.length > 0) {
        // Delay auto-collapse by 3 seconds so user can see the events
        timeoutId = setTimeout(() => {
          setIsCollapsed(true)
        }, 3000)
      } else if (isExecuting) {
        setIsCollapsed(false)
      }
    }
    prevExecutingRef.current = isExecuting

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [isExecuting, userControlled, events.length])

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (scrollRef.current && !isCollapsed) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events, isCollapsed])

  const handleToggle = () => {
    setUserControlled(true)
    setIsCollapsed(!isCollapsed)
  }

  if (events.length === 0 && !isExecuting) {
    return null
  }

  const getEventIcon = (eventType: string, data: unknown) => {
    if (eventType === 'code_mode:execution_started') {
      return <Terminal className="w-3.5 h-3.5 text-cyan-400" />
    }
    if (eventType === 'code_mode:console') {
      const level = (data as { level?: string }).level || 'log'
      switch (level) {
        case 'error':
          return <AlertCircle className="w-3.5 h-3.5 text-red-400" />
        case 'warn':
          return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
        case 'info':
          return <Info className="w-3.5 h-3.5 text-blue-400" />
        default:
          return <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
      }
    }
    if (eventType === 'code_mode:external_call') {
      return <Zap className="w-3.5 h-3.5 text-amber-400" />
    }
    if (eventType === 'code_mode:external_result') {
      return <Zap className="w-3.5 h-3.5 text-green-400" />
    }
    if (eventType === 'code_mode:external_error') {
      return <AlertCircle className="w-3.5 h-3.5 text-red-400" />
    }
    return <Terminal className="w-3.5 h-3.5 text-cyan-400" />
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    })
  }

  const renderEventContent = (event: VMEvent) => {
    const { eventType, data } = event
    const typedData = data as Record<string, unknown>

    if (eventType === 'code_mode:execution_started') {
      const codeLength = typedData.codeLength as number
      return (
        <span className="text-cyan-300">
          <span className="text-gray-500">⚡</span> Executing {codeLength}{' '}
          characters of TypeScript...
        </span>
      )
    }

    if (eventType === 'code_mode:external_call') {
      const funcName = typedData.function as string
      return (
        <span className="text-amber-300">
          <span className="text-gray-500">{'>'}</span> {funcName}
          <span className="text-gray-500">(</span>
          <span className="text-cyan-300 text-xs">
            {JSON.stringify(typedData.args)}
          </span>
          <span className="text-gray-500">)</span>
        </span>
      )
    }

    if (eventType === 'code_mode:external_result') {
      const funcName = typedData.function as string
      const result = typedData.result
      const resultStr = JSON.stringify(result)
      const truncated =
        resultStr.length > 60 ? resultStr.slice(0, 60) + '...' : resultStr
      return (
        <span className="text-green-300">
          <span className="text-gray-500">{'<'}</span> {funcName}
          <span className="text-gray-500"> → </span>
          <span className="text-green-400 text-xs">{truncated}</span>
        </span>
      )
    }

    if (eventType === 'code_mode:external_error') {
      const funcName = typedData.function as string
      const error = typedData.error as string
      return (
        <span className="text-red-300">
          <span className="text-gray-500">{'!'}</span> {funcName}
          <span className="text-gray-500"> → </span>
          <span className="text-red-400 text-xs">{error}</span>
        </span>
      )
    }

    if (eventType === 'code_mode:console') {
      const message = typedData.message as string
      const level = (typedData.level as string) || 'log'
      const colorClass =
        level === 'error'
          ? 'text-red-300'
          : level === 'warn'
            ? 'text-yellow-300'
            : level === 'info'
              ? 'text-blue-300'
              : 'text-gray-300'
      return (
        <span className={colorClass}>
          <span className="text-gray-500">📝</span> {message}
        </span>
      )
    }

    // Default for unknown events
    return (
      <span className="text-gray-400">
        {eventType}: {JSON.stringify(data)}
      </span>
    )
  }

  return (
    <div className="rounded-lg border border-cyan-500/30 bg-gray-900/80 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-gray-800/80 cursor-pointer hover:bg-gray-800 transition-colors"
        onClick={handleToggle}
      >
        <button className="p-0.5">
          {isCollapsed ? (
            <ChevronRight size={16} className="text-gray-400" />
          ) : (
            <ChevronDown size={16} className="text-gray-400" />
          )}
        </button>
        <Terminal className="w-4 h-4 text-cyan-400" />
        <span className="text-sm font-medium text-cyan-300">JavaScript VM</span>
        {isExecuting && (
          <div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin ml-1" />
        )}
        <span className="text-xs text-gray-500 ml-auto">
          {events.length} event{events.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Events list */}
      {!isCollapsed && (
        <div
          ref={scrollRef}
          className="max-h-48 overflow-y-auto px-3 py-2 space-y-1 font-mono text-xs"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(75, 85, 99, 0.5) transparent',
          }}
        >
          {events.length === 0 && isExecuting ? (
            <div className="flex items-center gap-2 text-gray-500 py-2">
              <div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <span>Waiting for external calls...</span>
            </div>
          ) : (
            events.map((event) => <EventItem key={event.id} event={event} />)
          )}
        </div>
      )}
    </div>
  )

  function EventItem({ event }: { event: VMEvent }) {
    const [expanded, setExpanded] = useState(false)

    return (
      <div className="group">
        <div
          className="flex items-start gap-2 py-1 px-2 rounded hover:bg-white/5 cursor-pointer transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          {getEventIcon(event.eventType, event.data)}
          <div className="flex-1 min-w-0 truncate">
            {renderEventContent(event)}
          </div>
          <span className="text-[10px] text-gray-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {formatTime(event.timestamp)}
          </span>
        </div>

        {expanded && (
          <div className="ml-6 mt-1 mb-2 p-2 bg-black/30 rounded text-gray-400 overflow-x-auto">
            <pre className="text-[10px]">
              {JSON.stringify(event.data, null, 2)}
            </pre>
          </div>
        )}
      </div>
    )
  }
}
