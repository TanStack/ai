import { Component, Show, createSignal, createEffect } from "solid-js";
import { useStyles } from "../styles/use-styles";
import { useAIStore, type Conversation } from "../store/ai-context";
import { ConversationHeader, ConversationTabs, MessagesTab, ChunksTab } from "./conversation";

export const ConversationDetails: Component = () => {
  const { state } = useAIStore();
  const styles = useStyles();
  const [activeTab, setActiveTab] = createSignal<"messages" | "chunks">("messages");

  const activeConversation = (): Conversation | undefined => {
    if (!state.activeConversationId) return undefined;
    return state.conversations[state.activeConversationId];
  };

  // Update active tab when conversation changes
  createEffect(() => {
    const conv = activeConversation();
    if (conv) {
      // For server conversations, default to chunks tab
      if (conv.type === "server") {
        setActiveTab("chunks");
      } else {
        // For client conversations, default to messages tab
        setActiveTab("messages");
      }
    }
  });

  return (
    <Show
      when={activeConversation()}
      fallback={<div class={styles().conversationDetails.emptyState}>Select a conversation to view details</div>}
    >
      {(conv) => (
        <div class={styles().conversationDetails.container}>
          <ConversationHeader conversation={conv()} />
          <ConversationTabs conversation={conv()} activeTab={activeTab()} onTabChange={setActiveTab} />
          <div class={styles().conversationDetails.contentArea}>
            <Show when={activeTab() === "messages"}>
              <MessagesTab messages={conv().messages} />
            </Show>
            <Show when={activeTab() === "chunks"}>
              <ChunksTab chunks={conv().chunks} />
            </Show>
          </div>
        </div>
      )}
    </Show>
  );
};
