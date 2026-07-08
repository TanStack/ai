import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import hljs from 'highlight.js/lib/core'
import typescript from 'highlight.js/lib/languages/typescript'
import 'highlight.js/styles/github-dark.css'

// Register TypeScript language
hljs.registerLanguage('typescript', typescript)

// Highlight external_* function calls after hljs processing
function highlightExternalCalls(html: string): string {
  // Match external_functionName patterns (with word boundaries)
  return html.replace(
    /\b(external_\w+)\b/g,
    '<span class="external-fn">$1</span>',
  )
}

interface CodeBlockProps {
  code: string
  language?: string
  title?: string
  status?: 'pending' | 'running' | 'success' | 'error'
  collapsible?: boolean
}

export default function CodeBlock({
  code,
  language = 'typescript',
  title,
  status,
  collapsible = true,
}: CodeBlockProps) {
  // Track if user has manually toggled
  const [userControlled, setUserControlled] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [copied, setCopied] = useState(false)
  const prevStatusRef = useRef(status)

  // Auto-collapse when status changes from running to success/error (with delay)
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    if (!userControlled) {
      const wasRunning =
        prevStatusRef.current === 'running' ||
        prevStatusRef.current === 'pending'
      const isComplete = status === 'success' || status === 'error'

      if (wasRunning && isComplete) {
        // Delay auto-collapse by 3 seconds so user can see the result
        timeoutId = setTimeout(() => {
          setIsCollapsed(true)
        }, 3000)
      } else if (status === 'running' || status === 'pending') {
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

  const highlighted = highlightExternalCalls(
    hljs.highlight(code, { language }).value,
  )

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const statusColors = {
    pending: 'bg-gray-800 border-gray-600',
    running: 'bg-blue-900/30 border-blue-700',
    success: 'bg-green-900/30 border-green-700',
    error: 'bg-red-900/30 border-red-700',
  }

  const statusLabels = {
    pending: 'Pending',
    running: 'Running...',
    success: 'Executed',
    error: 'Error',
  }

  return (
    <div
      className={`rounded-lg border overflow-hidden ${status ? statusColors[status] : 'border-gray-700'}`}
    >
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 text-gray-200 text-sm">
        <div className="flex items-center gap-2">
          {collapsible && (
            <button
              onClick={handleToggle}
              className="p-1 hover:bg-gray-700 rounded transition-colors"
            >
              {isCollapsed ? (
                <ChevronRight size={16} />
              ) : (
                <ChevronDown size={16} />
              )}
            </button>
          )}
          <span className="font-mono">{title || 'Generated Code'}</span>
          {status && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                status === 'running'
                  ? 'bg-blue-600 animate-pulse'
                  : status === 'success'
                    ? 'bg-green-600'
                    : status === 'error'
                      ? 'bg-red-600'
                      : 'bg-gray-600'
              }`}
            >
              {statusLabels[status]}
            </span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="p-1 hover:bg-gray-700 rounded flex items-center gap-1 transition-colors"
          title="Copy code"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>

      {!isCollapsed && (
        <pre className="p-4 overflow-x-auto bg-gray-900 text-sm">
          <code
            className="language-typescript"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </pre>
      )}
    </div>
  )
}
