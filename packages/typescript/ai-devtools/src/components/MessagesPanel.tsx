import { Component, For, createSignal } from "solid-js";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  tokens?: number;
}

const mockMessages: Message[] = [
  {
    id: "1",
    role: "system",
    content: "You are a helpful AI assistant.",
    timestamp: new Date().toISOString(),
  },
  {
    id: "2",
    role: "user",
    content: "What is TanStack AI?",
    timestamp: new Date().toISOString(),
    tokens: 15,
  },
  {
    id: "3",
    role: "assistant",
    content:
      "TanStack AI is a powerful SDK for building AI-powered applications with a unified API across multiple LLM providers including OpenAI, Anthropic, Gemini, and Ollama.",
    timestamp: new Date().toISOString(),
    tokens: 45,
  },
];

export const MessagesPanel: Component = () => {
  const [messages] = createSignal(mockMessages);

  const getRoleColor = (role: string) => {
    switch (role) {
      case "user":
        return "#3b82f6";
      case "assistant":
        return "#22c55e";
      case "system":
        return "#a855f7";
      default:
        return "#6b7280";
    }
  };

  return (
    <div style={{ padding: "16px", height: "100%", overflow: "auto" }}>
      <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
        <For
          each={messages()}
          children={(message) => (
            <div
              style={{
                padding: "12px",
                background: "#2d2d2d",
                "border-radius": "6px",
                "border-left": `3px solid ${getRoleColor(message.role)}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  "justify-content": "space-between",
                  "align-items": "center",
                  "margin-bottom": "8px",
                }}
              >
                <div style={{ display: "flex", gap: "8px", "align-items": "center" }}>
                  <span
                    style={{
                      "font-size": "12px",
                      "font-weight": "600",
                      color: getRoleColor(message.role),
                      "text-transform": "uppercase",
                    }}
                  >
                    {message.role}
                  </span>
                  {message.tokens && (
                    <span
                      style={{
                        "font-size": "11px",
                        color: "#6b7280",
                        background: "#1e1e1e",
                        padding: "2px 6px",
                        "border-radius": "3px",
                      }}
                    >
                      {message.tokens} tokens
                    </span>
                  )}
                </div>
                <span style={{ "font-size": "11px", color: "#6b7280" }}>
                  {new Date(message.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div style={{ "font-size": "13px", "line-height": "1.5", color: "#e5e5e5" }}>{message.content}</div>
            </div>
          )}
        />
      </div>
    </div>
  );
};
