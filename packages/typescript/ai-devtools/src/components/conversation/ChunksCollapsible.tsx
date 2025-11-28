import { For, Show } from 'solid-js'
import { useStyles } from '../../styles/use-styles'
import { ChunkItem } from './ChunkItem'
import { ChunkBadges } from './ChunkBadges'
import type { Component } from 'solid-js'
import type { Chunk } from '../../store/ai-store'

interface ChunksCollapsibleProps {
  chunks: Array<Chunk>
}

export const ChunksCollapsible: Component<ChunksCollapsibleProps> = (props) => {
  const styles = useStyles()

  const accumulatedContent = () =>
    props.chunks
      .filter((c) => c.type === 'content' && (c.content || c.delta))
      .map((c) => c.delta || c.content)
      .join('')

  // Total raw chunks = sum of all chunkCounts
  const totalRawChunks = () =>
    props.chunks.reduce((sum, c) => sum + (c.chunkCount || 1), 0)

  return (
    <details class={styles().conversationDetails.chunksDetails}>
      <summary class={styles().conversationDetails.chunksSummary}>
        <div class={styles().conversationDetails.chunksSummaryRow}>
          <span class={styles().conversationDetails.chunksSummaryArrow}>
            ▶
          </span>
          <span class={styles().conversationDetails.chunksSummaryTitle}>
            📦 {totalRawChunks()} chunks
          </span>
          <ChunkBadges chunks={props.chunks} />
        </div>
        {/* Accumulated Content Preview */}
        <Show when={accumulatedContent()}>
          <div
            class={styles().conversationDetails.contentPreview}
            title={accumulatedContent()}
          >
            {accumulatedContent()}
          </div>
        </Show>
      </summary>
      <div class={styles().conversationDetails.chunksContainer}>
        <div class={styles().conversationDetails.chunksList}>
          <For each={props.chunks}>
            {(chunk, index) => (
              <ChunkItem chunk={chunk} index={index()} variant="small" />
            )}
          </For>
        </div>
      </div>
    </details>
  )
}
