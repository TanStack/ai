import { Component, Show } from "solid-js";
import { useStyles } from "../../styles/use-styles";
import type { Conversation } from "../../store/ai-store";

interface ConversationTabsProps {
  conversation: Conversation;
  activeTab: "messages" | "chunks";
  onTabChange: (tab: "messages" | "chunks") => void;
}

export const ConversationTabs: Component<ConversationTabsProps> = (props) => {
  const styles = useStyles();
  const conv = () => props.conversation;

  return (
    <div class={styles().conversationDetails.tabsContainer}>
      {/* Only show messages tab for client conversations */}
      <Show when={conv().type === "client"}>
        <button
          class={`${styles().actionButton} ${
            props.activeTab === "messages" ? styles().conversationDetails.tabButtonActive : ""
          }`}
          onClick={() => props.onTabChange("messages")}
        >
          Messages ({conv().messages.length})
        </button>
      </Show>
      {/* Only show chunks tab for server-only conversations */}
      <Show when={conv().type === "server"}>
        <button
          class={`${styles().actionButton} ${
            props.activeTab === "chunks" ? styles().conversationDetails.tabButtonActive : ""
          }`}
          onClick={() => props.onTabChange("chunks")}
        >
          Chunks ({conv().chunks.length})
        </button>
      </Show>
    </div>
  );
};
