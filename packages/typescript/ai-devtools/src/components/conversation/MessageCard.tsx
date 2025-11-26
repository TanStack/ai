import { Component, For, Show } from "solid-js";
import { useStyles } from "../../styles/use-styles";
import type { Message } from "../../store/ai-store";
import { ToolCallDisplay } from "./ToolCallDisplay";
import { ChunksCollapsible } from "./ChunksCollapsible";
import { formatTimestamp } from "../utils";

interface MessageCardProps {
  message: Message;
}

export const MessageCard: Component<MessageCardProps> = (props) => {
  const styles = useStyles();
  const msg = () => props.message;

  return (
    <div
      class={`${styles().conversationDetails.messageCard} ${
        msg().role === "user"
          ? styles().conversationDetails.messageCardUser
          : styles().conversationDetails.messageCardAssistant
      }`}
    >
      <div class={styles().conversationDetails.messageHeader}>
        <div
          class={
            msg().role === "user"
              ? styles().conversationDetails.avatarUser
              : styles().conversationDetails.avatarAssistant
          }
        >
          {msg().role === "user" ? "U" : "🤖"}
        </div>
        <div class={styles().conversationDetails.roleLabel}>
          <div
            class={
              msg().role === "user"
                ? styles().conversationDetails.roleLabelUser
                : styles().conversationDetails.roleLabelAssistant
            }
          >
            {msg().role}
          </div>
        </div>
        <div class={styles().conversationDetails.timestamp}>{formatTimestamp(msg().timestamp)}</div>
      </div>
      <div class={styles().conversationDetails.messageContent}>{msg().content}</div>

      {/* Tool Calls Display */}
      <Show when={msg().toolCalls && msg().toolCalls!.length > 0}>
        <div class={styles().conversationDetails.toolCallsContainer}>
          <For each={msg().toolCalls}>{(tool) => <ToolCallDisplay tool={tool} />}</For>
        </div>
      </Show>

      {/* Chunks Display (for client conversations with server chunks) */}
      <Show when={msg().chunks && msg().chunks!.length > 0}>
        <ChunksCollapsible chunks={msg().chunks!} />
      </Show>
    </div>
  );
};
