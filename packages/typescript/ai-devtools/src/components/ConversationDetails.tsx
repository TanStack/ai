import { Component, For, Show, createSignal } from "solid-js";
import { useStyles } from "../styles/use-styles";
import { getAIStore, type Conversation, type Message, type StreamChunk, type ToolCall } from "../store/ai-store";

export const ConversationDetails: Component = () => {
  const styles = useStyles();
  const store = getAIStore();
  const [activeTab, setActiveTab] = createSignal<"messages" | "chunks" | "tools">("messages");

  const activeConversation = (): Conversation | undefined => {
    if (!store.activeConversationId) return undefined;
    return store.conversations[store.activeConversationId];
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString() + "." + date.getMilliseconds().toString().padStart(3, "0");
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return "-";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getRoleColor = (role: Message["role"]) => {
    switch (role) {
      case "user":
        return "#3b82f6"; // blue
      case "assistant":
        return "#10b981"; // green
      case "system":
        return "#f59e0b"; // amber
      case "tool":
        return "#8b5cf6"; // purple
      default:
        return "#6b7280"; // gray
    }
  };

  const getChunkTypeColor = (type: StreamChunk["type"]) => {
    switch (type) {
      case "content":
        return "#10b981"; // green
      case "tool_call":
        return "#8b5cf6"; // purple
      case "tool_result":
        return "#3b82f6"; // blue
      case "done":
        return "#6b7280"; // gray
      case "error":
        return "#ef4444"; // red
      default:
        return "#6b7280"; // gray
    }
  };

  const getToolStateColor = (state: ToolCall["state"]) => {
    switch (state) {
      case "started":
        return "#f59e0b"; // amber
      case "completed":
        return "#10b981"; // green
      case "failed":
        return "#ef4444"; // red
      default:
        return "#6b7280"; // gray
    }
  };

  return (
    <Show
      when={activeConversation()}
      fallback={
        <div
          style={{
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            height: "100%",
            color: "var(--text-secondary)",
            "font-size": "14px",
          }}
        >
          Select a conversation to view details
        </div>
      }
    >
      {(conv) => (
        <div style={{ display: "flex", "flex-direction": "column", height: "100%" }}>
          {/* Header */}
          <div class={styles().panelHeader}>
            <div style={{ display: "flex", "flex-direction": "column", gap: "4px" }}>
              <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
                <div style={{ "font-weight": "600", "font-size": "14px" }}>
                  {conv().type === "client" && `Client: ${conv().clientId?.substring(0, 12)}`}
                  {conv().type === "server" && `Server: ${conv().model}`}
                </div>
                <div
                  style={{
                    "font-size": "11px",
                    padding: "2px 8px",
                    "border-radius": "4px",
                    background:
                      conv().status === "active"
                        ? "#3b82f620"
                        : conv().status === "completed"
                        ? "#10b98120"
                        : "#ef444420",
                    color:
                      conv().status === "active" ? "#3b82f6" : conv().status === "completed" ? "#10b981" : "#ef4444",
                  }}
                >
                  {conv().status}
                </div>
              </div>
              <div style={{ "font-size": "11px", color: "var(--text-secondary)" }}>
                {conv().provider && `Provider: ${conv().provider}`}
                {conv().totalTokens && ` • ${conv().totalTokens} tokens`}
                {conv().completedAt && ` • ${formatDuration(conv().completedAt! - conv().startedAt)}`}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              padding: "12px",
              "border-bottom": "1px solid var(--border-color)",
            }}
          >
            <button
              class={styles().actionButton}
              style={{
                background: activeTab() === "messages" ? "#ec4899" : undefined,
                color: activeTab() === "messages" ? "white" : undefined,
                "border-color": activeTab() === "messages" ? "#ec4899" : undefined,
              }}
              onClick={() => setActiveTab("messages")}
            >
              Messages ({conv().messages.length})
            </button>
            <button
              class={styles().actionButton}
              style={{
                background: activeTab() === "chunks" ? "#ec4899" : undefined,
                color: activeTab() === "chunks" ? "white" : undefined,
                "border-color": activeTab() === "chunks" ? "#ec4899" : undefined,
              }}
              onClick={() => setActiveTab("chunks")}
            >
              Chunks ({conv().chunks.length})
            </button>
            <button
              class={styles().actionButton}
              style={{
                background: activeTab() === "tools" ? "#ec4899" : undefined,
                color: activeTab() === "tools" ? "white" : undefined,
                "border-color": activeTab() === "tools" ? "#ec4899" : undefined,
              }}
              onClick={() => setActiveTab("tools")}
            >
              Tools ({conv().toolCalls.length})
            </button>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflow: "auto", padding: "12px" }}>
            {/* Messages Tab */}
            <Show when={activeTab() === "messages"}>
              <Show
                when={conv().messages.length > 0}
                fallback={
                  <div style={{ padding: "12px", color: "var(--text-secondary)", "font-size": "12px" }}>
                    No messages yet
                  </div>
                }
              >
                <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
                  <For each={conv().messages}>
                    {(msg) => (
                      <div
                        style={{
                          padding: "12px",
                          "border-radius": "6px",
                          background: "var(--surface-2)",
                          border: "1px solid var(--border-color)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            "align-items": "center",
                            gap: "8px",
                            "margin-bottom": "8px",
                          }}
                        >
                          <div
                            style={{
                              width: "8px",
                              height: "8px",
                              "border-radius": "50%",
                              background: getRoleColor(msg.role),
                            }}
                          />
                          <div style={{ "font-weight": "600", "font-size": "12px" }}>{msg.role}</div>
                          <div style={{ "font-size": "10px", color: "var(--text-secondary)", "margin-left": "auto" }}>
                            {formatTimestamp(msg.timestamp)}
                          </div>
                        </div>
                        <div
                          style={{
                            "font-size": "12px",
                            "line-height": "1.5",
                            "white-space": "pre-wrap",
                            "word-break": "break-word",
                            "font-family": "monospace",
                          }}
                        >
                          {msg.content}
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </Show>

            {/* Chunks Tab */}
            <Show when={activeTab() === "chunks"}>
              <Show
                when={conv().chunks.length > 0}
                fallback={
                  <div style={{ padding: "12px", color: "var(--text-secondary)", "font-size": "12px" }}>
                    No chunks yet
                  </div>
                }
              >
                <div style={{ display: "flex", "flex-direction": "column", gap: "6px" }}>
                  <For each={conv().chunks}>
                    {(chunk) => (
                      <div
                        style={{
                          padding: "8px 12px",
                          "border-radius": "4px",
                          background: "var(--surface-2)",
                          border: "1px solid var(--border-color)",
                          "font-size": "11px",
                        }}
                      >
                        <div style={{ display: "flex", "align-items": "center", gap: "8px", "margin-bottom": "6px" }}>
                          <div
                            style={{
                              width: "6px",
                              height: "6px",
                              "border-radius": "50%",
                              background: getChunkTypeColor(chunk.type),
                            }}
                          />
                          <div style={{ "font-weight": "600" }}>{chunk.type}</div>
                          {chunk.toolName && (
                            <div
                              style={{
                                padding: "1px 6px",
                                "border-radius": "3px",
                                background: "#8b5cf620",
                                color: "#8b5cf6",
                              }}
                            >
                              {chunk.toolName}
                            </div>
                          )}
                          <div style={{ "margin-left": "auto", color: "var(--text-secondary)", "font-size": "10px" }}>
                            {formatTimestamp(chunk.timestamp)}
                          </div>
                        </div>
                        <Show when={chunk.content || chunk.delta}>
                          <div
                            style={{
                              "font-family": "monospace",
                              "white-space": "pre-wrap",
                              "word-break": "break-word",
                            }}
                          >
                            {chunk.delta || chunk.content}
                          </div>
                        </Show>
                        <Show when={chunk.error}>
                          <div style={{ color: "#ef4444", "font-family": "monospace" }}>{chunk.error}</div>
                        </Show>
                        <Show when={chunk.finishReason}>
                          <div style={{ color: "var(--text-secondary)" }}>Finish: {chunk.finishReason}</div>
                        </Show>
                        <Show when={chunk.usage}>
                          <div style={{ color: "var(--text-secondary)" }}>
                            Tokens: {chunk.usage?.totalTokens} (prompt: {chunk.usage?.promptTokens}, completion:{" "}
                            {chunk.usage?.completionTokens})
                          </div>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </Show>

            {/* Tools Tab */}
            <Show when={activeTab() === "tools"}>
              <Show
                when={conv().toolCalls.length > 0}
                fallback={
                  <div style={{ padding: "12px", color: "var(--text-secondary)", "font-size": "12px" }}>
                    No tool calls yet
                  </div>
                }
              >
                <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
                  <For each={conv().toolCalls}>
                    {(tool) => (
                      <div
                        style={{
                          padding: "12px",
                          "border-radius": "6px",
                          background: "var(--surface-2)",
                          border: "1px solid var(--border-color)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            "align-items": "center",
                            gap: "8px",
                            "margin-bottom": "8px",
                          }}
                        >
                          <div
                            style={{
                              width: "8px",
                              height: "8px",
                              "border-radius": "50%",
                              background: getToolStateColor(tool.state),
                            }}
                          />
                          <div style={{ "font-weight": "600", "font-size": "12px" }}>{tool.toolName}</div>
                          <div
                            style={{
                              "font-size": "10px",
                              padding: "2px 6px",
                              "border-radius": "3px",
                              background: getToolStateColor(tool.state) + "20",
                              color: getToolStateColor(tool.state),
                            }}
                          >
                            {tool.state}
                          </div>
                          {tool.duration !== undefined && (
                            <div style={{ "font-size": "10px", color: "var(--text-secondary)" }}>
                              {formatDuration(tool.duration)}
                            </div>
                          )}
                          <div style={{ "font-size": "10px", color: "var(--text-secondary)", "margin-left": "auto" }}>
                            {formatTimestamp(tool.timestamp)}
                          </div>
                        </div>
                        <Show when={tool.input !== undefined}>
                          <div style={{ "margin-bottom": "8px" }}>
                            <div
                              style={{
                                "font-size": "10px",
                                color: "var(--text-secondary)",
                                "margin-bottom": "4px",
                              }}
                            >
                              Input:
                            </div>
                            <pre
                              style={{
                                margin: 0,
                                "font-size": "11px",
                                "font-family": "monospace",
                                "white-space": "pre-wrap",
                                "word-break": "break-word",
                                padding: "8px",
                                background: "var(--surface-1)",
                                "border-radius": "4px",
                              }}
                            >
                              {JSON.stringify(tool.input, null, 2)}
                            </pre>
                          </div>
                        </Show>
                        <Show when={tool.result !== undefined}>
                          <div>
                            <div
                              style={{
                                "font-size": "10px",
                                color: "var(--text-secondary)",
                                "margin-bottom": "4px",
                              }}
                            >
                              Result:
                            </div>
                            <pre
                              style={{
                                margin: 0,
                                "font-size": "11px",
                                "font-family": "monospace",
                                "white-space": "pre-wrap",
                                "word-break": "break-word",
                                padding: "8px",
                                background: "var(--surface-1)",
                                "border-radius": "4px",
                              }}
                            >
                              {JSON.stringify(tool.result, null, 2)}
                            </pre>
                          </div>
                        </Show>
                        <Show when={tool.error}>
                          <div style={{ color: "#ef4444", "font-size": "11px", "font-family": "monospace" }}>
                            Error: {tool.error}
                          </div>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </div>
        </div>
      )}
    </Show>
  );
};
