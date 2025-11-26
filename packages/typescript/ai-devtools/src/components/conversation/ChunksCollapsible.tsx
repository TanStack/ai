import { Component, For, Show } from "solid-js";
import { useStyles } from "../../styles/use-styles";
import type { Chunk } from "../../store/ai-store";
import { ChunkItem } from "./ChunkItem";
import { ChunkBadges } from "./ChunkBadges";

interface ChunksCollapsibleProps {
  chunks: Chunk[];
}

export const ChunksCollapsible: Component<ChunksCollapsibleProps> = (props) => {
  const styles = useStyles();

  const accumulatedContent = () =>
    props.chunks
      .filter((c) => c.type === "content" && (c.content || c.delta))
      .map((c) => c.delta || c.content)
      .join("");

  return (
    <details class={styles().conversationDetails.chunksDetails}>
      <summary class={styles().conversationDetails.chunksSummary}>
        <div class={styles().conversationDetails.chunksSummaryContent}>
          {/* Header */}
          <div class={styles().conversationDetails.chunksSummaryHeader}>
            <span>📦 Server Chunks ({props.chunks.length})</span>
            <ChunkBadges chunks={props.chunks} />
          </div>

          {/* Accumulated Content Preview */}
          <Show when={accumulatedContent()}>
            <div class={styles().conversationDetails.contentPreview} title={accumulatedContent()}>
              {accumulatedContent()}
            </div>
          </Show>
        </div>
      </summary>
      <div class={styles().conversationDetails.chunksContainer}>
        <div class={styles().conversationDetails.chunksList}>
          <For each={props.chunks}>{(chunk, index) => <ChunkItem chunk={chunk} index={index()} variant="small" />}</For>
        </div>
      </div>
    </details>
  );
};
