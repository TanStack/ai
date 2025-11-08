import { Component, For, Show, createSignal, createEffect } from "solid-js";
import { useStyles } from "../styles/use-styles";
import { state, type Conversation, type Message, type Chunk } from "../store/ai-store";

export const ConversationDetails: Component = () => {
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
      default:
        return "#6b7280"; // gray
    }
  };

  const getChunkTypeColor = (type: Chunk["type"]) => {
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
      case "approval":
        return "#f59e0b"; // orange/amber
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
                <div style={{ "font-weight": "600", "font-size": "14px" }}>{conv().label}</div>
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
                {conv().model && `Model: ${conv().model}`}
                {conv().provider && ` • Provider: ${conv().provider}`}
                {conv().completedAt && ` • Duration: ${formatDuration(conv().completedAt! - conv().startedAt)}`}
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
            {/* Only show messages tab for client conversations */}
            <Show when={conv().type === "client"}>
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
            </Show>
            {/* Only show chunks tab for server-only conversations */}
            <Show when={conv().type === "server"}>
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
            </Show>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflow: "auto", padding: "12px" }}>
            {/* Messages Tab */}
            <Show when={activeTab() === "messages"}>
              <Show
                when={conv().messages.length > 0}
                fallback={
                  <div
                    style={{
                      padding: "24px",
                      color: "var(--text-secondary)",
                      "font-size": "13px",
                      "text-align": "center",
                    }}
                  >
                    No messages yet. Start a conversation to see messages here.
                  </div>
                }
              >
                <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
                  <For each={conv().messages}>
                    {(msg) => (
                      <div
                        style={{
                          padding: "16px",
                          "border-radius": "8px",
                          background:
                            msg.role === "user"
                              ? "linear-gradient(135deg, oklch(0.25 0.04 260) 0%, oklch(0.22 0.03 260) 100%)"
                              : "linear-gradient(135deg, oklch(0.25 0.04 142) 0%, oklch(0.22 0.03 142) 100%)",
                          border: `1.5px solid ${msg.role === "user" ? "oklch(0.5 0.15 260)" : "oklch(0.5 0.15 142)"}`,
                          "box-shadow": "0 1px 3px rgba(0, 0, 0, 0.12)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            "align-items": "center",
                            gap: "10px",
                            "margin-bottom": "12px",
                          }}
                        >
                          <div
                            style={{
                              width: "28px",
                              height: "28px",
                              "border-radius": "50%",
                              background: msg.role === "user" ? "oklch(0.5 0.2 260)" : "oklch(0.5 0.2 142)",
                              display: "flex",
                              "align-items": "center",
                              "justify-content": "center",
                              "font-weight": "700",
                              "font-size": "14px",
                              color: "white",
                              "flex-shrink": "0",
                            }}
                          >
                            {msg.role === "user" ? "U" : "🤖"}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                "font-weight": "600",
                                "font-size": "13px",
                                color: msg.role === "user" ? "oklch(0.7 0.15 260)" : "oklch(0.7 0.15 142)",
                                "text-transform": "capitalize",
                              }}
                            >
                              {msg.role}
                            </div>
                          </div>
                          <div
                            style={{
                              "font-size": "10px",
                              color: "oklch(0.6 0.05 260)",
                              "font-family": "monospace",
                            }}
                          >
                            {formatTimestamp(msg.timestamp)}
                          </div>
                        </div>
                        <div
                          style={{
                            "font-size": "13px",
                            "line-height": "1.6",
                            "white-space": "pre-wrap",
                            "word-break": "break-word",
                            color: "oklch(0.85 0.02 260)",
                            "font-family": "system-ui, -apple-system, sans-serif",
                          }}
                        >
                          {msg.content}
                        </div>

                        {/* Tool Calls Display */}
                        <Show when={msg.toolCalls && msg.toolCalls.length > 0}>
                          <div style={{ "margin-top": "8px", display: "flex", "flex-direction": "column", gap: "6px" }}>
                            <For each={msg.toolCalls}>
                              {(tool) => (
                                <div
                                  style={{
                                    padding: "8px",
                                    "border-radius": "6px",
                                    background: tool.approvalRequired
                                      ? "oklch(0.22 0.08 60)" // Warmer orange-ish background for approval required
                                      : "oklch(0.22 0.02 260)",
                                    border: tool.approvalRequired
                                      ? "1px solid oklch(0.4 0.12 60)" // Orange border for approval required
                                      : "1px solid oklch(0.3 0.05 280)",
                                    "font-size": "12px",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      "align-items": "center",
                                      gap: "6px",
                                      "margin-bottom": "4px",
                                    }}
                                  >
                                    <div
                                      style={{
                                        "font-weight": "600",
                                        color: tool.approvalRequired
                                          ? "oklch(0.75 0.15 60)" // Orange text for approval required
                                          : "oklch(0.75 0.15 280)",
                                      }}
                                    >
                                      {tool.approvalRequired ? "⚠️" : "🔧"} {tool.name}
                                    </div>
                                    <div
                                      style={{
                                        "font-size": "10px",
                                        padding: "2px 6px",
                                        "border-radius": "3px",
                                        background: tool.approvalRequired
                                          ? "oklch(0.35 0.12 60)" // Orange badge for approval required
                                          : "oklch(0.35 0.1 280)",
                                        color: tool.approvalRequired ? "oklch(0.85 0.1 60)" : "oklch(0.8 0.1 280)",
                                      }}
                                    >
                                      {tool.state}
                                    </div>
                                    <Show when={tool.approvalRequired}>
                                      <div
                                        style={{
                                          "font-size": "10px",
                                          padding: "2px 6px",
                                          "border-radius": "3px",
                                          background: "oklch(0.45 0.15 30)",
                                          color: "oklch(0.95 0.05 60)",
                                          "font-weight": "600",
                                        }}
                                      >
                                        APPROVAL REQUIRED
                                      </div>
                                    </Show>
                                  </div>
                                  <Show when={tool.arguments}>
                                    <div
                                      style={{
                                        "font-family": "monospace",
                                        "font-size": "11px",
                                        color: "oklch(0.7 0.05 260)",
                                        "white-space": "pre-wrap",
                                        "word-break": "break-all",
                                      }}
                                    >
                                      {tool.arguments}
                                    </div>
                                  </Show>
                                </div>
                              )}
                            </For>
                          </div>
                        </Show>

                        {/* Chunks Display (for client conversations with server chunks) */}
                        <Show when={msg.chunks && msg.chunks.length > 0}>
                          <details style={{ "margin-top": "12px" }}>
                            <summary
                              style={{
                                cursor: "pointer",
                                "font-size": "11px",
                                "font-weight": "600",
                                color: "oklch(0.65 0.08 260)",
                                padding: "8px",
                                background: "oklch(0.2 0.02 260)",
                                "border-radius": "6px",
                                border: "1px solid oklch(0.28 0.03 260)",
                                "user-select": "none",
                              }}
                            >
                              <div style={{ display: "flex", "flex-direction": "column", gap: "6px" }}>
                                {/* Header */}
                                <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
                                  <span>📦 Server Chunks ({msg.chunks?.length || 0})</span>
                                  <Show when={msg.chunks!.some((c) => c.type === "tool_call")}>
                                    <span
                                      style={{
                                        padding: "2px 6px",
                                        "border-radius": "3px",
                                        background: "oklch(0.3 0.1 280)",
                                        color: "oklch(0.75 0.12 280)",
                                        "font-size": "9px",
                                      }}
                                    >
                                      🔧 Tool Calls
                                    </span>
                                  </Show>
                                  <Show when={msg.chunks!.some((c) => c.type === "error")}>
                                    <span
                                      style={{
                                        padding: "2px 6px",
                                        "border-radius": "3px",
                                        background: "oklch(0.3 0.15 25)",
                                        color: "oklch(0.75 0.2 25)",
                                        "font-size": "9px",
                                      }}
                                    >
                                      ❌ Error
                                    </span>
                                  </Show>
                                  <Show when={msg.chunks!.find((c) => c.type === "done")?.finishReason}>
                                    <span
                                      style={{
                                        padding: "2px 6px",
                                        "border-radius": "3px",
                                        background: "oklch(0.3 0.1 142)",
                                        color: "oklch(0.75 0.15 142)",
                                        "font-size": "9px",
                                      }}
                                    >
                                      ✓ {msg.chunks!.find((c) => c.type === "done")?.finishReason}
                                    </span>
                                  </Show>
                                </div>

                                {/* Accumulated Content Preview */}
                                <Show
                                  when={msg
                                    .chunks!.filter((c) => c.type === "content" && (c.content || c.delta))
                                    .map((c) => c.delta || c.content)
                                    .join("")}
                                >
                                  {(accumulatedContent) => (
                                    <div
                                      style={{
                                        "font-family": "monospace",
                                        "font-size": "10px",
                                        color: "oklch(0.75 0.05 260)",
                                        "white-space": "nowrap",
                                        overflow: "hidden",
                                        "text-overflow": "ellipsis",
                                        "max-width": "100%",
                                        "font-weight": "400",
                                        "margin-top": "2px",
                                      }}
                                      title={accumulatedContent()}
                                    >
                                      {accumulatedContent()}
                                    </div>
                                  )}
                                </Show>
                              </div>
                            </summary>
                            <div
                              style={{
                                "margin-top": "8px",
                                padding: "8px",
                                background: "oklch(0.18 0.02 260)",
                                "border-radius": "6px",
                                border: "1px solid oklch(0.25 0.03 260)",
                              }}
                            >
                              <div style={{ display: "flex", "flex-direction": "column", gap: "4px" }}>
                                <For each={msg.chunks}>
                                  {(chunk, index) => {
                                    const [showRaw, setShowRaw] = createSignal(false);

                                    return (
                                      <div
                                        style={{
                                          padding: "6px 8px",
                                          "border-radius": "4px",
                                          background: "oklch(0.22 0.02 260)",
                                          border: "1px solid oklch(0.28 0.03 260)",
                                          "font-size": "10px",
                                        }}
                                      >
                                        {/* Chunk Header */}
                                        <div
                                          style={{
                                            display: "flex",
                                            "align-items": "center",
                                            gap: "6px",
                                            "margin-bottom": "4px",
                                          }}
                                        >
                                          {/* Chunk Number */}
                                          <div
                                            style={{
                                              "font-size": "9px",
                                              "font-weight": "600",
                                              color: "oklch(0.6 0.05 260)",
                                              "min-width": "24px",
                                            }}
                                          >
                                            #{index() + 1}
                                          </div>

                                          {/* Type Badge */}
                                          <div
                                            style={{
                                              display: "flex",
                                              "align-items": "center",
                                              gap: "3px",
                                            }}
                                          >
                                            <div
                                              style={{
                                                width: "5px",
                                                height: "5px",
                                                "border-radius": "50%",
                                                background: getChunkTypeColor(chunk.type),
                                              }}
                                            />
                                            <div
                                              style={{
                                                "font-weight": "600",
                                                color: "oklch(0.7 0.08 260)",
                                              }}
                                            >
                                              {chunk.type}
                                            </div>
                                          </div>

                                          {/* Tool Name Badge */}
                                          <Show when={chunk.toolName}>
                                            <div
                                              style={{
                                                padding: "1px 4px",
                                                "border-radius": "3px",
                                                background: "oklch(0.3 0.1 280)",
                                                color: "oklch(0.75 0.12 280)",
                                                "font-size": "9px",
                                                "font-weight": "600",
                                              }}
                                            >
                                              🔧 {chunk.toolName}
                                            </div>
                                          </Show>

                                          {/* Timestamp */}
                                          <div
                                            style={{
                                              "margin-left": "auto",
                                              color: "var(--text-secondary)",
                                              "font-size": "9px",
                                            }}
                                          >
                                            {formatTimestamp(chunk.timestamp)}
                                          </div>

                                          {/* Toggle Raw JSON Button */}
                                          <button
                                            onClick={() => setShowRaw(!showRaw())}
                                            style={{
                                              padding: "1px 4px",
                                              "border-radius": "2px",
                                              background: showRaw() ? "oklch(0.35 0.1 260)" : "oklch(0.28 0.03 260)",
                                              border: "1px solid oklch(0.32 0.05 260)",
                                              color: "oklch(0.7 0.08 260)",
                                              "font-size": "8px",
                                              cursor: "pointer",
                                              "font-family": "monospace",
                                              "font-weight": "600",
                                            }}
                                            title={showRaw() ? "Show formatted" : "Show raw JSON"}
                                          >
                                            {showRaw() ? "{}" : "{}"}
                                          </button>
                                        </div>

                                        {/* Chunk Content */}
                                        <Show when={!showRaw()}>
                                          <Show when={chunk.content || chunk.delta}>
                                            <div
                                              style={{
                                                "font-family": "monospace",
                                                "white-space": "pre-wrap",
                                                "word-break": "break-word",
                                                padding: "4px 6px",
                                                background: "oklch(0.2 0.01 260)",
                                                "border-radius": "3px",
                                                color: "oklch(0.8 0.05 260)",
                                                "font-size": "10px",
                                              }}
                                            >
                                              {chunk.delta || chunk.content}
                                            </div>
                                          </Show>
                                          <Show when={chunk.error}>
                                            <div
                                              style={{
                                                color: "oklch(0.65 0.2 25)",
                                                "font-family": "monospace",
                                                padding: "4px 6px",
                                                background: "oklch(0.2 0.05 25)",
                                                "border-radius": "3px",
                                              }}
                                            >
                                              ❌ {chunk.error}
                                            </div>
                                          </Show>
                                          <Show when={chunk.finishReason}>
                                            <div
                                              style={{
                                                color: "oklch(0.7 0.12 142)",
                                                padding: "4px 6px",
                                                background: "oklch(0.2 0.03 142)",
                                                "border-radius": "3px",
                                                "font-weight": "600",
                                              }}
                                            >
                                              ✓ {chunk.finishReason}
                                            </div>
                                          </Show>
                                          <Show when={chunk.type === "approval"}>
                                            <div
                                              style={{
                                                padding: "6px 8px",
                                                background: "oklch(0.25 0.12 50)",
                                                "border-radius": "4px",
                                                border: "1px solid oklch(0.35 0.15 50)",
                                              }}
                                            >
                                              <div
                                                style={{
                                                  color: "oklch(0.75 0.15 50)",
                                                  "font-weight": "600",
                                                  "margin-bottom": "4px",
                                                  "font-size": "10px",
                                                }}
                                              >
                                                ⚠️ Approval Required
                                              </div>
                                              <Show when={chunk.input}>
                                                <div
                                                  style={{
                                                    "font-family": "monospace",
                                                    "font-size": "9px",
                                                    color: "oklch(0.7 0.08 50)",
                                                    "white-space": "pre-wrap",
                                                    "word-break": "break-word",
                                                  }}
                                                >
                                                  Input: {JSON.stringify(chunk.input, null, 2)}
                                                </div>
                                              </Show>
                                            </div>
                                          </Show>
                                        </Show>

                                        {/* Raw JSON View */}
                                        <Show when={showRaw()}>
                                          <div
                                            style={{
                                              "font-family": "monospace",
                                              "white-space": "pre-wrap",
                                              "word-break": "break-word",
                                              padding: "6px",
                                              background: "oklch(0.16 0.01 260)",
                                              "border-radius": "3px",
                                              color: "oklch(0.75 0.08 260)",
                                              "font-size": "9px",
                                              "max-height": "200px",
                                              "overflow-y": "auto",
                                            }}
                                          >
                                            {JSON.stringify(chunk, null, 2)}
                                          </div>
                                        </Show>
                                      </div>
                                    );
                                  }}
                                </For>
                              </div>
                            </div>
                          </details>
                        </Show>
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
                {(() => {
                  // Group chunks by messageId
                  const groupedChunks = new Map<string, Array<Chunk>>();

                  conv().chunks.forEach((chunk) => {
                    const key = chunk.messageId || "no-message-id";
                    if (!groupedChunks.has(key)) {
                      groupedChunks.set(key, []);
                    }
                    groupedChunks.get(key)!.push(chunk);
                  });

                  const groups = Array.from(groupedChunks.entries());

                  return (
                    <div
                      style={{
                        padding: "12px",
                        background: "oklch(0.18 0.02 260)",
                        "border-radius": "8px",
                        border: "1px solid oklch(0.25 0.03 260)",
                      }}
                    >
                      {/* Stream Header */}
                      <div
                        style={{
                          "margin-bottom": "12px",
                          "padding-bottom": "8px",
                          "border-bottom": "1px solid oklch(0.25 0.03 260)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            "align-items": "center",
                            gap: "8px",
                            "margin-bottom": "4px",
                          }}
                        >
                          <div
                            style={{
                              "font-weight": "600",
                              "font-size": "13px",
                              color: "oklch(0.8 0.05 260)",
                            }}
                          >
                            Stream Responses
                          </div>
                          <div
                            style={{
                              padding: "2px 6px",
                              "border-radius": "4px",
                              background: "oklch(0.3 0.08 260)",
                              color: "oklch(0.75 0.1 260)",
                              "font-size": "11px",
                              "font-weight": "600",
                            }}
                          >
                            {conv().chunks.length} chunks · {groups.length} messages
                          </div>
                        </div>
                        <div
                          style={{
                            "font-size": "11px",
                            color: "var(--text-secondary)",
                          }}
                        >
                          Grouped by message ID
                        </div>
                      </div>

                      {/* Message Groups */}
                      <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
                        <For each={groups}>
                          {([messageId, chunks], groupIndex) => {
                            // Calculate accumulated content for preview
                            const accumulatedContent = chunks
                              .filter((c) => c.type === "content" && (c.content || c.delta))
                              .map((c) => c.delta || c.content)
                              .join("");

                            const hasToolCalls = chunks.some((c) => c.type === "tool_call");
                            const hasErrors = chunks.some((c) => c.type === "error");
                            const hasApproval = chunks.some((c) => c.type === "approval");
                            const finishReason = chunks.find((c) => c.type === "done")?.finishReason;

                            return (
                              <details style={{ "margin-bottom": "4px" }}>
                                <summary
                                  style={{
                                    cursor: "pointer",
                                    "font-size": "11px",
                                    "font-weight": "600",
                                    color: "oklch(0.65 0.08 260)",
                                    padding: "10px",
                                    background: "oklch(0.2 0.02 260)",
                                    "border-radius": "6px",
                                    border: "1px solid oklch(0.28 0.03 260)",
                                    "user-select": "none",
                                  }}
                                >
                                  <div style={{ display: "flex", "flex-direction": "column", gap: "6px" }}>
                                    {/* Header */}
                                    <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
                                      <span>Message #{groupIndex() + 1}</span>
                                      <div
                                        style={{
                                          padding: "2px 6px",
                                          "border-radius": "3px",
                                          background: "oklch(0.3 0.08 260)",
                                          color: "oklch(0.75 0.1 260)",
                                          "font-size": "9px",
                                          "font-weight": "600",
                                        }}
                                      >
                                        📦 {chunks.length}
                                      </div>
                                      <Show when={hasToolCalls}>
                                        <span
                                          style={{
                                            padding: "2px 6px",
                                            "border-radius": "3px",
                                            background: "oklch(0.3 0.1 280)",
                                            color: "oklch(0.75 0.12 280)",
                                            "font-size": "9px",
                                          }}
                                        >
                                          🔧 Tool Calls
                                        </span>
                                      </Show>
                                      <Show when={hasErrors}>
                                        <span
                                          style={{
                                            padding: "2px 6px",
                                            "border-radius": "3px",
                                            background: "oklch(0.3 0.15 25)",
                                            color: "oklch(0.75 0.2 25)",
                                            "font-size": "9px",
                                          }}
                                        >
                                          ❌ Error
                                        </span>
                                      </Show>
                                      <Show when={hasApproval}>
                                        <span
                                          style={{
                                            padding: "2px 6px",
                                            "border-radius": "3px",
                                            background: "oklch(0.3 0.15 50)",
                                            color: "oklch(0.75 0.2 50)",
                                            "font-size": "9px",
                                          }}
                                        >
                                          ⚠️ Approval
                                        </span>
                                      </Show>
                                      <Show when={finishReason}>
                                        <span
                                          style={{
                                            padding: "2px 6px",
                                            "border-radius": "3px",
                                            background: "oklch(0.3 0.1 142)",
                                            color: "oklch(0.75 0.15 142)",
                                            "font-size": "9px",
                                          }}
                                        >
                                          ✓ {finishReason}
                                        </span>
                                      </Show>
                                    </div>

                                    {/* Message ID */}
                                    <div
                                      style={{
                                        "font-family": "monospace",
                                        "font-size": "9px",
                                        color: "oklch(0.6 0.05 260)",
                                        "font-weight": "400",
                                      }}
                                      title={messageId}
                                    >
                                      ID: {messageId.substring(0, 20)}...
                                    </div>

                                    {/* Accumulated Content Preview */}
                                    <Show when={accumulatedContent}>
                                      <div
                                        style={{
                                          "font-family": "monospace",
                                          "font-size": "10px",
                                          color: "oklch(0.75 0.05 260)",
                                          "white-space": "nowrap",
                                          overflow: "hidden",
                                          "text-overflow": "ellipsis",
                                          "max-width": "100%",
                                          "font-weight": "400",
                                          "margin-top": "2px",
                                        }}
                                        title={accumulatedContent}
                                      >
                                        {accumulatedContent}
                                      </div>
                                    </Show>
                                  </div>
                                </summary>

                                {/* Chunks in this group */}
                                <div
                                  style={{
                                    "margin-top": "8px",
                                    padding: "8px",
                                    background: "oklch(0.18 0.02 260)",
                                    "border-radius": "6px",
                                    border: "1px solid oklch(0.25 0.03 260)",
                                  }}
                                >
                                  <div style={{ display: "flex", "flex-direction": "column", gap: "4px" }}>
                                    <For each={chunks}>
                                      {(chunk, chunkIndex) => {
                                        const [showRaw, setShowRaw] = createSignal(false);

                                        return (
                                          <div
                                            style={{
                                              padding: "8px 10px",
                                              "border-radius": "6px",
                                              background: "oklch(0.22 0.02 260)",
                                              border: "1px solid oklch(0.28 0.03 260)",
                                              "font-size": "11px",
                                            }}
                                          >
                                            {/* Chunk Header */}
                                            <div
                                              style={{
                                                display: "flex",
                                                "align-items": "center",
                                                gap: "8px",
                                                "margin-bottom": "6px",
                                              }}
                                            >
                                              {/* Chunk Number */}
                                              <div
                                                style={{
                                                  "font-size": "10px",
                                                  "font-weight": "600",
                                                  color: "oklch(0.6 0.05 260)",
                                                  "min-width": "32px",
                                                }}
                                              >
                                                #{chunkIndex() + 1}
                                              </div>

                                              {/* Type Badge */}
                                              <div
                                                style={{
                                                  display: "flex",
                                                  "align-items": "center",
                                                  gap: "4px",
                                                }}
                                              >
                                                <div
                                                  style={{
                                                    width: "6px",
                                                    height: "6px",
                                                    "border-radius": "50%",
                                                    background: getChunkTypeColor(chunk.type),
                                                  }}
                                                />
                                                <div
                                                  style={{
                                                    "font-weight": "600",
                                                    color: "oklch(0.75 0.08 260)",
                                                  }}
                                                >
                                                  {chunk.type}
                                                </div>
                                              </div>

                                              {/* Tool Name Badge */}
                                              <Show when={chunk.toolName}>
                                                <div
                                                  style={{
                                                    padding: "2px 6px",
                                                    "border-radius": "3px",
                                                    background: "oklch(0.3 0.1 280)",
                                                    color: "oklch(0.75 0.12 280)",
                                                    "font-size": "10px",
                                                    "font-weight": "600",
                                                  }}
                                                >
                                                  🔧 {chunk.toolName}
                                                </div>
                                              </Show>

                                              {/* Timestamp */}
                                              <div
                                                style={{
                                                  "margin-left": "auto",
                                                  color: "var(--text-secondary)",
                                                  "font-size": "10px",
                                                }}
                                              >
                                                {formatTimestamp(chunk.timestamp)}
                                              </div>

                                              {/* Toggle Raw JSON Button */}
                                              <button
                                                onClick={() => setShowRaw(!showRaw())}
                                                style={{
                                                  padding: "2px 6px",
                                                  "border-radius": "3px",
                                                  background: showRaw()
                                                    ? "oklch(0.35 0.1 260)"
                                                    : "oklch(0.28 0.03 260)",
                                                  border: "1px solid oklch(0.32 0.05 260)",
                                                  color: "oklch(0.7 0.08 260)",
                                                  "font-size": "10px",
                                                  cursor: "pointer",
                                                  "font-family": "monospace",
                                                  "font-weight": "600",
                                                }}
                                                title={showRaw() ? "Show formatted" : "Show raw JSON"}
                                              >
                                                {showRaw() ? "{}" : "{}"}
                                              </button>
                                            </div>

                                            {/* Chunk Content */}
                                            <Show when={!showRaw()}>
                                              {/* Formatted Content */}
                                              <Show when={chunk.content || chunk.delta}>
                                                <div
                                                  style={{
                                                    "font-family": "monospace",
                                                    "white-space": "pre-wrap",
                                                    "word-break": "break-word",
                                                    padding: "6px 8px",
                                                    background: "oklch(0.2 0.01 260)",
                                                    "border-radius": "4px",
                                                    color: "oklch(0.8 0.05 260)",
                                                    "font-size": "11px",
                                                  }}
                                                >
                                                  {chunk.delta || chunk.content}
                                                </div>
                                              </Show>
                                              <Show when={chunk.error}>
                                                <div
                                                  style={{
                                                    color: "oklch(0.65 0.2 25)",
                                                    "font-family": "monospace",
                                                    padding: "6px 8px",
                                                    background: "oklch(0.2 0.05 25)",
                                                    "border-radius": "4px",
                                                  }}
                                                >
                                                  ❌ {chunk.error}
                                                </div>
                                              </Show>
                                              <Show when={chunk.finishReason}>
                                                <div
                                                  style={{
                                                    color: "oklch(0.7 0.12 142)",
                                                    padding: "6px 8px",
                                                    background: "oklch(0.2 0.03 142)",
                                                    "border-radius": "4px",
                                                    "font-weight": "600",
                                                  }}
                                                >
                                                  ✓ Finish: {chunk.finishReason}
                                                </div>
                                              </Show>
                                              <Show when={chunk.type === "approval"}>
                                                <div
                                                  style={{
                                                    padding: "8px",
                                                    background: "oklch(0.25 0.12 50)",
                                                    "border-radius": "6px",
                                                    border: "1px solid oklch(0.35 0.15 50)",
                                                  }}
                                                >
                                                  <div
                                                    style={{
                                                      color: "oklch(0.75 0.15 50)",
                                                      "font-weight": "600",
                                                      "margin-bottom": "6px",
                                                      "font-size": "11px",
                                                    }}
                                                  >
                                                    ⚠️ Approval Required
                                                  </div>
                                                  <Show when={chunk.input}>
                                                    <div
                                                      style={{
                                                        "font-family": "monospace",
                                                        "font-size": "10px",
                                                        color: "oklch(0.7 0.08 50)",
                                                        "white-space": "pre-wrap",
                                                        "word-break": "break-word",
                                                      }}
                                                    >
                                                      Input: {JSON.stringify(chunk.input, null, 2)}
                                                    </div>
                                                  </Show>
                                                </div>
                                              </Show>
                                            </Show>

                                            {/* Raw JSON View */}
                                            <Show when={showRaw()}>
                                              <div
                                                style={{
                                                  "font-family": "monospace",
                                                  "white-space": "pre-wrap",
                                                  "word-break": "break-word",
                                                  padding: "8px",
                                                  background: "oklch(0.16 0.01 260)",
                                                  "border-radius": "4px",
                                                  color: "oklch(0.75 0.08 260)",
                                                  "font-size": "10px",
                                                  "max-height": "300px",
                                                  "overflow-y": "auto",
                                                }}
                                              >
                                                {JSON.stringify(chunk, null, 2)}
                                              </div>
                                            </Show>
                                          </div>
                                        );
                                      }}
                                    </For>
                                  </div>
                                </div>
                              </details>
                            );
                          }}
                        </For>
                      </div>
                    </div>
                  );
                })()}
              </Show>
            </Show>
          </div>
        </div>
      )}
    </Show>
  );
};
