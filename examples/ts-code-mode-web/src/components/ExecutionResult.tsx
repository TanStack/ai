import {
  CheckCircle,
  XCircle,
  Terminal,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'

interface ExecutionResultProps {
  result?: unknown
  error?: string
  logs?: string[]
  status: 'running' | 'success' | 'error'
}

export default function ExecutionResult({
  result,
  error,
  logs,
  status,
}: ExecutionResultProps) {
  // Track if user has manually toggled
  const [userControlled, setUserControlled] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const prevStatusRef = useRef(status)

  // Auto-collapse when status changes from running to complete (with delay)
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    if (!userControlled) {
      const wasRunning = prevStatusRef.current === 'running'
      const isComplete = status === 'success' || status === 'error'

      if (wasRunning && isComplete) {
        // Delay auto-collapse by 3 seconds so user can see the result
        timeoutId = setTimeout(() => {
          setIsCollapsed(true)
        }, 3000)
      } else if (status === 'running') {
        setIsCollapsed(false)
      }
    }
    prevStatusRef.current = status

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [status, userControlled])

  const handleToggle = () => {
    setUserControlled(true)
    setIsCollapsed(!isCollapsed)
  }

  const hasContent = (logs && logs.length > 0) || error || result !== undefined

  return (
    <div
      className={`rounded-lg border overflow-hidden ${
        status === 'error'
          ? 'bg-red-900/30 border-red-700'
          : status === 'success'
            ? 'bg-green-900/30 border-green-700'
            : 'bg-blue-900/30 border-blue-700'
      }`}
    >
      {/* Header - always visible */}
      <div
        className={`flex items-center gap-2 px-4 py-3 ${hasContent ? 'cursor-pointer hover:bg-white/5' : ''}`}
        onClick={hasContent ? handleToggle : undefined}
      >
        {hasContent && (
          <button className="p-0.5 hover:bg-white/10 rounded transition-colors">
            {isCollapsed ? (
              <ChevronRight size={16} className="text-gray-400" />
            ) : (
              <ChevronDown size={16} className="text-gray-400" />
            )}
          </button>
        )}
        {status === 'error' ? (
          <XCircle className="text-red-400" size={20} />
        ) : status === 'success' ? (
          <CheckCircle className="text-green-400" size={20} />
        ) : (
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        )}
        <span
          className={`font-medium ${
            status === 'error'
              ? 'text-red-300'
              : status === 'success'
                ? 'text-green-300'
                : 'text-blue-300'
          }`}
        >
          {status === 'error'
            ? 'Execution Failed'
            : status === 'success'
              ? 'Execution Complete'
              : 'Executing...'}
        </span>
      </div>

      {/* Collapsible content */}
      {!isCollapsed && hasContent && (
        <div className="px-4 pb-4 space-y-3">
          {logs && logs.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
                <Terminal size={14} />
                Console Output
              </div>
              <div
                className="bg-gray-950 text-gray-100 rounded p-3 text-sm font-mono max-h-32 overflow-y-auto"
                style={{
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(75, 85, 99, 0.5) transparent',
                }}
              >
                {logs.map((log, i) => (
                  <div key={i} className="text-gray-300">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-900/50 border border-red-700 rounded p-3 text-sm text-red-200">
              <strong>Error:</strong> {error}
            </div>
          )}

          {result !== undefined && status === 'success' && (
            <div>
              <div className="text-sm text-gray-400 mb-1">Result:</div>
              <pre
                className="bg-gray-950 border border-gray-700 rounded p-3 text-sm text-gray-200 overflow-x-auto max-h-64 overflow-y-auto"
                style={{
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(75, 85, 99, 0.5) transparent',
                }}
              >
                {typeof result === 'string'
                  ? result
                  : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
