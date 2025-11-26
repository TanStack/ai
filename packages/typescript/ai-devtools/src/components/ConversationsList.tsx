import { Component, For } from "solid-js";
import { useStyles } from "../styles/use-styles";
import { useAIStore, type Conversation } from "../store/ai-context";
import { ConversationRow } from "./list";

export const ConversationsList: Component<{
  filterType: "all" | "client" | "server";
}> = (props) => {
  const { state } = useAIStore();
  const styles = useStyles();

  const filteredConversations = () => {
    const conversations = Object.values(state.conversations);
    if (props.filterType === "all") return conversations;
    return conversations.filter((conv: Conversation) => conv.type === props.filterType);
  };

  return (
    <div class={styles().utilList}>
      <For each={filteredConversations()}>{(conv: Conversation) => <ConversationRow conversation={conv} />}</For>
    </div>
  );
};
