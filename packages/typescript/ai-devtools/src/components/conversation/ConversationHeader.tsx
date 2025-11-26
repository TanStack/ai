import { Component, Show } from "solid-js";
import { useStyles } from "../../styles/use-styles";
import type { Conversation } from "../../store/ai-store";
import { formatDuration } from "../utils";

interface ConversationHeaderProps {
  conversation: Conversation;
}

export const ConversationHeader: Component<ConversationHeaderProps> = (props) => {
  const styles = useStyles();
  const conv = () => props.conversation;

  return (
    <div class={styles().panelHeader}>
      <div class={styles().conversationDetails.headerContent}>
        <div class={styles().conversationDetails.headerRow}>
          <div class={styles().conversationDetails.headerLabel}>{conv().label}</div>
          <div
            class={`${styles().conversationDetails.statusBadge} ${
              conv().status === "active"
                ? styles().conversationDetails.statusActive
                : conv().status === "completed"
                ? styles().conversationDetails.statusCompleted
                : styles().conversationDetails.statusError
            }`}
          >
            {conv().status}
          </div>
        </div>
        <div class={styles().conversationDetails.metaInfo}>
          {conv().model && `Model: ${conv().model}`}
          {conv().provider && ` • Provider: ${conv().provider}`}
          {conv().completedAt && ` • Duration: ${formatDuration(conv().completedAt! - conv().startedAt)}`}
        </div>
        <Show when={conv().usage}>
          <div class={styles().conversationDetails.usageInfo}>
            <span class={styles().conversationDetails.usageLabel}>🎯 Tokens:</span>
            <span>Prompt: {conv().usage?.promptTokens.toLocaleString() || 0}</span>
            <span>•</span>
            <span>Completion: {conv().usage?.completionTokens.toLocaleString() || 0}</span>
            <span>•</span>
            <span class={styles().conversationDetails.usageBold}>
              Total: {conv().usage?.totalTokens.toLocaleString() || 0}
            </span>
          </div>
        </Show>
      </div>
    </div>
  );
};
