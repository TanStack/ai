import { For, Show } from 'solid-js'
import { useStyles } from '../../styles/use-styles'
import { MessageGroup } from './MessageGroup'
import type { Component } from 'solid-js'
import type { Chunk, Message } from '../../store/ai-store'

interface ChunksTabProps {
  chunks: Array<Chunk>
  messages?: Array<Message>
}

export const ChunksTab: Component<ChunksTabProps> = (props) => {
  const styles = useStyles()

  // Create a map of messageId to usage for quick lookup
  const usageByMessageId = () => {
    const map = new Map<string, Message['usage']>()
    props.messages?.forEach((msg) => {
      if (msg.usage) {
        map.set(msg.id, msg.usage)
      }
    })
    return map
  }

  const groupedChunks = () => {
    const groups = new Map<string, Array<Chunk>>()

    props.chunks.forEach((chunk) => {
      const key = chunk.messageId || 'no-message-id'
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(chunk)
    })

    return Array.from(groups.entries())
  }

  // Calculate total raw chunks (sum of all chunkCounts)
  const totalRawChunks = () =>
    props.chunks.reduce((sum, c) => sum + (c.chunkCount || 1), 0)

  return (
    <Show
      when={props.chunks.length > 0}
      fallback={
        <div class={styles().conversationDetails.noChunks}>No chunks yet</div>
      }
    >
      <div class={styles().conversationDetails.streamContainer}>
        {/* Stream Header */}
        <div class={styles().conversationDetails.streamHeader}>
          <div class={styles().conversationDetails.streamHeaderRow}>
            <div class={styles().conversationDetails.streamTitle}>
              Stream Responses
            </div>
            <div
              class={`${styles().conversationDetails.chunkBadge} ${styles().conversationDetails.chunkBadgeCount}`}
            >
              {totalRawChunks()} chunks · {groupedChunks().length} messages
            </div>
          </div>
          <div class={styles().conversationDetails.streamSubtitle}>
            Grouped by message ID
          </div>
        </div>

        {/* Message Groups */}
        <div class={styles().conversationDetails.messageGroups}>
          <For each={groupedChunks()}>
            {([messageId, chunks], groupIndex) => (
              <MessageGroup
                messageId={messageId}
                chunks={chunks}
                groupIndex={groupIndex()}
                usage={usageByMessageId().get(messageId)}
              />
            )}
          </For>
        </div>
      </div>
    </Show>
  )
}
