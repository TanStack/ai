import { For, Show } from 'solid-js'
import { useStyles } from '../../styles/use-styles'
import { formatDuration } from '../utils'
import type { Component } from 'solid-js'
import type { EmbeddingOperation } from '../../store/ai-context'

interface EmbeddingsTabProps {
  embeddings: Array<EmbeddingOperation>
}

export const EmbeddingsTab: Component<EmbeddingsTabProps> = (props) => {
  const styles = useStyles()

  return (
    <Show
      when={props.embeddings.length > 0}
      fallback={
        <div class={styles().conversationDetails.emptyMessages}>
          No embedding operations yet
        </div>
      }
    >
      <div class={styles().conversationDetails.messagesList}>
        <For each={props.embeddings}>
          {(embedding) => (
            <div class={styles().conversationDetails.operationCard}>
              <div class={styles().conversationDetails.operationHeader}>
                <div class={styles().conversationDetails.operationIcon}>🔢</div>
                <div class={styles().conversationDetails.operationTitle}>
                  Embedding
                </div>
                <div
                  class={`${styles().conversationDetails.operationStatus} ${
                    embedding.status === 'completed'
                      ? styles().conversationDetails.operationStatusCompleted
                      : styles().conversationDetails.operationStatusPending
                  }`}
                >
                  {embedding.status}
                </div>
                <Show when={embedding.duration > 0}>
                  <div class={styles().conversationDetails.durationBadge}>
                    ⏱️ {formatDuration(embedding.duration)}
                  </div>
                </Show>
              </div>
              <div class={styles().conversationDetails.operationDetails}>
                <div class={styles().conversationDetails.operationDetail}>
                  <span class={styles().conversationDetails.operationLabel}>
                    Model:
                  </span>
                  <span class={styles().conversationDetails.operationValue}>
                    {embedding.model}
                  </span>
                </div>
                <div class={styles().conversationDetails.operationDetail}>
                  <span class={styles().conversationDetails.operationLabel}>
                    Inputs:
                  </span>
                  <span class={styles().conversationDetails.operationValue}>
                    {embedding.inputCount} item
                    {embedding.inputCount !== 1 ? 's' : ''}
                  </span>
                </div>
                <div class={styles().conversationDetails.operationDetail}>
                  <span class={styles().conversationDetails.operationLabel}>
                    Started:
                  </span>
                  <span class={styles().conversationDetails.operationValue}>
                    {new Date(embedding.timestamp).toLocaleTimeString()}
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
