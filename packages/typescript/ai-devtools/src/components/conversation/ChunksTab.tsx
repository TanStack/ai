import { Component, For, Show } from "solid-js";
import { useStyles } from "../../styles/use-styles";
import type { Chunk } from "../../store/ai-store";
import { MessageGroup } from "./MessageGroup";

interface ChunksTabProps {
  chunks: Chunk[];
}

export const ChunksTab: Component<ChunksTabProps> = (props) => {
  const styles = useStyles();

  const groupedChunks = () => {
    const groups = new Map<string, Array<Chunk>>();

    props.chunks.forEach((chunk) => {
      const key = chunk.messageId || "no-message-id";
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(chunk);
    });

    return Array.from(groups.entries());
  };

  return (
    <Show
      when={props.chunks.length > 0}
      fallback={<div class={styles().conversationDetails.noChunks}>No chunks yet</div>}
    >
      <div class={styles().conversationDetails.streamContainer}>
        {/* Stream Header */}
        <div class={styles().conversationDetails.streamHeader}>
          <div class={styles().conversationDetails.streamHeaderRow}>
            <div class={styles().conversationDetails.streamTitle}>Stream Responses</div>
            <div class={`${styles().conversationDetails.chunkBadge} ${styles().conversationDetails.chunkBadgeCount}`}>
              {props.chunks.length} chunks · {groupedChunks().length} messages
            </div>
          </div>
          <div class={styles().conversationDetails.streamSubtitle}>Grouped by message ID</div>
        </div>

        {/* Message Groups */}
        <div class={styles().conversationDetails.messageGroups}>
          <For each={groupedChunks()}>
            {([messageId, chunks], groupIndex) => (
              <MessageGroup messageId={messageId} chunks={chunks} groupIndex={groupIndex()} />
            )}
          </For>
        </div>
      </div>
    </Show>
  );
};
