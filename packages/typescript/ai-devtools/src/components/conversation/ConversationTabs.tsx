import { Show } from 'solid-js'
import { useStyles } from '../../styles/use-styles'
import type { Component } from 'solid-js'
import type { Conversation } from '../../store/ai-context'

export type TabType = 'messages' | 'chunks' | 'embeddings' | 'summaries'

interface ConversationTabsProps {
  conversation: Conversation
  activeTab: TabType
  onTabChange: (tab: TabType) => void
}

export const ConversationTabs: Component<ConversationTabsProps> = (props) => {
  const styles = useStyles()
  const conv = () => props.conversation

  // Total raw chunks = sum of all chunkCounts
  const totalRawChunks = () =>
    conv().chunks.reduce((sum, c) => sum + (c.chunkCount || 1), 0)

  const embeddingsCount = () => conv().embeddings?.length ?? 0
  const summariesCount = () => conv().summaries?.length ?? 0

  // Determine if we should show any chat-related tabs
  // For server conversations, don't show messages tab - only chunks
  const hasMessages = () =>
    conv().type === 'client' && conv().messages.length > 0
  const hasChunks = () => conv().chunks.length > 0 || conv().type === 'server'
  const hasEmbeddings = () => conv().hasEmbedding || embeddingsCount() > 0
  const hasSummaries = () => conv().hasSummarize || summariesCount() > 0

  // Count how many tabs would be visible
  const visibleTabCount = () => {
    let count = 0
    if (hasMessages()) count++
    if (hasChunks() && conv().type === 'server') count++
    if (hasEmbeddings()) count++
    if (hasSummaries()) count++
    return count
  }

  // Don't render tabs if only one tab would be visible
  if (visibleTabCount() <= 1) {
    return null
  }

  return (
    <div class={styles().conversationDetails.tabsContainer}>
      {/* Show messages tab for client conversations or when there are messages */}
      <Show when={hasMessages()}>
        <button
          class={`${styles().actionButton} ${
            props.activeTab === 'messages'
              ? styles().conversationDetails.tabButtonActive
              : ''
          }`}
          onClick={() => props.onTabChange('messages')}
        >
          💬 Messages ({conv().messages.length})
        </button>
      </Show>
      {/* Show chunks tab for server conversations or when there are chunks */}
      <Show when={hasChunks() && conv().type === 'server'}>
        <button
          class={`${styles().actionButton} ${
            props.activeTab === 'chunks'
              ? styles().conversationDetails.tabButtonActive
              : ''
          }`}
          onClick={() => props.onTabChange('chunks')}
        >
          📦 Chunks ({totalRawChunks()})
        </button>
      </Show>
      {/* Show embeddings tab if there are embedding operations */}
      <Show when={hasEmbeddings()}>
        <button
          class={`${styles().actionButton} ${
            props.activeTab === 'embeddings'
              ? styles().conversationDetails.tabButtonActive
              : ''
          }`}
          onClick={() => props.onTabChange('embeddings')}
        >
          🔢 Embeddings ({embeddingsCount()})
        </button>
      </Show>
      {/* Show summaries tab if there are summarize operations */}
      <Show when={hasSummaries()}>
        <button
          class={`${styles().actionButton} ${
            props.activeTab === 'summaries'
              ? styles().conversationDetails.tabButtonActive
              : ''
          }`}
          onClick={() => props.onTabChange('summaries')}
        >
          📝 Summaries ({summariesCount()})
        </button>
      </Show>
    </div>
  )
}
