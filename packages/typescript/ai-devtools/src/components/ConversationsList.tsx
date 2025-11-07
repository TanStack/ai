import { Component, For, Show, onMount } from "solid-js";
import { useStyles } from "../styles/use-styles";
import { getAIStore, setActiveConversation, type Conversation } from "../store/ai-store";

export const ConversationsList: Component<{
  filterType: "all" | "client" | "server";
}> = (props) => {
  const styles = useStyles();
  const store = getAIStore();

  // Add spinner animation to document head
  onMount(() => {
    if (!document.querySelector("#spinner-animation")) {
      const style = document.createElement("style");
      style.id = "spinner-animation";
      style.textContent = `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
  });

  const filteredConversations = () => {
    const conversations = Object.values(store.conversations);
    if (props.filterType === "all") {
      return conversations;
    }
    return conversations.filter((conv) => conv.type === props.filterType);
  };

  const getConversationTitle = (conv: Conversation) => {
    if (conv.type === "client") {
      return `Client: ${conv.clientId?.substring(0, 8) || "Unknown"}`;
    } else {
      return `Server: ${conv.model || "Unknown Model"}`;
    }
  };

  const getConversationSubtitle = (conv: Conversation) => {
    const messageCount = conv.messages.length;
    const toolCount = conv.toolCalls.length;
    const parts = [];

    if (messageCount > 0) parts.push(`${messageCount} msg`);
    if (toolCount > 0) parts.push(`${toolCount} tools`);
    if (conv.totalTokens) parts.push(`${conv.totalTokens} tokens`);

    return parts.join(" • ");
  };

  const getStatusColor = (status: Conversation["status"]) => {
    switch (status) {
      case "active":
        return "#3b82f6"; // blue
      case "completed":
        return "#10b981"; // green
      case "error":
        return "#ef4444"; // red
      default:
        return "#6b7280"; // gray
    }
  };

  const getTypeColor = (type: Conversation["type"]) => {
    switch (type) {
      case "client":
        return "#ec4899"; // pink
      case "server":
        return "#8b5cf6"; // purple
      default:
        return "#6b7280"; // gray
    }
  };

  return (
    <div class={styles().utilList}>
      <Show
        when={filteredConversations().length > 0}
        fallback={
          <div
            style={{
              padding: "24px",
              "text-align": "center",
              color: "var(--text-secondary)",
              "font-size": "13px",
            }}
          >
            No conversations yet.
            <br />
            <span style={{ "font-size": "11px" }}>Start using TanStack AI to see activity here.</span>
          </div>
        }
      >
        <For each={filteredConversations()}>
          {(conv) => (
            <div
              class={`${styles().utilRow} ${store.activeConversationId === conv.id ? styles().utilRowSelected : ""}`}
              onClick={() => setActiveConversation(conv.id)}
            >
              <div style={{ display: "flex", "flex-direction": "column", gap: "4px", flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "8px",
                  }}
                >
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      "border-radius": "50%",
                      background: getTypeColor(conv.type),
                      "flex-shrink": "0",
                    }}
                  />
                  <div class={styles().utilKey} style={{ flex: 1 }}>
                    {getConversationTitle(conv)}
                  </div>
                  <div
                    style={{
                      width: "6px",
                      height: "6px",
                      "border-radius": "50%",
                      background: getStatusColor(conv.status),
                      "flex-shrink": "0",
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "8px",
                    "padding-left": "16px",
                  }}
                >
                  <div class={styles().utilStatus} style={{ "font-size": "11px" }}>
                    {getConversationSubtitle(conv)}
                  </div>
                  <Show when={conv.isLoading}>
                    <div
                      style={{
                        width: "10px",
                        height: "10px",
                        border: "2px solid #ec4899",
                        "border-top-color": "transparent",
                        "border-radius": "50%",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                  </Show>
                </div>
              </div>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
};
