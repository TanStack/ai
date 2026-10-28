import { on } from 'remix/ui'
import type { Handle } from 'remix/ui'

export interface ThinkingPartProps {
  content: string
  class?: string
  isComplete?: boolean
}

export function ThinkingPart(handle: Handle<ThinkingPartProps>) {
  let collapsed = false
  let sawComplete = false

  return () => {
    if (handle.props.isComplete && !sawComplete) {
      collapsed = true
      sawComplete = true
    }

    return (
      <div
        class={handle.props.class || undefined}
        data-part-content
        data-part-type="thinking"
      >
        <button
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand thinking' : 'Collapse thinking'}
          mix={[
            on('click', () => {
              collapsed = !collapsed
              void handle.update()
            }),
          ]}
        >
          <span>{collapsed ? '>' : 'v'}</span>
          <span>Thinking...</span>
          {handle.props.isComplete ? <span>(complete)</span> : null}
        </button>
        {collapsed ? null : <div>{handle.props.content}</div>}
      </div>
    )
  }
}
