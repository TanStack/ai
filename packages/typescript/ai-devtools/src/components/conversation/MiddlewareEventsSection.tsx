import { For, Show } from 'solid-js'
import { useStyles } from '../../styles/use-styles'
import type { MiddlewareEvent } from '../../store/ai-store'
import type { Component } from 'solid-js'

interface MiddlewareEventsSectionProps {
  events: Array<MiddlewareEvent>
}

export const MiddlewareEventsSection: Component<
  MiddlewareEventsSectionProps
> = (props) => {
  const styles = useStyles()
  const s = () => styles().iterationTimeline

  const getSuffix = (event: MiddlewareEvent): string | null => {
    if (event.wasDropped) return 'DROP'
    if (event.hookName === 'onChunk' && event.hasTransform) return 'TRANSFORM'
    if (event.hookName === 'onConfig' && event.hasTransform) return 'TRANSFORM'
    if (
      event.hookName === 'onBeforeToolCall' &&
      event.hasTransform
    )
      return 'DECISION'
    return null
  }

  return (
    <Show when={props.events.length > 0}>
      <div class={s().middlewareContainer}>
        <For each={props.events}>
          {(event) => {
            const isTransform = () => event.hasTransform
            const suffix = () => getSuffix(event)
            const duration = () =>
              event.duration !== undefined ? `${event.duration}ms` : null

            return (
              <span
                class={`${s().middlewarePill} ${isTransform() ? s().middlewarePillTransform : ''}`}
              >
                {event.middlewareName}
                <span style={{ opacity: '0.6' }}>&middot;</span>
                {event.hookName}
                <Show when={duration()}>
                  <span style={{ opacity: '0.6' }}>&middot;</span>
                  {duration()}
                </Show>
                <Show when={suffix()}>
                  <span class={s().middlewarePillSuffix}>{suffix()}</span>
                </Show>
              </span>
            )
          }}
        </For>
      </div>
    </Show>
  )
}
