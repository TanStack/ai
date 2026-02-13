import { useEffect, useState } from 'preact/hooks'

export interface ThinkingPartProps {
  /** The thinking content to render */
  content: string
  /** Base className applied to thinking parts */
  className?: string
  /** Whether thinking is complete (has text content after) */
  isComplete?: boolean
}

/**
 * ThinkingPart component - renders thinking/reasoning content
 *
 * This component displays the model's internal reasoning process,
 * typically shown in a collapsed or expandable format to distinguish
 * it from the final response. It automatically collapses when thinking
 * is complete.
 *
 * @example Standalone usage
 * ```tsx
 * <ThinkingPart
 *   content="Let me think about this step by step..."
 *   className="p-4 rounded bg-gray-100"
 * />
 * ```
 *
 * @example Usage in partRenderers
 * ```tsx
 * <ChatMessage
 *   message={message}
 *   partRenderers={{
 *     thinking: ({ content, isComplete }) => (
 *       <ThinkingPart
 *         content={content}
 *         isComplete={isComplete}
 *         className="px-5 py-3 rounded-2xl bg-gray-800/50"
 *       />
 *     )
 *   }}
 * />
 * ```
 */
export function ThinkingPart({
  content,
  className = '',
  isComplete = false,
}: ThinkingPartProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Auto-collapse when thinking completes
  useEffect(() => {
    if (isComplete) {
      setIsCollapsed(true)
    }
  }, [isComplete])

  return (
    <div
      className={className || undefined}
      data-part-type="thinking"
      data-part-content
    >
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-300 transition-colors mb-2"
        aria-expanded={!isCollapsed}
        aria-label={isCollapsed ? 'Expand thinking' : 'Collapse thinking'}
      >
        <span className="text-xs">{isCollapsed ? '▶' : '▼'}</span>
        <span className="italic">💭 Thinking...</span>
        {isComplete && (
          <span className="text-xs text-gray-500">(complete)</span>
        )}
      </button>
      {!isCollapsed && (
        <div className="text-gray-300 whitespace-pre-wrap font-mono text-sm">
          {content}
        </div>
      )}
    </div>
  )
}
