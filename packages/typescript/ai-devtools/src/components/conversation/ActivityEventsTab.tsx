import { For, Show } from 'solid-js'
import { useStyles } from '../../styles/use-styles'
import type { Component } from 'solid-js'
import type { ActivityEvent } from '../../store/ai-context'

interface ActivityEventsTabProps {
  title: string
  events: Array<ActivityEvent>
}

export const ActivityEventsTab: Component<ActivityEventsTabProps> = (props) => {
  const styles = useStyles()

  const formattedTimestamp = (timestamp: number) =>
    new Date(timestamp).toLocaleTimeString()

  return (
    <Show
      when={props.events.length > 0}
      fallback={
        <div class={styles().conversationDetails.noChunks}>No events yet</div>
      }
    >
      <div class={styles().conversationDetails.streamContainer}>
        <div class={styles().conversationDetails.streamHeader}>
          <div class={styles().conversationDetails.streamHeaderRow}>
            <div class={styles().conversationDetails.streamTitle}>
              {props.title}
            </div>
            <div
              class={`${styles().conversationDetails.chunkBadge} ${styles().conversationDetails.chunkBadgeCount}`}
            >
              {props.events.length} events
            </div>
          </div>
          <div class={styles().conversationDetails.streamSubtitle}>
            Activity event log
          </div>
        </div>
        <div class={styles().conversationDetails.messageGroups}>
          <For each={props.events}>
            {(event) => (
              <div class={styles().detailSection}>
                <div class={styles().detailSectionHeader}>
                  {event.name} · {formattedTimestamp(event.timestamp)}
                </div>
                <pre class={styles().conversationDetails.jsonPreview}>
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  )
}
