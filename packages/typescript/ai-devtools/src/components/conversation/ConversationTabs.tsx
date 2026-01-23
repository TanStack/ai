import { Show, createEffect, createSignal } from 'solid-js'
import { useStyles } from '../../styles/use-styles'
import type { Component } from 'solid-js'
import type { Conversation } from '../../store/ai-context'

export type TabType =
  | 'messages'
  | 'chunks'
  | 'summaries'
  | 'image'
  | 'speech'
  | 'transcription'
  | 'video'

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

  const summariesCount = () => conv().summaries?.length ?? 0
  const imageCount = () => conv().imageEvents?.length ?? 0
  const speechCount = () => conv().speechEvents?.length ?? 0
  const transcriptionCount = () => conv().transcriptionEvents?.length ?? 0
  const videoCount = () => conv().videoEvents?.length ?? 0

  const [imagePulse, setImagePulse] = createSignal(false)
  const [speechPulse, setSpeechPulse] = createSignal(false)
  const [transcriptionPulse, setTranscriptionPulse] = createSignal(false)
  const [videoPulse, setVideoPulse] = createSignal(false)

  const triggerPulse = (setter: (value: boolean) => void) => {
    setter(true)
    setTimeout(() => setter(false), 2000)
  }

  let previousImageCount = 0
  let previousSpeechCount = 0
  let previousTranscriptionCount = 0
  let previousVideoCount = 0

  createEffect(() => {
    const count = imageCount()
    if (count > 0 && previousImageCount === 0) {
      triggerPulse(setImagePulse)
    }
    previousImageCount = count
  })

  createEffect(() => {
    const count = speechCount()
    if (count > 0 && previousSpeechCount === 0) {
      triggerPulse(setSpeechPulse)
    }
    previousSpeechCount = count
  })

  createEffect(() => {
    const count = transcriptionCount()
    if (count > 0 && previousTranscriptionCount === 0) {
      triggerPulse(setTranscriptionPulse)
    }
    previousTranscriptionCount = count
  })

  createEffect(() => {
    const count = videoCount()
    if (count > 0 && previousVideoCount === 0) {
      triggerPulse(setVideoPulse)
    }
    previousVideoCount = count
  })

  // Determine if we should show any chat-related tabs
  // For server conversations, don't show messages tab - only chunks
  const hasMessages = () =>
    conv().type === 'client' && conv().messages.length > 0
  const hasChunks = () => conv().chunks.length > 0 || conv().type === 'server'
  const hasSummaries = () => conv().hasSummarize || summariesCount() > 0
  const hasImage = () => conv().hasImage || imageCount() > 0
  const hasSpeech = () => conv().hasSpeech || speechCount() > 0
  const hasTranscription = () =>
    conv().hasTranscription || transcriptionCount() > 0
  const hasVideo = () => conv().hasVideo || videoCount() > 0

  // Count how many tabs would be visible
  const visibleTabCount = () => {
    let count = 0
    if (hasMessages()) count++
    if (hasChunks() && conv().type === 'server') count++
    if (hasSummaries()) count++
    if (hasImage()) count++
    if (hasSpeech()) count++
    if (hasTranscription()) count++
    if (hasVideo()) count++
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
      <Show when={hasImage()}>
        <button
          class={`${styles().actionButton} ${
            props.activeTab === 'image'
              ? styles().conversationDetails.tabButtonActive
              : ''
          } ${imagePulse() ? styles().conversationDetails.tabButtonPulse : ''}`}
          onClick={() => props.onTabChange('image')}
        >
          🖼️ Image ({imageCount()})
        </button>
      </Show>
      <Show when={hasSpeech()}>
        <button
          class={`${styles().actionButton} ${
            props.activeTab === 'speech'
              ? styles().conversationDetails.tabButtonActive
              : ''
          } ${speechPulse() ? styles().conversationDetails.tabButtonPulse : ''}`}
          onClick={() => props.onTabChange('speech')}
        >
          🔊 Speech ({speechCount()})
        </button>
      </Show>
      <Show when={hasTranscription()}>
        <button
          class={`${styles().actionButton} ${
            props.activeTab === 'transcription'
              ? styles().conversationDetails.tabButtonActive
              : ''
          } ${
            transcriptionPulse()
              ? styles().conversationDetails.tabButtonPulse
              : ''
          }`}
          onClick={() => props.onTabChange('transcription')}
        >
          📝 Transcription ({transcriptionCount()})
        </button>
      </Show>
      <Show when={hasVideo()}>
        <button
          class={`${styles().actionButton} ${
            props.activeTab === 'video'
              ? styles().conversationDetails.tabButtonActive
              : ''
          } ${videoPulse() ? styles().conversationDetails.tabButtonPulse : ''}`}
          onClick={() => props.onTabChange('video')}
        >
          🎬 Video ({videoCount()})
        </button>
      </Show>
    </div>
  )
}
