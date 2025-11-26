import { createContext, useContext, onMount, onCleanup, ParentComponent } from "solid-js";
import { createStore } from "solid-js/store";
import { aiEventClient } from "@tanstack/ai/event-client";

export interface MessagePart {
  type: "text" | "tool-call" | "tool-result";
  content?: string;
  toolCallId?: string;
  toolName?: string;
  arguments?: string;
  state?: string;
  output?: unknown;
  error?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
  state: string;
  result?: unknown;
  approvalRequired?: boolean;
  approvalId?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  parts?: MessagePart[];
  toolCalls?: ToolCall[];
  chunks?: Chunk[];
  model?: string;
  usage?: TokenUsage;
  thinkingContent?: string;
}

export interface Chunk {
  id: string;
  type: "content" | "tool_call" | "tool_result" | "done" | "error" | "approval" | "thinking";
  timestamp: number;
  messageId?: string;
  content?: string;
  delta?: string;
  toolName?: string;
  toolCallId?: string;
  finishReason?: string;
  error?: string;
  approvalId?: string;
  input?: unknown;
}

export interface Conversation {
  id: string;
  type: "client" | "server";
  label: string;
  messages: Message[];
  chunks: Chunk[];
  model?: string;
  provider?: string;
  status: "active" | "completed" | "error";
  startedAt: number;
  completedAt?: number;
  usage?: TokenUsage;
  iterationCount?: number;
  toolNames?: string[];
  options?: Record<string, unknown>;
  providerOptions?: Record<string, unknown>;
}

export interface AIStoreState {
  conversations: Record<string, Conversation>;
  activeConversationId: string | null;
}

interface AIContextValue {
  state: AIStoreState;
  clearAllConversations: () => void;
  selectConversation: (id: string) => void;
}

const AIContext = createContext<AIContextValue>();

export function useAIStore(): AIContextValue {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error("useAIStore must be used within an AIProvider");
  }
  return context;
}

export const AIProvider: ParentComponent = (props) => {
  const [state, setState] = createStore<AIStoreState>({
    conversations: {},
    activeConversationId: null,
  });

  const streamToConversation = new Map<string, string>();
  const requestToConversation = new Map<string, string>();

  // Helper functions for updating state with spread pattern
  function updateConversation(conversationId: string, updates: Partial<Conversation>): void {
    const conv = state.conversations[conversationId];
    if (!conv) return;
    setState("conversations", conversationId, { ...conv, ...updates });
  }

  function updateMessage(conversationId: string, messageIndex: number, updates: Partial<Message>): void {
    const conv = state.conversations[conversationId];
    if (!conv) return;
    const message = conv.messages[messageIndex];
    if (!message) return;
    setState("conversations", conversationId, {
      ...conv,
      messages: conv.messages.map((msg, idx) => (idx === messageIndex ? { ...msg, ...updates } : msg)),
    });
  }

  function updateToolCall(
    conversationId: string,
    messageIndex: number,
    toolCallIndex: number,
    updates: Partial<ToolCall>
  ): void {
    const conv = state.conversations[conversationId];
    if (!conv) return;
    const message = conv.messages[messageIndex];
    if (!message?.toolCalls) return;
    const toolCall = message.toolCalls[toolCallIndex];
    if (!toolCall) return;

    setState("conversations", conversationId, {
      ...conv,
      messages: conv.messages.map((msg, idx) =>
        idx === messageIndex
          ? {
              ...msg,
              toolCalls: msg.toolCalls?.map((tc, tcIdx) => (tcIdx === toolCallIndex ? { ...tc, ...updates } : tc)),
            }
          : msg
      ),
    });
  }

  function setToolCalls(conversationId: string, messageIndex: number, toolCalls: ToolCall[]): void {
    const conv = state.conversations[conversationId];
    if (!conv) return;
    setState("conversations", conversationId, {
      ...conv,
      messages: conv.messages.map((msg, idx) => (idx === messageIndex ? { ...msg, toolCalls } : msg)),
    });
  }

  function getOrCreateConversation(id: string, type: "client" | "server", label: string): void {
    if (!state.conversations[id]) {
      setState("conversations", id, {
        id,
        type,
        label,
        messages: [],
        chunks: [],
        status: "active",
        startedAt: Date.now(),
      });
      if (!state.activeConversationId) {
        setState("activeConversationId", id);
      }
    }
  }

  function addMessage(conversationId: string, message: Message): void {
    const conv = state.conversations[conversationId];
    if (!conv) return;
    setState("conversations", conversationId, { ...conv, messages: [...conv.messages, message] });
  }

  function addChunk(conversationId: string, chunk: Chunk): void {
    const conv = state.conversations[conversationId];
    if (!conv) return;
    setState("conversations", conversationId, { ...conv, chunks: [...conv.chunks, chunk] });
  }

  function addChunkToMessage(conversationId: string, chunk: Chunk): void {
    const conv = state.conversations[conversationId];
    if (!conv) return;

    if (chunk.messageId) {
      const messageIndex = conv.messages.findIndex((msg) => msg.id === chunk.messageId);

      if (messageIndex !== -1) {
        const message = conv.messages[messageIndex];
        if (!message) return;
        updateMessage(conversationId, messageIndex, { chunks: [...(message.chunks || []), chunk] });
        return;
      } else {
        const newMessage: Message = {
          id: chunk.messageId,
          role: "assistant",
          content: "",
          timestamp: chunk.timestamp,
          model: conv.model,
          chunks: [chunk],
        };
        setState("conversations", conversationId, { ...conv, messages: [...conv.messages, newMessage] });
        return;
      }
    }

    for (let i = conv.messages.length - 1; i >= 0; i--) {
      const message = conv.messages[i];
      if (message && message.role === "assistant") {
        updateMessage(conversationId, i, { chunks: [...(message.chunks || []), chunk] });
        return;
      }
    }
  }

  function updateMessageUsage(conversationId: string, messageId: string | undefined, usage: TokenUsage): void {
    const conv = state.conversations[conversationId];
    if (!conv) return;

    if (messageId) {
      const messageIndex = conv.messages.findIndex((msg) => msg.id === messageId);
      if (messageIndex !== -1) {
        updateMessage(conversationId, messageIndex, { usage });
        return;
      }
    }

    for (let i = conv.messages.length - 1; i >= 0; i--) {
      const message = conv.messages[i];
      if (message && message.role === "assistant") {
        updateMessage(conversationId, i, { usage });
        return;
      }
    }
  }

  // Public actions
  function clearAllConversations() {
    setState("conversations", {});
    setState("activeConversationId", null);
    streamToConversation.clear();
    requestToConversation.clear();
  }

  function selectConversation(id: string) {
    setState("activeConversationId", id);
  }

  // Register all event listeners on mount
  onMount(() => {
    const cleanupFns: Array<() => void> = [];

    // ============= Client Events =============

    cleanupFns.push(
      aiEventClient.on(
        "client:created",
        (e) => {
          const clientId = e.payload.clientId;
          getOrCreateConversation(clientId, "client", `Client Chat (${clientId.substring(0, 8)})`);
          updateConversation(clientId, { model: undefined, provider: "Client" });
        },
        { withEventTarget: false }
      )
    );

    cleanupFns.push(
      aiEventClient.on(
        "client:message-sent",
        (e) => {
          const clientId = e.payload.clientId;
          if (!state.conversations[clientId]) {
            getOrCreateConversation(clientId, "client", `Client Chat (${clientId.substring(0, 8)})`);
          }
          addMessage(clientId, {
            id: e.payload.messageId,
            role: "user",
            content: e.payload.content,
            timestamp: e.payload.timestamp,
          });
          updateConversation(clientId, { status: "active" });
        },
        { withEventTarget: false }
      )
    );

    cleanupFns.push(
      aiEventClient.on(
        "client:message-appended",
        (e) => {
          const clientId = e.payload.clientId;
          const role = e.payload.role;

          if (role === "user") return;
          if (!state.conversations[clientId]) return;

          if (role === "assistant") {
            addMessage(clientId, {
              id: e.payload.messageId,
              role: "assistant",
              content: e.payload.contentPreview,
              timestamp: e.payload.timestamp,
            });
          }
        },
        { withEventTarget: false }
      )
    );

    cleanupFns.push(
      aiEventClient.on(
        "client:loading-changed",
        (e) => {
          const clientId = e.payload.clientId;
          if (state.conversations[clientId]) {
            updateConversation(clientId, { status: e.payload.isLoading ? "active" : "completed" });
          }
        },
        { withEventTarget: false }
      )
    );

    cleanupFns.push(
      aiEventClient.on(
        "client:stopped",
        (e) => {
          const clientId = e.payload.clientId;
          if (state.conversations[clientId]) {
            updateConversation(clientId, { status: "completed", completedAt: e.payload.timestamp });
          }
        },
        { withEventTarget: false }
      )
    );

    cleanupFns.push(
      aiEventClient.on(
        "client:messages-cleared",
        (e) => {
          const clientId = e.payload.clientId;
          if (state.conversations[clientId]) {
            updateConversation(clientId, { messages: [], chunks: [], usage: undefined });
          }
        },
        { withEventTarget: false }
      )
    );

    cleanupFns.push(
      aiEventClient.on(
        "client:reloaded",
        (e) => {
          const clientId = e.payload.clientId;
          const conv = state.conversations[clientId];
          if (conv) {
            updateConversation(clientId, {
              messages: conv.messages.slice(0, e.payload.fromMessageIndex),
              status: "active",
            });
          }
        },
        { withEventTarget: false }
      )
    );

    cleanupFns.push(
      aiEventClient.on(
        "client:error-changed",
        (e) => {
          const clientId = e.payload.clientId;
          if (state.conversations[clientId] && e.payload.error) {
            updateConversation(clientId, { status: "error" });
          }
        },
        { withEventTarget: false }
      )
    );

    cleanupFns.push(
      aiEventClient.on(
        "client:assistant-message-updated",
        (e) => {
          const clientId = e.payload.clientId;
          const messageId = e.payload.messageId;
          const content = e.payload.content;

          if (!state.conversations[clientId]) return;

          const conv = state.conversations[clientId];
          const lastMessage = conv.messages[conv.messages.length - 1];

          if (lastMessage && lastMessage.role === "assistant" && lastMessage.id === messageId) {
            updateMessage(clientId, conv.messages.length - 1, { content, model: conv.model });
          } else {
            addMessage(clientId, {
              id: messageId,
              role: "assistant",
              content: content,
              timestamp: e.payload.timestamp,
              model: conv.model,
              chunks: [],
            });
          }
        },
        { withEventTarget: false }
      )
    );

    cleanupFns.push(
      aiEventClient.on(
        "client:tool-call-updated",
        (e) => {
          const {
            clientId,
            messageId,
            toolCallId,
            toolName,
            state: toolCallState,
            arguments: args,
          } = e.payload as {
            clientId: string;
            messageId: string;
            toolCallId: string;
            toolName: string;
            state: string;
            arguments: unknown;
            timestamp: number;
          };

          if (!state.conversations[clientId]) return;

          const conv = state.conversations[clientId];
          const messageIndex = conv.messages.findIndex((m: Message) => m.id === messageId);
          if (messageIndex === -1) return;

          const message = conv.messages[messageIndex];
          if (!message) return;

          const toolCalls = message.toolCalls || [];
          const existingToolIndex = toolCalls.findIndex((t: ToolCall) => t.id === toolCallId);

          const toolCall: ToolCall = {
            id: toolCallId,
            name: toolName,
            arguments: JSON.stringify(args, null, 2),
            state: toolCallState,
          };

          if (existingToolIndex >= 0) {
            updateToolCall(clientId, messageIndex, existingToolIndex, toolCall);
          } else {
            setToolCalls(clientId, messageIndex, [...toolCalls, toolCall]);
          }
        },
        { withEventTarget: false }
      )
    );

    cleanupFns.push(
      aiEventClient.on(
        "client:approval-requested",
        (e) => {
          const { clientId, messageId, toolCallId, approvalId } = e.payload;

          if (!state.conversations[clientId]) return;

          const conv = state.conversations[clientId];
          const messageIndex = conv.messages.findIndex((m) => m.id === messageId);
          if (messageIndex === -1) return;

          const message = conv.messages[messageIndex];
          if (!message?.toolCalls) return;

          const toolCallIndex = message.toolCalls.findIndex((t) => t.id === toolCallId);
          if (toolCallIndex === -1) return;

          updateToolCall(clientId, messageIndex, toolCallIndex, {
            approvalRequired: true,
            approvalId,
            state: "approval-requested",
          });
        },
        { withEventTarget: false }
      )
    );

    // ============= Tool Events =============

    cleanupFns.push(
      aiEventClient.on(
        "tool:result-added",
        (e) => {
          const { clientId, toolCallId, output, state: resultState } = e.payload;

          if (!state.conversations[clientId]) return;

          const conv = state.conversations[clientId];

          for (let messageIndex = conv.messages.length - 1; messageIndex >= 0; messageIndex--) {
            const message = conv.messages[messageIndex];
            if (!message?.toolCalls) continue;

            const toolCallIndex = message.toolCalls.findIndex((t: ToolCall) => t.id === toolCallId);
            if (toolCallIndex >= 0) {
              updateToolCall(clientId, messageIndex, toolCallIndex, {
                result: output,
                state: resultState === "output-error" ? "error" : "complete",
              });
              return;
            }
          }
        },
        { withEventTarget: false }
      )
    );

    cleanupFns.push(
      aiEventClient.on(
        "tool:approval-responded",
        (e) => {
          const { clientId, toolCallId, approved } = e.payload;

          if (!state.conversations[clientId]) return;

          const conv = state.conversations[clientId];

          for (let messageIndex = conv.messages.length - 1; messageIndex >= 0; messageIndex--) {
            const message = conv.messages[messageIndex];
            if (!message?.toolCalls) continue;

            const toolCallIndex = message.toolCalls.findIndex((t: ToolCall) => t.id === toolCallId);
            if (toolCallIndex >= 0) {
              updateToolCall(clientId, messageIndex, toolCallIndex, {
                state: approved ? "approved" : "denied",
                approvalRequired: false,
              });
              return;
            }
          }
        },
        { withEventTarget: false }
      )
    );

    // ============= Stream Events =============

    cleanupFns.push(
      aiEventClient.on(
        "stream:started",
        (e) => {
          const streamId = e.payload.streamId;
          const model = e.payload.model;
          const provider = e.payload.provider;
          const clientId = e.payload.clientId;

          if (clientId && state.conversations[clientId]) {
            streamToConversation.set(streamId, clientId);
            updateConversation(clientId, { model, provider, status: "active" });
            return;
          }

          const activeClient = Object.values(state.conversations).find(
            (c) => c.type === "client" && c.status === "active" && !c.model
          );

          if (activeClient) {
            streamToConversation.set(streamId, activeClient.id);
            updateConversation(activeClient.id, { model, provider });
          } else {
            const existingServerConv = Object.values(state.conversations).find(
              (c) => c.type === "server" && c.model === model
            );

            if (existingServerConv) {
              streamToConversation.set(streamId, existingServerConv.id);
              updateConversation(existingServerConv.id, { status: "active" });
            } else {
              const serverId = `server-${model}`;
              getOrCreateConversation(serverId, "server", `${model} Server`);
              streamToConversation.set(streamId, serverId);
              updateConversation(serverId, { model, provider });
            }
          }
        },
        { withEventTarget: false }
      )
    );

    cleanupFns.push(
      aiEventClient.on(
        "stream:chunk:content",
        (e) => {
          const streamId = e.payload.streamId;
          const conversationId = streamToConversation.get(streamId);
          if (!conversationId) return;

          const chunk: Chunk = {
            id: `chunk-${Date.now()}-${Math.random()}`,
            type: "content",
            messageId: e.payload.messageId,
            content: e.payload.content,
            delta: e.payload.delta,
            timestamp: e.payload.timestamp,
          };

          const conv = state.conversations[conversationId];
          if (conv?.type === "client") {
            addChunkToMessage(conversationId, chunk);
          } else {
            addChunk(conversationId, chunk);
          }
        },
        { withEventTarget: false }
      )
    );

    cleanupFns.push(
      aiEventClient.on(
        "stream:chunk:tool-call",
        (e) => {
          const streamId = e.payload.streamId;
          const conversationId = streamToConversation.get(streamId);
          if (!conversationId) return;

          const chunk: Chunk = {
            id: `chunk-${Date.now()}-${Math.random()}`,
            type: "tool_call",
            messageId: e.payload.messageId,
            toolCallId: e.payload.toolCallId,
            toolName: e.payload.toolName,
            timestamp: e.payload.timestamp,
          };

          const conv = state.conversations[conversationId];
          if (conv?.type === "client") {
            addChunkToMessage(conversationId, chunk);
          } else {
            addChunk(conversationId, chunk);
          }
        },
        { withEventTarget: false }
      )
    );

    cleanupFns.push(
      aiEventClient.on(
        "stream:chunk:tool-result",
        (e) => {
          const streamId = e.payload.streamId;
          const conversationId = streamToConversation.get(streamId);
          if (!conversationId) return;

          const chunk: Chunk = {
            id: `chunk-${Date.now()}-${Math.random()}`,
            type: "tool_result",
            messageId: e.payload.messageId,
            toolCallId: e.payload.toolCallId,
            content: e.payload.result,
            timestamp: e.payload.timestamp,
          };

          const conv = state.conversations[conversationId];
          if (conv?.type === "client") {
            addChunkToMessage(conversationId, chunk);
          } else {
            addChunk(conversationId, chunk);
          }

          // Also update the toolCalls array with the result
          if (conv && e.payload.toolCallId) {
            for (let i = conv.messages.length - 1; i >= 0; i--) {
              const message = conv.messages[i];
              if (!message?.toolCalls) continue;

              const toolCallIndex = message.toolCalls.findIndex((t) => t.id === e.payload.toolCallId);
              if (toolCallIndex >= 0) {
                updateToolCall(conversationId, i, toolCallIndex, {
                  result: e.payload.result,
                  state: "complete",
                });
                break;
              }
            }
          }
        },
        { withEventTarget: false }
      )
    );

    cleanupFns.push(
      aiEventClient.on(
        "stream:chunk:thinking",
        (e) => {
          const streamId = e.payload.streamId;
          const conversationId = streamToConversation.get(streamId);
          if (!conversationId) return;

          const chunk: Chunk = {
            id: `chunk-${Date.now()}-${Math.random()}`,
            type: "thinking",
            messageId: e.payload.messageId,
            content: e.payload.content,
            delta: e.payload.delta,
            timestamp: e.payload.timestamp,
          };

          const conv = state.conversations[conversationId];
          if (conv?.type === "client") {
            addChunkToMessage(conversationId, chunk);

            if (e.payload.messageId) {
              const messageIndex = conv.messages.findIndex((msg) => msg.id === e.payload.messageId);
              if (messageIndex !== -1) {
                updateMessage(conversationId, messageIndex, { thinkingContent: e.payload.content });
              }
            }
          } else {
            addChunk(conversationId, chunk);
          }
        },
        { withEventTarget: false }
      )
    );

    cleanupFns.push(
      aiEventClient.on(
        "stream:chunk:done",
        (e) => {
          const streamId = e.payload.streamId;
          const conversationId = streamToConversation.get(streamId);
          if (!conversationId) return;

          const chunk: Chunk = {
            id: `chunk-${Date.now()}-${Math.random()}`,
            type: "done",
            messageId: e.payload.messageId,
            finishReason: e.payload.finishReason || undefined,
            timestamp: e.payload.timestamp,
          };

          if (e.payload.usage) {
            updateConversation(conversationId, { usage: e.payload.usage });
            updateMessageUsage(conversationId, e.payload.messageId, e.payload.usage);
          }

          const conv = state.conversations[conversationId];
          if (conv?.type === "client") {
            addChunkToMessage(conversationId, chunk);
          } else {
            addChunk(conversationId, chunk);
          }

          // Mark as completed when we receive a done chunk with a terminal finish reason
          const finishReason = e.payload.finishReason;
          if (finishReason === "stop" || finishReason === "end_turn" || finishReason === "length") {
            updateConversation(conversationId, { status: "completed", completedAt: e.payload.timestamp });
          }
        },
        { withEventTarget: false }
      )
    );

    cleanupFns.push(
      aiEventClient.on(
        "stream:chunk:error",
        (e) => {
          const streamId = e.payload.streamId;
          const conversationId = streamToConversation.get(streamId);
          if (!conversationId) return;

          const chunk: Chunk = {
            id: `chunk-${Date.now()}-${Math.random()}`,
            type: "error",
            messageId: e.payload.messageId,
            error: e.payload.error,
            timestamp: e.payload.timestamp,
          };

          const conv = state.conversations[conversationId];
          if (conv?.type === "client") {
            addChunkToMessage(conversationId, chunk);
          } else {
            addChunk(conversationId, chunk);
          }

          updateConversation(conversationId, { status: "error", completedAt: e.payload.timestamp });
        },
        { withEventTarget: false }
      )
    );

    cleanupFns.push(
      aiEventClient.on(
        "stream:ended",
        (e) => {
          const streamId = e.payload.streamId;
          const conversationId = streamToConversation.get(streamId);
          if (!conversationId) return;

          updateConversation(conversationId, { status: "completed", completedAt: e.payload.timestamp });
        },
        { withEventTarget: false }
      )
    );

    cleanupFns.push(
      aiEventClient.on(
        "stream:approval-requested",
        (e) => {
          const { streamId, messageId, toolCallId, toolName, input, approvalId, timestamp } = e.payload;

          const conversationId = streamToConversation.get(streamId);
          if (!conversationId) return;

          const conv = state.conversations[conversationId];
          if (!conv) return;

          const chunk: Chunk = {
            id: `chunk-${Date.now()}-${Math.random()}`,
            type: "approval",
            messageId: messageId,
            toolCallId,
            toolName,
            approvalId,
            input,
            timestamp,
          };

          if (conv.type === "client") {
            addChunkToMessage(conversationId, chunk);
          } else {
            addChunk(conversationId, chunk);
          }

          for (let i = conv.messages.length - 1; i >= 0; i--) {
            const message = conv.messages[i];
            if (!message) continue;

            if (message.role === "assistant" && message.toolCalls) {
              const toolCallIndex = message.toolCalls.findIndex((t: ToolCall) => t.id === toolCallId);
              if (toolCallIndex >= 0) {
                updateToolCall(conversationId, i, toolCallIndex, {
                  approvalRequired: true,
                  approvalId,
                  state: "approval-requested",
                });
                return;
              }
            }
          }
        },
        { withEventTarget: false }
      )
    );

    // ============= Processor Events =============

    cleanupFns.push(
      aiEventClient.on(
        "processor:text-updated",
        (e) => {
          const streamId = e.payload.streamId;

          let conversationId = streamToConversation.get(streamId);

          if (!conversationId) {
            const activeClients = Object.values(state.conversations)
              .filter((c) => c.type === "client" && c.status === "active")
              .sort((a, b) => b.startedAt - a.startedAt);

            if (activeClients.length > 0 && activeClients[0]) {
              conversationId = activeClients[0].id;
              streamToConversation.set(streamId, conversationId);
            }
          }

          if (!conversationId) return;

          const conv = state.conversations[conversationId];
          if (!conv) return;

          const lastMessage = conv.messages[conv.messages.length - 1];
          if (lastMessage && lastMessage.role === "assistant") {
            updateMessage(conversationId, conv.messages.length - 1, { content: e.payload.content });
          } else {
            addMessage(conversationId, {
              id: `msg-assistant-${Date.now()}`,
              role: "assistant",
              content: e.payload.content,
              timestamp: e.payload.timestamp,
            });
          }
        },
        { withEventTarget: false }
      )
    );

    cleanupFns.push(
      aiEventClient.on(
        "processor:tool-call-state-changed",
        (e) => {
          const streamId = e.payload.streamId;
          const conversationId = streamToConversation.get(streamId);

          if (!conversationId || !state.conversations[conversationId]) return;

          const conv = state.conversations[conversationId];
          const lastMessage = conv.messages[conv.messages.length - 1];

          if (lastMessage && lastMessage.role === "assistant") {
            const toolCalls = lastMessage.toolCalls || [];
            const existingToolIndex = toolCalls.findIndex((t) => t.id === e.payload.toolCallId);

            const toolCall: ToolCall = {
              id: e.payload.toolCallId,
              name: e.payload.toolName,
              arguments: JSON.stringify(e.payload.arguments, null, 2),
              state: e.payload.state,
            };

            if (existingToolIndex >= 0) {
              updateToolCall(conversationId, conv.messages.length - 1, existingToolIndex, toolCall);
            } else {
              setToolCalls(conversationId, conv.messages.length - 1, [...toolCalls, toolCall]);
            }
          }
        },
        { withEventTarget: false }
      )
    );

    cleanupFns.push(
      aiEventClient.on(
        "processor:tool-result-state-changed",
        (e) => {
          const streamId = e.payload.streamId;
          const conversationId = streamToConversation.get(streamId);

          if (!conversationId || !state.conversations[conversationId]) return;

          const conv = state.conversations[conversationId];

          for (let i = conv.messages.length - 1; i >= 0; i--) {
            const message = conv.messages[i];
            if (!message?.toolCalls) continue;

            const toolCallIndex = message.toolCalls.findIndex((t) => t.id === e.payload.toolCallId);
            if (toolCallIndex >= 0) {
              updateToolCall(conversationId, i, toolCallIndex, {
                result: e.payload.content,
                state: e.payload.error ? "error" : e.payload.state,
              });
              return;
            }
          }
        },
        { withEventTarget: false }
      )
    );

    // ============= Chat Events (for usage tracking) =============

    cleanupFns.push(
      aiEventClient.on(
        "chat:started",
        (e) => {
          const { requestId, model, clientId, toolNames, options, providerOptions } = e.payload;

          if (clientId && state.conversations[clientId]) {
            requestToConversation.set(requestId, clientId);
            updateConversation(clientId, { model, status: "active", toolNames, options, providerOptions });
          }
        },
        { withEventTarget: false }
      )
    );

    cleanupFns.push(
      aiEventClient.on(
        "chat:completed",
        (e) => {
          const { requestId, usage } = e.payload;

          const conversationId = requestToConversation.get(requestId);
          if (conversationId && state.conversations[conversationId] && usage) {
            updateConversation(conversationId, { usage });
            updateMessageUsage(conversationId, undefined, usage);
          }
        },
        { withEventTarget: false }
      )
    );

    cleanupFns.push(
      aiEventClient.on(
        "chat:iteration",
        (e) => {
          const { requestId, iterationNumber } = e.payload;

          const conversationId = requestToConversation.get(requestId);
          if (conversationId && state.conversations[conversationId]) {
            updateConversation(conversationId, { iterationCount: iterationNumber });
          }
        },
        { withEventTarget: false }
      )
    );

    cleanupFns.push(
      aiEventClient.on(
        "usage:tokens",
        (e) => {
          const { requestId, usage, messageId } = e.payload;

          const conversationId = requestToConversation.get(requestId);
          if (conversationId && state.conversations[conversationId]) {
            updateConversation(conversationId, { usage });
            updateMessageUsage(conversationId, messageId, usage);
          }
        },
        { withEventTarget: false }
      )
    );

    // Cleanup all listeners on unmount
    onCleanup(() => {
      for (const cleanup of cleanupFns) {
        cleanup();
      }
      streamToConversation.clear();
      requestToConversation.clear();
    });
  });

  const contextValue: AIContextValue = {
    state,
    clearAllConversations,
    selectConversation,
  };

  return <AIContext.Provider value={contextValue}>{props.children}</AIContext.Provider>;
};
