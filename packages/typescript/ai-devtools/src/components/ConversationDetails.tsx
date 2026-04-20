import { Show, createEffect, createSignal } from 'solid-js'
import { useStyles } from '../styles/use-styles'
import { useAIStore } from '../store/ai-context'
import {
  ActivityEventsTab,
  ChunksTab,
  ConversationHeader,
  ConversationTabs,
  IterationTimeline,
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

  const hasIterations = () => {
    const conv = activeConversation()
    return conv && conv.iterations.length > 0
  }

  const hasActivityTabs = () => {
    const conv = activeConversation()
    if (!conv) return false
    return (
      conv.hasSummarize ||
      conv.hasImage ||
      conv.hasSpeech ||
      conv.hasTranscription ||
      conv.hasVideo
    )
  }

  // Update active tab when conversation changes (only for non-iteration views)
  createEffect(() => {
    const conv = activeConversation()
    if (!conv) return

    // If iterations exist, the timeline is the primary view — only set tab for activity
    if (conv.iterations.length > 0) {
      if (conv.hasSummarize || (conv.summaries && conv.summaries.length > 0)) {
        setActiveTab('summaries')
      } else if (
        conv.hasImage ||
        (conv.imageEvents && conv.imageEvents.length > 0)
      ) {
        setActiveTab('image')
      }
      return
    }

    // No iterations — use flat message/chunk view
    if (conv.type === 'server') {
      if (conv.chunks.length > 0) {
        setActiveTab('chunks')
      } else if (
        conv.hasSummarize ||
        (conv.summaries && conv.summaries.length > 0)
      ) {
        setActiveTab('summaries')
      } else if (
        conv.hasImage ||
        (conv.imageEvents && conv.imageEvents.length > 0)
      ) {
        setActiveTab('image')
      } else if (
        conv.hasSpeech ||
        (conv.speechEvents && conv.speechEvents.length > 0)
      ) {
        setActiveTab('speech')
      } else if (
        conv.hasTranscription ||
        (conv.transcriptionEvents && conv.transcriptionEvents.length > 0)
      ) {
        setActiveTab('transcription')
      } else if (
        conv.hasVideo ||
        (conv.videoEvents && conv.videoEvents.length > 0)
      ) {
        setActiveTab('video')
      } else {
        setActiveTab('chunks')
      }
    } else {
      if (conv.messages.length > 0) {
        setActiveTab('messages')
      } else if (
        conv.hasImage ||
        (conv.imageEvents && conv.imageEvents.length > 0)
      ) {
        setActiveTab('image')
      } else {
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

          {/* Primary view: iteration timeline when iterations exist */}
          <Show when={hasIterations()}>
            <div class={styles().conversationDetails.contentArea}>
              <IterationTimeline
                iterations={conv().iterations}
                messages={conv().messages}
              />
            </div>
          </Show>

          {/* Fallback: flat message/chunk view when no iterations */}
          <Show when={!hasIterations()}>
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
              <Show when={activeTab() === 'summaries'}>
                <SummariesTab summaries={conv().summaries ?? []} />
              </Show>
              <Show when={activeTab() === 'image'}>
                <ActivityEventsTab
                  title="Image Activity"
                  events={conv().imageEvents ?? []}
                />
              </Show>
              <Show when={activeTab() === 'speech'}>
                <ActivityEventsTab
                  title="Speech Activity"
                  events={conv().speechEvents ?? []}
                />
              </Show>
              <Show when={activeTab() === 'transcription'}>
                <ActivityEventsTab
                  title="Transcription Activity"
                  events={conv().transcriptionEvents ?? []}
                />
              </Show>
              <Show when={activeTab() === 'video'}>
                <ActivityEventsTab
                  title="Video Activity"
                  events={conv().videoEvents ?? []}
                />
              </Show>
            </div>
          </Show>

          {/* Activity tabs shown below iterations when relevant */}
          <Show when={hasIterations() && hasActivityTabs()}>
            <ConversationTabs
              conversation={conv()}
              activeTab={activeTab()}
              onTabChange={setActiveTab}
            />
            <div class={styles().conversationDetails.contentArea}>
              <Show when={activeTab() === 'summaries'}>
                <SummariesTab summaries={conv().summaries ?? []} />
              </Show>
              <Show when={activeTab() === 'image'}>
                <ActivityEventsTab
                  title="Image Activity"
                  events={conv().imageEvents ?? []}
                />
              </Show>
              <Show when={activeTab() === 'speech'}>
                <ActivityEventsTab
                  title="Speech Activity"
                  events={conv().speechEvents ?? []}
                />
              </Show>
              <Show when={activeTab() === 'transcription'}>
                <ActivityEventsTab
                  title="Transcription Activity"
                  events={conv().transcriptionEvents ?? []}
                />
              </Show>
              <Show when={activeTab() === 'video'}>
                <ActivityEventsTab
                  title="Video Activity"
                  events={conv().videoEvents ?? []}
                />
              </Show>
            </div>
          </Show>
        </div>
      )}
    </Show>
  )
}
