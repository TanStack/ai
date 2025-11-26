import { Component, Show } from "solid-js";
import { useStyles } from "../../styles/use-styles";
import { useAIStore, type Conversation } from "../../store/ai-context";
import { getStatusColor, getTypeColor } from "../utils";

interface ConversationRowProps {
  conversation: Conversation;
}

export const ConversationRow: Component<ConversationRowProps> = (props) => {
  const { state, selectConversation } = useAIStore();
  const styles = useStyles();
  const conv = () => props.conversation;

  const hasToolCalls = () => {
    return conv().messages.some((msg) => msg.toolCalls && msg.toolCalls.length > 0);
  };

  const countToolCalls = () => {
    return conv().messages.reduce((total, msg) => {
      return total + (msg.toolCalls?.length || 0);
    }, 0);
  };

  return (
    <div
      class={`${styles().utilRow} ${state.activeConversationId === conv().id ? styles().utilRowSelected : ""}`}
      onClick={() => selectConversation(conv().id)}
    >
      <div class={styles().conversationsList.rowContent}>
        <div class={styles().conversationsList.rowInfo}>
          <div class={styles().conversationsList.typeDot} style={{ background: getTypeColor(conv().type) }} />
          <div class={styles().conversationsList.label}>{conv().label}</div>
          <Show when={hasToolCalls()}>
            <div
              class={styles().conversationsList.toolCallsBadge}
              title={`${countToolCalls()} tool call${countToolCalls() !== 1 ? "s" : ""}`}
            >
              🔧 {countToolCalls()}
            </div>
          </Show>
        </div>
        <div class={styles().conversationsList.statusDot} style={{ background: getStatusColor(conv().status) }} />
      </div>
      <div class={styles().conversationsList.stats}>
        <div class={styles().conversationsList.statItem}>💬 {conv().messages.length}</div>
        <div class={styles().conversationsList.statItem}>📦 {conv().chunks.length}</div>
        <Show when={conv().usage}>
          <div
            class={styles().conversationsList.tokensBadge}
            title={`Prompt: ${conv().usage?.promptTokens || 0} | Completion: ${conv().usage?.completionTokens || 0}`}
          >
            🎯 {conv().usage?.totalTokens || 0}
          </div>
        </Show>
      </div>
      <Show when={conv().status === "active"}>
        <div class={styles().conversationsList.loadingIndicator}>⟳ Loading...</div>
      </Show>
    </div>
  );
};
