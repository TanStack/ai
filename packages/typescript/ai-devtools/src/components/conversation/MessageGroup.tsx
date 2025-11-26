import { Component, For, Show } from "solid-js";
import { useStyles } from "../../styles/use-styles";
import type { Chunk } from "../../store/ai-store";
import { ChunkItem } from "./ChunkItem";
import { ChunkBadges } from "./ChunkBadges";

interface MessageGroupProps {
  messageId: string;
  chunks: Chunk[];
  groupIndex: number;
}

export const MessageGroup: Component<MessageGroupProps> = (props) => {
  const styles = useStyles();

  const accumulatedContent = () =>
    props.chunks
      .filter((c) => c.type === "content" && (c.content || c.delta))
      .map((c) => c.content)
      .join("");

  // Total raw chunks = sum of all chunkCounts
  const totalRawChunks = () => props.chunks.reduce((sum, c) => sum + (c.chunkCount || 1), 0);
  // Consolidated entries = number of entries in the chunks array
  const consolidatedEntries = () => props.chunks.length;

  return (
    <details class={styles().conversationDetails.messageGroupDetails}>
      <summary class={styles().conversationDetails.messageGroupSummary}>
        <div class={styles().conversationDetails.messageGroupContent}>
          {/* Header */}
          <div class={styles().conversationDetails.messageGroupHeader}>
            <span>Message #{props.groupIndex + 1}</span>
            <div class={`${styles().conversationDetails.chunkBadge} ${styles().conversationDetails.chunkBadgeCount}`}>
              📦 {totalRawChunks()} chunks
              <Show when={consolidatedEntries() !== totalRawChunks()}>
                <span style={{ opacity: 0.7, "margin-left": "4px" }}>({consolidatedEntries()} entries)</span>
              </Show>
            </div>
            <ChunkBadges chunks={props.chunks} />
          </div>

          {/* Message ID */}
          <div class={styles().conversationDetails.messageId} title={props.messageId}>
            ID: {props.messageId}
          </div>

          {/* Accumulated Content Preview */}
          <Show when={accumulatedContent()}>
            <div class={styles().conversationDetails.contentPreview} title={accumulatedContent()}>
              {accumulatedContent()}
            </div>
          </Show>
        </div>
      </summary>

      {/* Chunks in this group */}
      <div class={styles().conversationDetails.chunksContainer}>
        <div class={styles().conversationDetails.chunksList}>
          <For each={props.chunks}>
            {(chunk, chunkIndex) => <ChunkItem chunk={chunk} index={chunkIndex()} variant="large" />}
          </For>
        </div>
      </div>
    </details>
  );
};
