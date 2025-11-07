import { createStore } from "solid-js/store";
import {
  aiDevtoolsEventClient,
  type ChatMessage,
  type StreamChunk as BaseStreamChunk,
} from "@tanstack/ai-devtools-client";

// Extend the base types from ai-devtools-client for our store needs
export interface Message extends Omit<ChatMessage, "timestamp"> {
  timestamp: number; // Convert string to number for easier handling
  conversationId: string;
}

export interface StreamChunk {
  id: string;
  streamId: string;
  type: "content" | "tool_call" | "tool_result" | "done" | "error";
  timestamp: number;
  conversationId: string;
  content?: string;
  delta?: string;
  toolName?: string;
  toolCallId?: string;
  finishReason?: string;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ToolCall {
  id: string;
  streamId: string;
  conversationId: string;
  toolName: string;
  input: any;
  result?: any;
  state: "started" | "completed" | "failed";
  timestamp: number;
  duration?: number;
  error?: string;
}

export interface Conversation {
  id: string;
  type: "client" | "server";
  status: "active" | "completed" | "error";
  model?: string;
  provider?: string;
  messages: Message[];
  chunks: StreamChunk[];
  toolCalls: ToolCall[];
  startedAt: number;
  completedAt?: number;
  error?: string;
  isLoading?: boolean;
  clientId?: string;
  requestId?: string;
  streamId?: string;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
}

export interface AIStoreState {
  conversations: Record<string, Conversation>;
  activeConversationId: string | null;
}

const [state, setState] = createStore<AIStoreState>({
  conversations: {},
  activeConversationId: null,
});

function getOrCreateConversation(
  id: string,
  type: "client" | "server",
  timestamp: number
): Conversation {
  if (!state.conversations[id]) {
    console.log(`[AI Devtools] Creating new ${type} conversation:`, id);

    // Create the full conversation object
    const newConversation: Conversation = {
      id,
      type,
      status: "active",
      messages: [],
      chunks: [],
      toolCalls: [],
      startedAt: timestamp,
    };

    // Set it in the store
    setState("conversations", id, newConversation);

    if (!state.activeConversationId) {
      setState("activeConversationId", id);
      console.log("[AI Devtools] Auto-selected first conversation:", id);
    }
  }
  return state.conversations[id]!;
}

function findConversationByStream(streamId: string): Conversation | undefined {
  return Object.values(state.conversations).find(
    (conv) => conv.streamId === streamId || conv.requestId === streamId
  );
}

function findConversationByClient(clientId: string): Conversation | undefined {
  return Object.values(state.conversations).find((conv) => conv.clientId === clientId);
}

export function initializeEventListeners() {
  console.log("[AI Devtools] Initializing event listeners...");

  aiDevtoolsEventClient.on("ai-instance-created", (e) => {
    console.log("[AI Devtools] AI Instance Created:", e);
  });

  aiDevtoolsEventClient.on("chat-started", (e) => {
    console.log("[AI Devtools] Chat started:", e);
    const convId = e.payload.requestId;
    getOrCreateConversation(convId, "server", e.payload.timestamp);
    setState("conversations", convId, {
      requestId: e.payload.requestId,
      model: e.payload.model,
    });
  });

  aiDevtoolsEventClient.on("chat-completed", (e) => {
    const conv = findConversationByStream(e.payload.requestId);
    if (conv) {
      setState("conversations", conv.id, {
        status: "completed",
        completedAt: e.payload.timestamp,
        totalTokens: e.payload.usage?.totalTokens,
        promptTokens: e.payload.usage?.promptTokens,
        completionTokens: e.payload.usage?.completionTokens,
      });

      setState("conversations", conv.id, "messages", (msgs) => [
        ...msgs,
        {
          id: `msg-${e.payload.timestamp}`,
          role: "assistant" as const,
          content: e.payload.content,
          timestamp: e.payload.timestamp,
          conversationId: conv.id,
        },
      ]);
    }
  });

  aiDevtoolsEventClient.on("chat-iteration", (e) => {
    const conv = findConversationByStream(e.payload.requestId);
    if (conv) {
      console.log("Chat iteration:", e.payload.iterationNumber, "tools:", e.payload.toolCallCount);
    }
  });

  aiDevtoolsEventClient.on("stream-started", (e) => {
    console.log("[AI Devtools] Stream started:", e);
    const convId = e.payload.streamId;
    getOrCreateConversation(convId, "server", e.payload.timestamp);
    setState("conversations", convId, {
      streamId: e.payload.streamId,
      model: e.payload.model,
      provider: e.payload.provider,
    });
  });

  aiDevtoolsEventClient.on("stream-chunk-content", (e) => {
    const conv = findConversationByStream(e.payload.streamId);
    if (conv) {
      setState("conversations", conv.id, "chunks", (chunks) => [
        ...chunks,
        {
          id: `chunk-${e.payload.timestamp}`,
          streamId: e.payload.streamId,
          type: "content" as const,
          timestamp: e.payload.timestamp,
          conversationId: conv.id,
          content: e.payload.content,
          delta: e.payload.delta,
        },
      ]);
    }
  });

  aiDevtoolsEventClient.on("stream-chunk-tool-call", (e) => {
    const conv = findConversationByStream(e.payload.streamId);
    if (conv) {
      setState("conversations", conv.id, "chunks", (chunks) => [
        ...chunks,
        {
          id: `chunk-${e.payload.timestamp}`,
          streamId: e.payload.streamId,
          type: "tool_call" as const,
          timestamp: e.payload.timestamp,
          conversationId: conv.id,
          toolName: e.payload.toolName,
          toolCallId: e.payload.toolCallId,
        },
      ]);
    }
  });

  aiDevtoolsEventClient.on("stream-chunk-tool-result", (e) => {
    const conv = findConversationByStream(e.payload.streamId);
    if (conv) {
      setState("conversations", conv.id, "chunks", (chunks) => [
        ...chunks,
        {
          id: `chunk-${e.payload.timestamp}`,
          streamId: e.payload.streamId,
          type: "tool_result" as const,
          timestamp: e.payload.timestamp,
          conversationId: conv.id,
          toolCallId: e.payload.toolCallId,
          content: e.payload.result,
        },
      ]);
    }
  });

  aiDevtoolsEventClient.on("stream-chunk-done", (e) => {
    const conv = findConversationByStream(e.payload.streamId);
    if (conv) {
      setState("conversations", conv.id, "chunks", (chunks) => [
        ...chunks,
        {
          id: `chunk-${e.payload.timestamp}`,
          streamId: e.payload.streamId,
          type: "done" as const,
          timestamp: e.payload.timestamp,
          conversationId: conv.id,
          finishReason: e.payload.finishReason || undefined,
          usage: e.payload.usage,
        },
      ]);

      setState("conversations", conv.id, {
        totalTokens: e.payload.usage?.totalTokens,
        promptTokens: e.payload.usage?.promptTokens,
        completionTokens: e.payload.usage?.completionTokens,
      });
    }
  });

  aiDevtoolsEventClient.on("stream-chunk-error", (e) => {
    const conv = findConversationByStream(e.payload.streamId);
    if (conv) {
      setState("conversations", conv.id, "chunks", (chunks) => [
        ...chunks,
        {
          id: `chunk-${e.payload.timestamp}`,
          streamId: e.payload.streamId,
          type: "error" as const,
          timestamp: e.payload.timestamp,
          conversationId: conv.id,
          error: e.payload.error,
        },
      ]);

      setState("conversations", conv.id, {
        status: "error",
        error: e.payload.error,
        completedAt: e.payload.timestamp,
      });
    }
  });

  aiDevtoolsEventClient.on("stream-ended", (e) => {
    const conv = findConversationByStream(e.payload.streamId);
    if (conv) {
      setState("conversations", conv.id, {
        status: "completed",
        completedAt: e.payload.timestamp,
      });
    }
  });

  aiDevtoolsEventClient.on("tool-call-started", (e) => {
    const conv = findConversationByStream(e.payload.streamId);
    if (conv) {
      setState("conversations", conv.id, "toolCalls", (tools) => [
        ...tools,
        {
          id: e.payload.toolCallId,
          streamId: e.payload.streamId,
          conversationId: conv.id,
          toolName: e.payload.toolName,
          input: e.payload.input,
          state: "started" as const,
          timestamp: e.payload.timestamp,
        },
      ]);
    }
  });

  aiDevtoolsEventClient.on("tool-call-completed", (e) => {
    const conv = findConversationByStream(e.payload.streamId);
    if (conv) {
      const toolIndex = conv.toolCalls.findIndex((t) => t.id === e.payload.toolCallId);
      if (toolIndex !== -1) {
        setState("conversations", conv.id, "toolCalls", toolIndex, {
          state: "completed",
          result: e.payload.result,
          duration: e.payload.duration,
        });
      }
    }
  });

  aiDevtoolsEventClient.on("tool-call-failed", (e) => {
    const conv = findConversationByStream(e.payload.streamId);
    if (conv) {
      const toolIndex = conv.toolCalls.findIndex((t) => t.id === e.payload.toolCallId);
      if (toolIndex !== -1) {
        setState("conversations", conv.id, "toolCalls", toolIndex, {
          state: "failed",
          error: e.payload.error,
        });
      }
    }
  });

  aiDevtoolsEventClient.on("client-created", (e) => {
    console.log("[AI Devtools] Client created:", e);
    const convId = e.payload.clientId;
    getOrCreateConversation(convId, "client", e.payload.timestamp);
    setState("conversations", convId, {
      clientId: e.payload.clientId,
    });
  });

  aiDevtoolsEventClient.on("client-message-appended", (e) => {
    console.log("[AI Devtools] Client message appended:", e);
    const conv = findConversationByClient(e.payload.clientId);
    if (conv) {
      setState("conversations", conv.id, "messages", (msgs) => [
        ...msgs,
        {
          id: e.payload.messageId,
          role: e.payload.role as Message["role"],
          content: e.payload.contentPreview,
          timestamp: e.payload.timestamp,
          conversationId: conv.id,
        },
      ]);
    } else {
      console.warn("[AI Devtools] Could not find conversation for client:", e.payload.clientId);
    }
  });

  aiDevtoolsEventClient.on("client-message-sent", (e) => {
    const conv = findConversationByClient(e.payload.clientId);
    if (conv) {
      setState("conversations", conv.id, "messages", (msgs) => [
        ...msgs,
        {
          id: e.payload.messageId,
          role: "user" as const,
          content: e.payload.content,
          timestamp: e.payload.timestamp,
          conversationId: conv.id,
        },
      ]);
    }
  });

  aiDevtoolsEventClient.on("client-loading-changed", (e) => {
    const conv = findConversationByClient(e.payload.clientId);
    if (conv) {
      setState("conversations", conv.id, {
        isLoading: e.payload.isLoading,
        status: e.payload.isLoading ? "active" : conv.status,
      });
    }
  });

  aiDevtoolsEventClient.on("client-error-changed", (e) => {
    const conv = findConversationByClient(e.payload.clientId);
    if (conv) {
      setState("conversations", conv.id, {
        error: e.payload.error || undefined,
        status: e.payload.error ? "error" : conv.status,
      });
    }
  });

  aiDevtoolsEventClient.on("client-messages-cleared", (e) => {
    const conv = findConversationByClient(e.payload.clientId);
    if (conv) {
      setState("conversations", conv.id, "messages", []);
      setState("conversations", conv.id, "chunks", []);
      setState("conversations", conv.id, "toolCalls", []);
    }
  });

  aiDevtoolsEventClient.on("client-stopped", (e) => {
    const conv = findConversationByClient(e.payload.clientId);
    if (conv) {
      setState("conversations", conv.id, {
        status: "completed",
        isLoading: false,
        completedAt: e.payload.timestamp,
      });
    }
  });

  aiDevtoolsEventClient.on("tool-result-added", (e) => {
    const conv = findConversationByClient(e.payload.clientId);
    if (conv) {
      const toolIndex = conv.toolCalls.findIndex((t) => t.id === e.payload.toolCallId);
      if (toolIndex !== -1) {
        setState("conversations", conv.id, "toolCalls", toolIndex, {
          result: e.payload.output,
          state: e.payload.state === "output-error" ? "failed" : "completed",
        });
      } else {
        setState("conversations", conv.id, "toolCalls", (tools) => [
          ...tools,
          {
            id: e.payload.toolCallId,
            streamId: "",
            conversationId: conv.id,
            toolName: e.payload.toolName,
            input: undefined,
            result: e.payload.output,
            state: e.payload.state === "output-error" ? ("failed" as const) : ("completed" as const),
            timestamp: e.payload.timestamp,
          },
        ]);
      }
    }
  });

  aiDevtoolsEventClient.on("processor-text-updated", (e) => {
    const conv = findConversationByStream(e.payload.streamId);
    if (conv) {
      const lastMessage = conv.messages[conv.messages.length - 1];
      if (lastMessage && lastMessage.role === "assistant") {
        setState("conversations", conv.id, "messages", conv.messages.length - 1, {
          content: e.payload.content,
        });
      } else {
        setState("conversations", conv.id, "messages", (msgs) => [
          ...msgs,
          {
            id: `msg-${e.payload.timestamp}`,
            role: "assistant" as const,
            content: e.payload.content,
            timestamp: e.payload.timestamp,
            conversationId: conv.id,
          },
        ]);
      }
    }
  });
}

export function getAIStore() {
  return state;
}

export function setActiveConversation(id: string | null) {
  setState("activeConversationId", id);
}

export function clearAllConversations() {
  setState("conversations", {});
  setState("activeConversationId", null);
}

