import { Show, createEffect, createSignal } from 'solid-js'
import { useStyles } from '../styles/use-styles'
import { useAIStore } from '../store/ai-context'
import {
  ChunksTab,
  ConversationHeader,
  ConversationTabs,
  EmbeddingsTab,
  MessagesTab,
  SummariesTab,
} from './conversation'
import type { TabType } from './conversation'
import type { Conversation } from '../store/ai-context'
import type { Component } from 'solid-js'

export const ConversationDetails: Component = () => {
  const { state } = useAIStore()
  const styles = useStyles()
  const [activeTab, setActiveTab] = createSignal<TabType>('messages')

  const activeConversation = (): Conversation | undefined => {
    if (!state.activeConversationId) return undefined
    return state.conversations[state.activeConversationId]
  }

  // Update active tab when conversation changes
  createEffect(() => {
    const conv = activeConversation()
    if (conv) {
      // For server conversations, always use chunks (messages tab is hidden)
      if (conv.type === 'server') {
        if (conv.chunks.length > 0) {
          setActiveTab('chunks')
        } else if (
          conv.hasEmbedding ||
          (conv.embeddings && conv.embeddings.length > 0)
        ) {
          setActiveTab('embeddings')
        } else if (
          conv.hasSummarize ||
          (conv.summaries && conv.summaries.length > 0)
        ) {
          setActiveTab('summaries')
        } else {
          setActiveTab('chunks')
        }
      } else {
        // For client conversations, default to messages tab
        setActiveTab('messages')
      }
    }
  })

  return (
    <Show
      when={activeConversation()}
      fallback={
        <div class={styles().conversationDetails.emptyState}>
          Select a conversation to view details
        </div>
      }
    >
      {(conv) => (
        <div class={styles().conversationDetails.container}>
          <ConversationHeader conversation={conv()} />
          <ConversationTabs
            conversation={conv()}
            activeTab={activeTab()}
            onTabChange={setActiveTab}
          />
          <div class={styles().conversationDetails.contentArea}>
            <Show when={activeTab() === 'messages'}>
              <MessagesTab messages={conv().messages} />
            </Show>
            <Show when={activeTab() === 'chunks'}>
              <ChunksTab chunks={conv().chunks} messages={conv().messages} />
            </Show>
            <Show when={activeTab() === 'embeddings'}>
              <EmbeddingsTab embeddings={conv().embeddings ?? []} />
            </Show>
            <Show when={activeTab() === 'summaries'}>
              <SummariesTab summaries={conv().summaries ?? []} />
            </Show>
          </div>
        </div>
      )}
    </Show>
  )
}
