import { For, Show } from 'solid-js'
import { useStyles } from '../../styles/use-styles'
import { formatTimestamp } from '../utils'
import { ToolCallDisplay } from './ToolCallDisplay'
import { ChunksCollapsible } from './ChunksCollapsible'
import type { Message } from '../../store/ai-store'
import type { Component } from 'solid-js'

interface MessageCardProps {
  message: Message
}

export const MessageCard: Component<MessageCardProps> = (props) => {
  const styles = useStyles()
  // Access message through props directly for proper SolidJS reactivity
  const msg = () => props.message

  // Check if message is from client (explicitly marked) or server (default)
  const isClientMessage = () => msg().source === 'client'

  // Determine card class based on role and source
  const getCardClass = () => {
    const base = styles().conversationDetails.messageCard
    if (msg().role === 'user') {
      return `${base} ${styles().conversationDetails.messageCardUser}`
    }
    // For assistant messages: client if explicitly marked, otherwise server
    if (isClientMessage()) {
      return `${base} ${styles().conversationDetails.messageCardClient}`
    }
    return `${base} ${styles().conversationDetails.messageCardServer}`
  }

  // Check if this is a non-user message (needs source banner and content wrapper)
  const isSourcedMessage = () => msg().role !== 'user'

  return (
    <div class={getCardClass()}>
      {/* Source indicator banner at top of card */}
      <Show when={isSourcedMessage()}>
        <div
          class={`${styles().conversationDetails.sourceBanner} ${
            isClientMessage()
              ? styles().conversationDetails.sourceBannerClient
              : styles().conversationDetails.sourceBannerServer
          }`}
        >
          <span class={styles().conversationDetails.sourceBannerIcon}>
            {isClientMessage() ? '📱' : '☁️'}
          </span>
          <span class={styles().conversationDetails.sourceBannerText}>
            {isClientMessage() ? 'Client Message' : 'Server Message'}
          </span>
        </div>
      </Show>
      {/* Content wrapper with padding */}
      <div
        class={
          isSourcedMessage()
            ? styles().conversationDetails.messageCardContent
            : ''
        }
      >
        <div class={styles().conversationDetails.messageHeader}>
          <div
            class={
              msg().role === 'user'
                ? styles().conversationDetails.avatarUser
                : isClientMessage()
                  ? styles().conversationDetails.avatarClient
                  : styles().conversationDetails.avatarServer
            }
          >
            {msg().role === 'user' ? 'U' : msg().role === 'tool' ? '🔧' : '🤖'}
          </div>
          <div class={styles().conversationDetails.roleLabel}>
            <div
              class={
                msg().role === 'user'
                  ? styles().conversationDetails.roleLabelUser
                  : isClientMessage()
                    ? styles().conversationDetails.roleLabelClient
                    : styles().conversationDetails.roleLabelServer
              }
            >
              {msg().role}
            </div>
          </div>
          <div class={styles().conversationDetails.timestamp}>
            {formatTimestamp(msg().timestamp)}
          </div>
          {/* Per-message token usage */}
          <Show when={msg().usage}>
            <div class={styles().conversationDetails.messageUsage}>
              <span class={styles().conversationDetails.messageUsageIcon}>
                🎯
              </span>
              <span>{msg().usage?.promptTokens.toLocaleString()} in</span>
              <span>•</span>
              <span>{msg().usage?.completionTokens.toLocaleString()} out</span>
            </div>
          </Show>
        </div>

        {/* Thinking content (for extended thinking models) */}
        <Show when={msg().thinkingContent}>
          <details class={styles().conversationDetails.thinkingDetails}>
            <summary class={styles().conversationDetails.thinkingSummary}>
              💭 Thinking...
            </summary>
            <div class={styles().conversationDetails.thinkingContent}>
              {msg().thinkingContent}
            </div>
          </details>
        </Show>

        <div class={styles().conversationDetails.messageContent}>
          {msg().content}
        </div>

        {/* Tool Calls Display */}
        <Show when={msg().toolCalls && msg().toolCalls!.length > 0}>
          <div class={styles().conversationDetails.toolCallsContainer}>
            <For each={msg().toolCalls}>
              {(tool) => <ToolCallDisplay tool={tool} />}
            </For>
          </div>
        </Show>

        {/* Chunks Display (for client conversations with server chunks) */}
        <Show when={msg().chunks && msg().chunks!.length > 0}>
          <ChunksCollapsible chunks={msg().chunks!} />
        </Show>
      </div>
    </div>
  )
}
