import { Component, For, Show } from "solid-js";
import { useStyles } from "../styles/use-styles";
import { state, selectConversation, type Conversation } from "../store/ai-store";

export const ConversationsList: Component<{
  filterType: "all" | "client" | "server";
}> = (props) => {
  const styles = useStyles();

  const filteredConversations = () => {
    const conversations = Object.values(state.conversations);
    if (props.filterType === "all") return conversations;
    return conversations.filter((conv: Conversation) => conv.type === props.filterType);
  };

  const getStatusColor = (status: Conversation["status"]) => {
    switch (status) {
      case "active":
        return "oklch(0.7 0.17 142)"; // green
      case "completed":
        return "oklch(0.65 0.1 260)"; // blue
      case "error":
        return "oklch(0.65 0.2 25)"; // red
      default:
        return "oklch(0.6 0.05 200)";
    }
  };

  const getTypeColor = (type: Conversation["type"]) => {
    switch (type) {
      case "client":
        return "oklch(0.68 0.16 330)"; // pink
      case "server":
        return "oklch(0.68 0.15 280)"; // purple
      default:
        return "oklch(0.6 0.05 200)";
    }
  };

  const hasToolCalls = (conv: Conversation) => {
    return conv.messages.some((msg) => msg.toolCalls && msg.toolCalls.length > 0);
  };

  const countToolCalls = (conv: Conversation) => {
    return conv.messages.reduce((total, msg) => {
      return total + (msg.toolCalls?.length || 0);
    }, 0);
  };

  return (
    <div class={styles().utilList}>
      <For each={filteredConversations()}>
        {(conv: Conversation) => (
          <div
            class={`${styles().utilRow} ${state.activeConversationId === conv.id ? styles().utilRowSelected : ""}`}
            onClick={() => selectConversation(conv.id)}
          >
            <div style={{ display: "flex", "align-items": "center", gap: "8px", flex: 1 }}>
              <div style={{ display: "flex", "align-items": "center", gap: "4px" }}>
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    "border-radius": "50%",
                    background: getTypeColor(conv.type),
                  }}
                />
                <div style={{ "font-weight": 600 }}>{conv.label}</div>
                <Show when={hasToolCalls(conv)}>
                  <div
                    style={{
                      display: "flex",
                      "align-items": "center",
                      gap: "3px",
                      padding: "2px 6px",
                      "border-radius": "4px",
                      background: "oklch(0.35 0.1 280)",
                      color: "oklch(0.8 0.12 280)",
                      "font-size": "11px",
                      "font-weight": "600",
                    }}
                    title={`${countToolCalls(conv)} tool call${countToolCalls(conv) !== 1 ? "s" : ""}`}
                  >
                    🔧 {countToolCalls(conv)}
                  </div>
                </Show>
              </div>
              <div
                style={{
                  width: "6px",
                  height: "6px",
                  "border-radius": "50%",
                  background: getStatusColor(conv.status),
                  "margin-left": "auto",
                }}
              />
            </div>
            <div style={{ display: "flex", "align-items": "center", gap: "8px", "font-size": "0.85em", opacity: 0.7 }}>
              <div style={{ display: "flex", "align-items": "center", gap: "4px" }}>💬 {conv.messages.length}</div>
              <div style={{ display: "flex", "align-items": "center", gap: "4px" }}>📦 {conv.chunks.length}</div>
            </div>
            <Show when={conv.status === "active"}>
              <div style={{ "font-size": "0.85em", color: "oklch(0.7 0.17 142)" }}>⟳ Loading...</div>
            </Show>
          </div>
        )}
      </For>
    </div>
  );
};
