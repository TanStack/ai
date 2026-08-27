import { Show, createEffect, createSignal } from 'solid-js'

export interface ThinkingPartProps {
  /** The thinking content to render */
  content: string
  /** Base class applied to thinking parts */
  class?: string
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
 *   class="p-4 rounded bg-gray-100"
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
 *         class="px-5 py-3 rounded-2xl bg-gray-800/50"
 *       />
 *     )
 *   }}
 * />
 * ```
 */
export function ThinkingPart(props: ThinkingPartProps) {
  const [isCollapsed, setIsCollapsed] = createSignal(false)

  // Auto-collapse when thinking completes
  createEffect(() => {
    if (props.isComplete) {
      setIsCollapsed(true)
    }
  })

  return (
    <div
      class={props.class || undefined}
      data-part-type="thinking"
      data-part-content
    >
      <button
        onClick={() => setIsCollapsed(!isCollapsed())}
        class="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-300 transition-colors mb-2"
        aria-expanded={!isCollapsed()}
        aria-label={isCollapsed() ? 'Expand thinking' : 'Collapse thinking'}
      >
        <span class="text-xs">{isCollapsed() ? '▶' : '▼'}</span>
        <span class="italic">💭 Thinking...</span>
        <Show when={props.isComplete}>
          <span class="text-xs text-gray-500">(complete)</span>
        </Show>
      </button>
      <Show when={!isCollapsed()}>
        <div class="text-gray-300 whitespace-pre-wrap font-mono text-sm">
          {props.content}
        </div>
      </Show>
    </div>
  )
}
