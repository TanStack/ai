import { Component, Show, createSignal } from "solid-js";
import { useStyles } from "../../styles/use-styles";
import type { Chunk } from "../../store/ai-store";
import { formatTimestamp, getChunkTypeColor } from "../utils";

interface ChunkItemProps {
  chunk: Chunk;
  index: number;
  variant?: "small" | "large";
}

export const ChunkItem: Component<ChunkItemProps> = (props) => {
  const styles = useStyles();
  const [showRaw, setShowRaw] = createSignal(false);
  const isLarge = () => props.variant === "large";

  return (
    <div class={isLarge() ? styles().conversationDetails.chunkItemLarge : styles().conversationDetails.chunkItem}>
      {/* Chunk Header */}
      <div class={isLarge() ? styles().conversationDetails.chunkHeaderLarge : styles().conversationDetails.chunkHeader}>
        {/* Chunk Number */}
        <div
          class={isLarge() ? styles().conversationDetails.chunkNumberLarge : styles().conversationDetails.chunkNumber}
        >
          #{props.index + 1}
        </div>

        {/* Type Badge */}
        <div
          class={
            isLarge() ? styles().conversationDetails.chunkTypeBadgeLarge : styles().conversationDetails.chunkTypeBadge
          }
        >
          <div
            class={
              isLarge() ? styles().conversationDetails.chunkTypeDotLarge : styles().conversationDetails.chunkTypeDot
            }
            style={{ background: getChunkTypeColor(props.chunk.type) }}
          />
          <div
            class={
              isLarge() ? styles().conversationDetails.chunkTypeLabelLarge : styles().conversationDetails.chunkTypeLabel
            }
          >
            {props.chunk.type}
          </div>
        </div>

        {/* Tool Name Badge */}
        <Show when={props.chunk.toolName}>
          <div
            class={
              isLarge() ? styles().conversationDetails.chunkToolBadgeLarge : styles().conversationDetails.chunkToolBadge
            }
          >
            🔧 {props.chunk.toolName}
          </div>
        </Show>

        {/* Timestamp */}
        <div
          class={
            isLarge() ? styles().conversationDetails.chunkTimestampLarge : styles().conversationDetails.chunkTimestamp
          }
        >
          {formatTimestamp(props.chunk.timestamp)}
        </div>

        {/* Toggle Raw JSON Button */}
        <button
          onClick={() => setShowRaw(!showRaw())}
          class={`${
            isLarge() ? styles().conversationDetails.rawJsonButtonLarge : styles().conversationDetails.rawJsonButton
          } ${
            showRaw()
              ? styles().conversationDetails.rawJsonButtonActive
              : styles().conversationDetails.rawJsonButtonInactive
          }`}
          title={showRaw() ? "Show formatted" : "Show raw JSON"}
        >
          {"{}"}
        </button>
      </div>

      {/* Chunk Content */}
      <Show when={!showRaw()}>
        <Show when={props.chunk.content || props.chunk.delta}>
          <div
            class={
              isLarge() ? styles().conversationDetails.chunkContentLarge : styles().conversationDetails.chunkContent
            }
          >
            {props.chunk.delta || props.chunk.content}
          </div>
        </Show>
        <Show when={props.chunk.error}>
          <div
            class={isLarge() ? styles().conversationDetails.chunkErrorLarge : styles().conversationDetails.chunkError}
          >
            ❌ {props.chunk.error}
          </div>
        </Show>
        <Show when={props.chunk.finishReason}>
          <div
            class={isLarge() ? styles().conversationDetails.chunkFinishLarge : styles().conversationDetails.chunkFinish}
          >
            ✓ {isLarge() ? `Finish: ${props.chunk.finishReason}` : props.chunk.finishReason}
          </div>
        </Show>
        <Show when={props.chunk.type === "approval"}>
          <div
            class={
              isLarge() ? styles().conversationDetails.chunkApprovalLarge : styles().conversationDetails.chunkApproval
            }
          >
            <div
              class={
                isLarge()
                  ? styles().conversationDetails.chunkApprovalTitleLarge
                  : styles().conversationDetails.chunkApprovalTitle
              }
            >
              ⚠️ Approval Required
            </div>
            <Show when={props.chunk.input}>
              <div
                class={
                  isLarge()
                    ? styles().conversationDetails.chunkApprovalInputLarge
                    : styles().conversationDetails.chunkApprovalInput
                }
              >
                Input: {JSON.stringify(props.chunk.input, null, 2)}
              </div>
            </Show>
          </div>
        </Show>
      </Show>

      {/* Raw JSON View */}
      <Show when={showRaw()}>
        <div class={isLarge() ? styles().conversationDetails.rawJsonLarge : styles().conversationDetails.rawJson}>
          {JSON.stringify(props.chunk, null, 2)}
        </div>
      </Show>
    </div>
  );
};
