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
  errorName?: string
  errorStack?: string
  logs?: Array<string>
  status: 'running' | 'success' | 'error'
}

export default function ExecutionResult({
  result,
  error,
  errorName,
  errorStack,
  logs,
  status,
}: ExecutionResultProps) {
  // Track if user has manually toggled
  const [userControlled, setUserControlled] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const prevStatusRef = useRef(status)

  // Auto-collapse success only — keep errors expanded so the failure is visible
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    if (!userControlled) {
      const wasRunning = prevStatusRef.current === 'running'

      if (wasRunning && status === 'success') {
        timeoutId = setTimeout(() => {
          setIsCollapsed(true)
        }, 3000)
      } else if (status === 'running' || status === 'error') {
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

  const hasContent =
    (logs && logs.length > 0) ||
    error ||
    errorName ||
    errorStack ||
    result !== undefined

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
            ? errorName
              ? `Execution Failed · ${errorName}`
              : 'Execution Failed'
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

          {(error || errorName) && (
            <div className="bg-red-900/50 border border-red-700 rounded p-3 text-sm text-red-200 space-y-2">
              {errorName && (
                <div>
                  <span className="text-red-400/80 text-xs uppercase tracking-wide">
                    Name
                  </span>
                  <div className="font-mono text-red-100">{errorName}</div>
                </div>
              )}
              {error && (
                <div>
                  <span className="text-red-400/80 text-xs uppercase tracking-wide">
                    Message
                  </span>
                  <div className="font-mono text-red-100 whitespace-pre-wrap">
                    {error}
                  </div>
                </div>
              )}
              {errorStack && (
                <div>
                  <span className="text-red-400/80 text-xs uppercase tracking-wide">
                    Stack
                  </span>
                  <pre className="mt-1 font-mono text-[11px] text-red-200/90 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                    {errorStack}
                  </pre>
                </div>
              )}
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
