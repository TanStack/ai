import { Component, Show } from "solid-js";
import { useStyles } from "../../styles/use-styles";
import type { Chunk } from "../../store/ai-store";

interface ChunkBadgesProps {
  chunks: Chunk[];
}

export const ChunkBadges: Component<ChunkBadgesProps> = (props) => {
  const styles = useStyles();

  const hasToolCalls = () => props.chunks.some((c) => c.type === "tool_call");
  const hasErrors = () => props.chunks.some((c) => c.type === "error");
  const hasApproval = () => props.chunks.some((c) => c.type === "approval");
  const finishReason = () => props.chunks.find((c) => c.type === "done")?.finishReason;

  return (
    <>
      <Show when={hasToolCalls()}>
        <span class={`${styles().conversationDetails.chunkBadge} ${styles().conversationDetails.chunkBadgeTool}`}>
          🔧 Tool Calls
        </span>
      </Show>
      <Show when={hasErrors()}>
        <span class={`${styles().conversationDetails.chunkBadge} ${styles().conversationDetails.chunkBadgeError}`}>
          ❌ Error
        </span>
      </Show>
      <Show when={hasApproval()}>
        <span class={`${styles().conversationDetails.chunkBadge} ${styles().conversationDetails.chunkBadgeApproval}`}>
          ⚠️ Approval
        </span>
      </Show>
      <Show when={finishReason()}>
        <span class={`${styles().conversationDetails.chunkBadge} ${styles().conversationDetails.chunkBadgeSuccess}`}>
          ✓ {finishReason()}
        </span>
      </Show>
    </>
  );
};
