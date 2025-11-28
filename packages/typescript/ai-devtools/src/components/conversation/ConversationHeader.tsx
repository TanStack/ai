import { For, Show } from 'solid-js'
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

  const toolNames = () => conv().toolNames ?? []
  const options = () => conv().options
  const providerOptions = () => conv().providerOptions
  const iterationCount = () => conv().iterationCount

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
          <Show when={iterationCount() !== undefined && iterationCount()! > 1}>
            <div class={styles().conversationDetails.iterationBadge}>
              🔄 {iterationCount()} iterations
            </div>
          </Show>
        </div>
        <div class={styles().conversationDetails.metaInfo}>
          {conv().model && `Model: ${conv().model}`}
          {conv().provider && ` • Provider: ${conv().provider}`}
          {conv().completedAt &&
            ` • Duration: ${formatDuration(conv().completedAt! - conv().startedAt)}`}
        </div>
        <Show when={conv().usage}>
          <div class={styles().conversationDetails.usageInfo}>
            <span class={styles().conversationDetails.usageLabel}>
              🎯 Tokens:
            </span>
            <span>
              Prompt: {conv().usage?.promptTokens.toLocaleString() || 0}
            </span>
            <span>•</span>
            <span>
              Completion: {conv().usage?.completionTokens.toLocaleString() || 0}
            </span>
            <span>•</span>
            <span class={styles().conversationDetails.usageBold}>
              Total: {conv().usage?.totalTokens.toLocaleString() || 0}
            </span>
          </div>
        </Show>
        {/* Tools list - always visible */}
        <Show when={toolNames().length > 0}>
          <div class={styles().conversationDetails.toolsRow}>
            <span class={styles().conversationDetails.toolsLabel}>🔧</span>
            <div class={styles().conversationDetails.toolsList}>
              <For each={toolNames()}>
                {(toolName) => (
                  <span class={styles().conversationDetails.toolBadge}>
                    {toolName}
                  </span>
                )}
              </For>
            </div>
          </div>
        </Show>
        {/* Options - always visible in compact form */}
        <Show when={options() && Object.keys(options()!).length > 0}>
          <div class={styles().conversationDetails.optionsRow}>
            <span class={styles().conversationDetails.optionsLabel}>
              ⚙️ Options:
            </span>
            <div class={styles().conversationDetails.optionsCompact}>
              <For each={Object.entries(options()!)}>
                {([key, value]) => (
                  <span class={styles().conversationDetails.optionBadge}>
                    {key}:{' '}
                    {typeof value === 'object'
                      ? JSON.stringify(value)
                      : String(value)}
                  </span>
                )}
              </For>
            </div>
          </div>
        </Show>
        {/* Provider Options - always visible in compact form */}
        <Show
          when={providerOptions() && Object.keys(providerOptions()!).length > 0}
        >
          <div class={styles().conversationDetails.optionsRow}>
            <span class={styles().conversationDetails.optionsLabel}>
              🏷️ Provider:
            </span>
            <div class={styles().conversationDetails.optionsCompact}>
              <For each={Object.entries(providerOptions()!)}>
                {([key, value]) => (
                  <span class={styles().conversationDetails.optionBadge}>
                    {key}:{' '}
                    {typeof value === 'object'
                      ? JSON.stringify(value)
                      : String(value)}
                  </span>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
