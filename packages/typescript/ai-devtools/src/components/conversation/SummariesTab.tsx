import { For, Show } from 'solid-js'
import { useStyles } from '../../styles/use-styles'
import { formatDuration } from '../utils'
import type { Component } from 'solid-js'
import type { SummarizeOperation } from '../../store/ai-context'

interface SummariesTabProps {
  summaries: Array<SummarizeOperation>
}

export const SummariesTab: Component<SummariesTabProps> = (props) => {
  const styles = useStyles()

  return (
    <Show
      when={props.summaries.length > 0}
      fallback={
        <div class={styles().conversationDetails.emptyMessages}>
          No summarize operations yet
        </div>
      }
    >
      <div class={styles().conversationDetails.messagesList}>
        <For each={props.summaries}>
          {(summary) => (
            <div class={styles().conversationDetails.operationCard}>
              <div class={styles().conversationDetails.operationHeader}>
                <div class={styles().conversationDetails.operationIcon}>📝</div>
                <div class={styles().conversationDetails.operationTitle}>
                  Summarize
                </div>
                <div
                  class={`${styles().conversationDetails.operationStatus} ${
                    summary.status === 'completed'
                      ? styles().conversationDetails.operationStatusCompleted
                      : styles().conversationDetails.operationStatusPending
                  }`}
                >
                  {summary.status}
                </div>
                <Show
                  when={summary.duration !== undefined && summary.duration > 0}
                >
                  <div class={styles().conversationDetails.durationBadge}>
                    ⏱️ {formatDuration(summary.duration)}
                  </div>
                </Show>
              </div>
              <div class={styles().conversationDetails.operationDetails}>
                <div class={styles().conversationDetails.operationDetail}>
                  <span class={styles().conversationDetails.operationLabel}>
                    Model:
                  </span>
                  <span class={styles().conversationDetails.operationValue}>
                    {summary.model}
                  </span>
                </div>
                <div class={styles().conversationDetails.operationDetail}>
                  <span class={styles().conversationDetails.operationLabel}>
                    Input:
                  </span>
                  <span class={styles().conversationDetails.operationValue}>
                    {summary.inputLength.toLocaleString()} chars
                  </span>
                </div>
                <Show when={summary.outputLength !== undefined}>
                  <div class={styles().conversationDetails.operationDetail}>
                    <span class={styles().conversationDetails.operationLabel}>
                      Output:
                    </span>
                    <span class={styles().conversationDetails.operationValue}>
                      {summary.outputLength?.toLocaleString()} chars
                    </span>
                  </div>
                </Show>
                <div class={styles().conversationDetails.operationDetail}>
                  <span class={styles().conversationDetails.operationLabel}>
                    Started:
                  </span>
                  <span class={styles().conversationDetails.operationValue}>
                    {new Date(summary.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}
