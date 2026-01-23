import { For, Show } from 'solid-js'
import { JsonTree } from '@tanstack/devtools-ui'
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
  const modelOptions = () => conv().modelOptions
  const iterationCount = () => conv().iterationCount
  const systemPrompts = () => conv().systemPrompts ?? []

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
        {/* Model options - collapsible */}
        <Show when={modelOptions() && Object.keys(modelOptions()!).length > 0}>
          <details class={styles().conversationDetails.collapsibleSection}>
            <summary class={styles().conversationDetails.collapsibleSummary}>
              🧪 Model options
            </summary>
            <div class={styles().conversationDetails.collapsibleContent}>
              <JsonTree
                value={modelOptions() as Record<string, unknown>}
                defaultExpansionDepth={2}
              />
            </div>
          </details>
        </Show>
        {/* System prompts - collapsible */}
        <Show when={systemPrompts().length > 0}>
          <details class={styles().conversationDetails.collapsibleSection}>
            <summary class={styles().conversationDetails.collapsibleSummary}>
              🧩 System prompts ({systemPrompts().length})
            </summary>
            <div class={styles().conversationDetails.collapsibleContent}>
              <For each={systemPrompts()}>
                {(prompt, index) => (
                  <div class={styles().conversationDetails.systemPromptItem}>
                    <div class={styles().conversationDetails.systemPromptIndex}>
                      #{index() + 1}
                    </div>
                    <div class={styles().conversationDetails.systemPromptText}>
                      {prompt}
                    </div>
                  </div>
                )}
              </For>
            </div>
          </details>
        </Show>
      </div>
    </div>
  )
}
