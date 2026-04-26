import { Show } from 'solid-js'
import { useStyles } from '../../styles/use-styles'
import { formatDuration } from '../utils'
import type { Component } from 'solid-js'
import type { Conversation } from '../../store/ai-context'

interface ConversationHeaderProps {
  conversation: Conversation
}

export const ConversationHeader: Component<ConversationHeaderProps> = (
  props,
) => {
  const styles = useStyles()
  const conv = () => props.conversation

  const iterationCount = () => conv().iterationCount ?? conv().iterations.length
  const totalDuration = () => {
    if (!conv().completedAt) return undefined
    return conv().completedAt! - conv().startedAt
  }

  const totalMessages = () => conv().messages.length

  const totalToolCalls = () => {
    let count = 0
    for (const iter of conv().iterations) {
      if (iter.finishReason === 'tool_calls') count++
    }
    return count
  }

  // Sum usage across all iterations
  const totalUsage = () => {
    if (conv().usage) return conv().usage
    if (conv().iterations.length === 0) return undefined
    let promptTokens = 0
    let completionTokens = 0
    for (const iter of conv().iterations) {
      if (iter.usage) {
        promptTokens += iter.usage.promptTokens
        completionTokens += iter.usage.completionTokens
      }
    }
    if (promptTokens === 0 && completionTokens === 0) return undefined
    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    }
  }

  return (
    <div class={styles().panelHeader}>
      <div class={styles().conversationDetails.headerContent}>
        <div class={styles().conversationDetails.headerRow}>
          <div class={styles().conversationDetails.headerLabel}>
            {conv().label}
          </div>
          <div
            class={`${styles().conversationDetails.statusBadge} ${
              conv().status === 'active'
                ? styles().conversationDetails.statusActive
                : conv().status === 'completed'
                  ? styles().conversationDetails.statusCompleted
                  : styles().conversationDetails.statusError
            }`}
          >
            {conv().status}
          </div>
        </div>
        <div class={styles().conversationDetails.metaInfo}>
          {totalDuration() !== undefined && formatDuration(totalDuration())}
          <Show when={iterationCount() > 0}>
            {totalDuration() !== undefined && ' · '}
            {iterationCount()}{' '}
            {iterationCount() === 1 ? 'iteration' : 'iterations'}
          </Show>
          <Show when={totalMessages() > 0}>
            {(totalDuration() !== undefined || iterationCount() > 0) && ' · '}
            {totalMessages()} {totalMessages() === 1 ? 'message' : 'messages'}
          </Show>
          <Show when={totalToolCalls() > 0}>
            {' · '}
            {totalToolCalls()} tool {totalToolCalls() === 1 ? 'call' : 'calls'}
          </Show>
        </div>
        <Show when={totalUsage()}>
          <div class={styles().conversationDetails.usageInfo}>
            <span class={styles().conversationDetails.usageLabel}>Tokens:</span>
            <span>{totalUsage()?.promptTokens.toLocaleString() || 0} in</span>
            <span>·</span>
            <span>
              {totalUsage()?.completionTokens.toLocaleString() || 0} out
            </span>
            <span>·</span>
            <span class={styles().conversationDetails.usageBold}>
              {totalUsage()?.totalTokens.toLocaleString() || 0} total
            </span>
          </div>
        </Show>
      </div>
    </div>
  )
}
