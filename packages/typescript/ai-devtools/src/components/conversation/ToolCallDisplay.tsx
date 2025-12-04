import { Show } from 'solid-js'
import { JsonTree } from '@tanstack/devtools-ui'
import { useStyles } from '../../styles/use-styles'
import { formatDuration } from '../utils'
import type { Component } from 'solid-js'
import type { ToolCall } from '../../store/ai-context'

interface ToolCallDisplayProps {
  tool: ToolCall
}

export const ToolCallDisplay: Component<ToolCallDisplayProps> = (props) => {
  const styles = useStyles()
  const tool = () => props.tool

  // Parse arguments if they're a string
  const parsedArguments = () => {
    const args = tool().arguments
    if (typeof args === 'string') {
      try {
        return JSON.parse(args)
      } catch {
        return args
      }
    }
    return args
  }

  return (
    <details
      class={`${styles().conversationDetails.toolCall} ${
        tool().approvalRequired
          ? styles().conversationDetails.toolCallApproval
          : styles().conversationDetails.toolCallNormal
      }`}
    >
      <summary class={styles().conversationDetails.toolCallHeader}>
        <div
          class={`${styles().conversationDetails.toolCallName} ${
            tool().approvalRequired
              ? styles().conversationDetails.toolCallNameApproval
              : styles().conversationDetails.toolCallNameNormal
          }`}
        >
          {tool().approvalRequired ? '⚠️' : '🔧'} {tool().name}
        </div>
        <div
          class={`${styles().conversationDetails.toolStateBadge} ${
            tool().approvalRequired
              ? styles().conversationDetails.toolStateBadgeApproval
              : styles().conversationDetails.toolStateBadgeNormal
          }`}
        >
          {tool().state}
        </div>
        <Show when={tool().duration !== undefined && tool().duration! > 0}>
          <div class={styles().conversationDetails.durationBadge}>
            ⏱️ {formatDuration(tool().duration)}
          </div>
        </Show>
        <Show when={tool().approvalRequired}>
          <div class={styles().conversationDetails.approvalRequiredBadge}>
            APPROVAL REQUIRED
          </div>
        </Show>
      </summary>
      <div class={styles().conversationDetails.toolCallContent}>
        <Show when={tool().arguments}>
          <div class={styles().conversationDetails.toolSection}>
            <div class={styles().conversationDetails.toolSectionLabel}>
              Arguments
            </div>
            <div class={styles().conversationDetails.toolJsonContainer}>
              <JsonTree
                value={parsedArguments() as Record<string, unknown>}
                defaultExpansionDepth={2}
                copyable
              />
            </div>
          </div>
        </Show>
        <Show when={tool().result !== undefined}>
          <div class={styles().conversationDetails.toolSection}>
            <div class={styles().conversationDetails.toolSectionLabel}>
              Result
            </div>
            <div class={styles().conversationDetails.toolJsonContainer}>
              <JsonTree
                value={tool().result as Record<string, unknown>}
                defaultExpansionDepth={2}
                copyable
              />
            </div>
          </div>
        </Show>
      </div>
    </details>
  )
}
