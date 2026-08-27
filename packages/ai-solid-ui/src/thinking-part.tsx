import { Show, createEffect, createSignal } from 'solid-js'

export interface ThinkingPartProps {
  /** The thinking content to render */
  content: string
  /** Base class applied to thinking parts */
  class?: string
  /** Whether thinking is complete (has text content after) */
  isComplete?: boolean
}

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
