import { createStore } from "solid-js/store";
import { aiEventClient } from "@tanstack/ai/event-client";

export interface MessagePart {
  type: "text" | "tool-call" | "tool-result";
  content?: string;
  toolCallId?: string;
  toolName?: string;
  arguments?: string;
  state?: string;
  output?: any;
  error?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  parts?: MessagePart[]; // Optional for now to maintain backwards compatibility
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
    state: string;
    approvalRequired?: boolean;
    approvalId?: string;
  }>;
  chunks?: Chunk[]; // Chunks associated with this message (for linking server chunks to client messages)
  model?: string; // Model used for this message (for linking server chunks)
}

export interface Chunk {
  id: string;
  type: "content" | "tool_call" | "tool_result" | "done" | "error" | "approval";
  timestamp: number;
  messageId?: string; // Unique ID for grouping chunks from the same response
  content?: string;
  delta?: string;
  toolName?: string;
  toolCallId?: string;
  finishReason?: string;
  error?: string;
  // Approval-specific fields
  approvalId?: string;
  input?: any;
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
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIStoreState {
  conversations: Record<string, Conversation>;
  activeConversationId: string | null;
}

const [state, setState] = createStore<AIStoreState>({
  conversations: {},
  activeConversationId: null,
});

function getOrCreateConversation(id: string, type: "client" | "server", label: string): void {
  if (!state.conversations[id]) {
    console.log(`[AI Devtools] Creating ${type} conversation:`, id);
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
  if (!state.conversations[conversationId]) {
    console.warn(`[AI Devtools] Conversation ${conversationId} not found for message`);
    return;
  }
  setState("conversations", conversationId, "messages", (msgs) => [...msgs, message]);
}

function addChunk(conversationId: string, chunk: Chunk): void {
  if (!state.conversations[conversationId]) {
    console.warn(`[AI Devtools] Conversation ${conversationId} not found for chunk`);
    return;
  }
  setState("conversations", conversationId, "chunks", (chunks) => [...chunks, chunk]);
}

// Add chunk to the last assistant message in a client conversation
// OR create a new assistant message if the messageId is different
function addChunkToMessage(conversationId: string, chunk: Chunk): void {
  if (!state.conversations[conversationId]) {
    console.warn(`[AI Devtools] Conversation ${conversationId} not found for chunk`);
    return;
  }

  const conv = state.conversations[conversationId];

  // If chunk has a messageId, find or create a message with that ID
  if (chunk.messageId) {
    // First, try to find an existing message with this messageId
    const messageIndex = conv.messages.findIndex((msg) => msg.id === chunk.messageId);

    if (messageIndex !== -1) {
      // Message exists, add chunk to it
      setState(
        "conversations",
        conversationId,
        "messages",
        messageIndex,
        "chunks",
        (chunks) => [...(chunks || []), chunk]
      );
      return;
    } else {
      // Message doesn't exist, create it
      const newMessage: Message = {
        id: chunk.messageId,
        role: "assistant",
        content: "", // Will be filled from accumulated chunks
        timestamp: chunk.timestamp,
        model: conv.model,
        chunks: [chunk],
      };
      setState("conversations", conversationId, "messages", (msgs) => [...msgs, newMessage]);
      return;
    }
  }

  // Fallback: Find the last assistant message (old behavior for backward compatibility)
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const message = conv.messages[i];
    if (message && message.role === "assistant") {
      setState(
        "conversations",
        conversationId,
        "messages",
        i,
        "chunks",
        (chunks) => [...(chunks || []), chunk]
      );
      return;
    }
  }

  console.warn(`[AI Devtools] No assistant message found in conversation ${conversationId} to add chunk`);
}

const streamToConversation = new Map<string, string>();

aiEventClient.on("client:created", (e) => {
  const clientId = e.payload.clientId;
  console.log(`[AI Devtools] 🎨 Client Created:`, clientId);
  getOrCreateConversation(clientId, "client", `Client Chat (${clientId.substring(0, 8)})`);
  setState("conversations", clientId, { model: undefined, provider: "Client" });
}, { withEventTarget: false });

aiEventClient.on("client:message-sent", (e) => {
  const clientId = e.payload.clientId;
  console.log(`[AI Devtools] 📤 User Message:`, clientId, e.payload.content.substring(0, 50));
  if (!state.conversations[clientId]) {
    getOrCreateConversation(clientId, "client", `Client Chat (${clientId.substring(0, 8)})`);
  }
  addMessage(clientId, {
    id: e.payload.messageId,
    role: "user",
    content: e.payload.content,
    timestamp: e.payload.timestamp,
  });
  setState("conversations", clientId, "status", "active");
}, { withEventTarget: false });

aiEventClient.on("client:message-appended", (e) => {
  const clientId = e.payload.clientId;
  const role = e.payload.role;

  // Skip user messages - they're already added via client-message-sent
  if (role === "user") {
    console.log(`[AI Devtools] ⏭️  Skipping duplicate user message from message-appended`);
    return;
  }

  console.log(`[AI Devtools] 💬 ${role} Message:`, clientId, e.payload.contentPreview?.substring(0, 50));
  if (!state.conversations[clientId]) {
    console.warn(`[AI Devtools] Client ${clientId} not found for message-appended`);
    return;
  }

  // Only add assistant messages here, user messages come through client-message-sent
  if (role === "assistant") {
    addMessage(clientId, {
      id: e.payload.messageId,
      role: "assistant",
      content: e.payload.contentPreview,
      timestamp: e.payload.timestamp,
    });
  }
}, { withEventTarget: false });

aiEventClient.on("client:loading-changed", (e) => {
  const clientId = e.payload.clientId;
  if (state.conversations[clientId]) {
    setState("conversations", clientId, "status", e.payload.isLoading ? "active" : "completed");
  }
}, { withEventTarget: false });

aiEventClient.on("client:stopped", (e) => {
  const clientId = e.payload.clientId;
  if (state.conversations[clientId]) {
    setState("conversations", clientId, {
      status: "completed",
      completedAt: e.payload.timestamp,
    });
  }
}, { withEventTarget: false });

aiEventClient.on("client:messages-cleared", (e) => {
  const clientId = e.payload.clientId;
  if (state.conversations[clientId]) {
    setState("conversations", clientId, "messages", []);
    setState("conversations", clientId, "chunks", []);
  }
}, { withEventTarget: false });

aiEventClient.on("stream:started", (e) => {
  const streamId = e.payload.streamId;
  const model = e.payload.model;
  const provider = e.payload.provider;
  const clientId = e.payload.clientId; // Client ID passed from server

  console.log(`[AI Devtools] 🌊 Stream Started:`, streamId, model, clientId ? `(linked to ${clientId})` : '');

  // If clientId is provided, link directly to that client conversation
  if (clientId && state.conversations[clientId]) {
    console.log(`[AI Devtools] ↔️  Linking stream ${streamId} to client ${clientId} via clientId`);
    streamToConversation.set(streamId, clientId);
    setState("conversations", clientId, { model, provider, status: "active" });
    return;
  }

  // Fallback: Try to find active client conversation
  const activeClient = Object.values(state.conversations).find(
    (c) => c.type === "client" && c.status === "active" && !c.model
  );

  if (activeClient) {
    console.log(`[AI Devtools] ↔️  Linking stream ${streamId} to client ${activeClient.id} (fallback)`);
    streamToConversation.set(streamId, activeClient.id);
    setState("conversations", activeClient.id, { model, provider });
  } else {
    console.log(`[AI Devtools] 🖥️  Finding or creating server conversation for model: ${model}`);

    // Try to find existing server conversation with the same model
    const existingServerConv = Object.values(state.conversations).find(
      (c) => c.type === "server" && c.model === model
    );

    if (existingServerConv) {
      console.log(`[AI Devtools] ♻️  Reusing existing server conversation for model ${model}: ${existingServerConv.id}`);
      streamToConversation.set(streamId, existingServerConv.id);
      setState("conversations", existingServerConv.id, { status: "active" });
    } else {
      console.log(`[AI Devtools] ✨ Creating new server conversation for model ${model}`);
      const serverId = `server-${model}`;
      getOrCreateConversation(serverId, "server", `${model} Server`);
      streamToConversation.set(streamId, serverId);
      setState("conversations", serverId, { model, provider });
    }
  }
}, { withEventTarget: false });

aiEventClient.on("stream:chunk:content", (e) => {
  const streamId = e.payload.streamId;
  const conversationId = streamToConversation.get(streamId);
  if (!conversationId) {
    console.warn(`[AI Devtools] No conversation found for stream ${streamId}`);
    return;
  }

  const chunk: Chunk = {
    id: `chunk-${Date.now()}-${Math.random()}`,
    type: "content" as const,
    messageId: e.payload.messageId,
    content: e.payload.content,
    delta: e.payload.delta,
    timestamp: e.payload.timestamp,
  };

  // For client conversations, add chunks to messages. For server-only, keep in conversation chunks
  const conv = state.conversations[conversationId];
  if (conv && conv.type === "client") {
    addChunkToMessage(conversationId, chunk);
  } else {
    addChunk(conversationId, chunk);
  }
}, { withEventTarget: false });

aiEventClient.on("stream:chunk:tool-call", (e) => {
  const streamId = e.payload.streamId;
  const conversationId = streamToConversation.get(streamId);
  if (!conversationId) return;

  const chunk: Chunk = {
    id: `chunk-${Date.now()}-${Math.random()}`,
    type: "tool_call" as const,
    messageId: e.payload.messageId,
    toolCallId: e.payload.toolCallId,
    toolName: e.payload.toolName,
    timestamp: e.payload.timestamp,
  };

  const conv = state.conversations[conversationId];
  if (conv && conv.type === "client") {
    addChunkToMessage(conversationId, chunk);
  } else {
    addChunk(conversationId, chunk);
  }
}, { withEventTarget: false });

aiEventClient.on("stream:chunk:tool-result", (e) => {
  const streamId = e.payload.streamId;
  const conversationId = streamToConversation.get(streamId);
  if (!conversationId) return;

  const chunk: Chunk = {
    id: `chunk-${Date.now()}-${Math.random()}`,
    type: "tool_result" as const,
    messageId: e.payload.messageId,
    toolCallId: e.payload.toolCallId,
    content: e.payload.result,
    timestamp: e.payload.timestamp,
  };

  const conv = state.conversations[conversationId];
  if (conv && conv.type === "client") {
    addChunkToMessage(conversationId, chunk);
  } else {
    addChunk(conversationId, chunk);
  }
}, { withEventTarget: false });

aiEventClient.on("stream:chunk:done", (e) => {
  const streamId = e.payload.streamId;
  const conversationId = streamToConversation.get(streamId);
  if (!conversationId) return;

  const chunk: Chunk = {
    id: `chunk-${Date.now()}-${Math.random()}`,
    type: "done" as const,
    messageId: e.payload.messageId,
    finishReason: e.payload.finishReason || undefined,
    timestamp: e.payload.timestamp,
  };

  // Store usage information if available 
  if (e.payload.usage) {
    setState("conversations", conversationId, "usage", e.payload.usage);
  }

  const conv = state.conversations[conversationId];
  if (conv && conv.type === "client") {
    addChunkToMessage(conversationId, chunk);
  } else {
    addChunk(conversationId, chunk);
  }
}, { withEventTarget: false });

aiEventClient.on("stream:chunk:error", (e) => {
  const streamId = e.payload.streamId;
  const conversationId = streamToConversation.get(streamId);
  if (!conversationId) return;

  const chunk: Chunk = {
    id: `chunk-${Date.now()}-${Math.random()}`,
    type: "error" as const,
    messageId: e.payload.messageId,
    error: e.payload.error,
    timestamp: e.payload.timestamp,
  };

  const conv = state.conversations[conversationId];
  if (conv && conv.type === "client") {
    addChunkToMessage(conversationId, chunk);
  } else {
    addChunk(conversationId, chunk);
  }

  setState("conversations", conversationId, {
    status: "error",
    completedAt: e.payload.timestamp,
  });
}, { withEventTarget: false });

aiEventClient.on("stream:ended", (e) => {
  const streamId = e.payload.streamId;
  const conversationId = streamToConversation.get(streamId);
  if (!conversationId) return;
  console.log(`[AI Devtools] ✅ Stream Ended:`, streamId);
  setState("conversations", conversationId, {
    status: "completed",
    completedAt: e.payload.timestamp,
  });
}, { withEventTarget: false });

aiEventClient.on("processor:text-updated", (e) => {
  const streamId = e.payload.streamId;
  console.log(`[AI Devtools] 🎯 processor-text-updated event received:`, {
    streamId,
    contentLength: e.payload.content?.length,
    contentPreview: e.payload.content?.substring(0, 50),
  });

  // Try to find conversation by streamId first
  let conversationId = streamToConversation.get(streamId);
  console.log(`[AI Devtools]   🔍 Lookup by streamId "${streamId}":`, conversationId || "NOT FOUND");

  // If not found, this might be a client-generated streamId
  // Find the most recent active client conversation
  if (!conversationId) {
    const activeClients = Object.values(state.conversations)
      .filter((c) => c.type === "client" && c.status === "active")
      .sort((a, b) => b.startedAt - a.startedAt);

    console.log(`[AI Devtools]   🔍 Active client conversations:`, {
      total: Object.keys(state.conversations).length,
      activeClients: activeClients.length,
      clients: activeClients.map(c => ({ id: c.id, status: c.status, messageCount: c.messages.length }))
    });

    if (activeClients.length > 0 && activeClients[0]) {
      conversationId = activeClients[0].id;
      // Map this client streamId to the conversation for future updates
      streamToConversation.set(streamId, conversationId);
      console.log(`[AI Devtools] 🔗 Linked client streamId ${streamId} to conversation ${conversationId}`);
    }
  }

  if (!conversationId) {
    console.error(`[AI Devtools] ❌ NO CONVERSATION FOUND for stream ${streamId}`);
    console.log(`[AI Devtools]   Available conversations:`, Object.keys(state.conversations));
    return;
  }

  const conv = state.conversations[conversationId];
  if (!conv) {
    console.error(`[AI Devtools] ❌ Conversation ${conversationId} exists in map but not in state!`);
    return;
  }

  console.log(`[AI Devtools] 🤖 Processing text for conversation ${conversationId}`);
  console.log(`[AI Devtools]   Current messages:`, conv.messages.length);
  console.log(`[AI Devtools]   Last message role:`, conv.messages[conv.messages.length - 1]?.role);

  const lastMessage = conv.messages[conv.messages.length - 1];
  if (lastMessage && lastMessage.role === "assistant") {
    // Update existing assistant message
    console.log(`[AI Devtools]    ↪️  Updating existing assistant message`);
    setState(
      "conversations",
      conversationId,
      "messages",
      conv.messages.length - 1,
      "content",
      e.payload.content
    );
  } else {
    // Create new assistant message
    console.log(`[AI Devtools]    ➕ Creating new assistant message`);
    addMessage(conversationId, {
      id: `msg-assistant-${Date.now()}`,
      role: "assistant",
      content: e.payload.content,
      timestamp: e.payload.timestamp,
    });
  }

  console.log(`[AI Devtools]    ✅ Message processed. Total messages now:`, state.conversations[conversationId]?.messages.length);
}, { withEventTarget: false });

// Client-side assistant message updates (simpler, uses clientId directly)
aiEventClient.on("client:assistant-message-updated", (e) => {
  const clientId = e.payload.clientId;
  const messageId = e.payload.messageId;
  const content = e.payload.content;

  console.log(`[AI Devtools] 📨 client-assistant-message-updated:`, {
    clientId,
    messageId,
    contentLength: content.length,
    contentPreview: content.slice(0, 50) + (content.length > 50 ? '...' : '')
  });

  // Check if conversation exists
  if (!state.conversations[clientId]) {
    console.log(`[AI Devtools]   ❌ No conversation found for clientId:`, clientId);
    return;
  }

  const conv = state.conversations[clientId];
  console.log(`[AI Devtools]   ✅ Found conversation:`, clientId);
  console.log(`[AI Devtools]   Current messages:`, conv.messages.length);

  const lastMessage = conv.messages[conv.messages.length - 1];

  if (lastMessage && lastMessage.role === "assistant" && lastMessage.id === messageId) {
    // Update existing assistant message with same ID
    console.log(`[AI Devtools]    ↪️  Updating existing assistant message (${messageId})`);
    setState(
      "conversations",
      clientId,
      "messages",
      conv.messages.length - 1,
      "content",
      content
    );
    // Also update model if available
    if (conv.model) {
      setState(
        "conversations",
        clientId,
        "messages",
        conv.messages.length - 1,
        "model",
        conv.model
      );
    }
  } else if (lastMessage && lastMessage.role === "assistant" && lastMessage.id !== messageId) {
    // Different assistant message ID - create new
    console.log(`[AI Devtools]    ➕ Creating new assistant message (ID changed: ${lastMessage.id} -> ${messageId})`);
    addMessage(clientId, {
      id: messageId,
      role: "assistant",
      content: content,
      timestamp: e.payload.timestamp,
      model: conv.model, // Store model from conversation
      chunks: [], // Initialize chunks array
    });
  } else {
    // No assistant message or last message is user - create new
    console.log(`[AI Devtools]    ➕ Creating new assistant message (${messageId})`);
    addMessage(clientId, {
      id: messageId,
      role: "assistant",
      content: content,
      timestamp: e.payload.timestamp,
      model: conv.model, // Store model from conversation
      chunks: [], // Initialize chunks array
    });
  }

  console.log(`[AI Devtools]    ✅ Assistant message processed. Total messages now:`, state.conversations[clientId]?.messages.length);
}, { withEventTarget: false });

// Tool call state changes
aiEventClient.on("processor:tool-call-state-changed", (e) => {
  const streamId = e.payload.streamId;
  const conversationId = streamToConversation.get(streamId);

  if (!conversationId || !state.conversations[conversationId]) {
    console.log(`[AI Devtools] 🔧 Tool call for unknown conversation (streamId: ${streamId})`);
    return;
  }

  console.log(`[AI Devtools] 🔧 Tool call state changed:`, e.payload.toolName, e.payload.state);

  const conv = state.conversations[conversationId];
  const lastMessage = conv.messages[conv.messages.length - 1];

  if (lastMessage && lastMessage.role === "assistant") {
    const toolCalls = lastMessage.toolCalls || [];
    const existingToolIndex = toolCalls.findIndex(t => t.id === e.payload.toolCallId);

    const toolCall = {
      id: e.payload.toolCallId,
      name: e.payload.toolName,
      arguments: JSON.stringify(e.payload.arguments, null, 2),
      state: e.payload.state,
    };

    if (existingToolIndex >= 0) {
      // Update existing tool call
      setState(
        "conversations",
        conversationId,
        "messages",
        conv.messages.length - 1,
        "toolCalls",
        existingToolIndex,
        toolCall
      );
    } else {
      // Add new tool call
      setState(
        "conversations",
        conversationId,
        "messages",
        conv.messages.length - 1,
        "toolCalls",
        [...toolCalls, toolCall]
      );
    }
  }
}, { withEventTarget: false });

// Client-side tool call updates (simpler, uses clientId directly)
aiEventClient.on("client:tool-call-updated", (e) => {
  const { clientId, messageId, toolCallId, toolName, state: toolCallState, arguments: args } = e.payload as {
    clientId: string;
    messageId: string;
    toolCallId: string;
    toolName: string;
    state: string;
    arguments: any;
    timestamp: number;
  };

  console.log(`[AI Devtools] 🔧 client-tool-call-updated:`, {
    clientId,
    messageId,
    toolCallId,
    toolName,
    state: toolCallState,
  });

  // Check if conversation exists
  if (!state.conversations[clientId]) {
    console.log(`[AI Devtools]   ❌ No conversation found for clientId:`, clientId);
    return;
  }

  const conv = state.conversations[clientId];
  console.log(`[AI Devtools]   ✅ Found conversation:`, clientId);

  // Find the message by ID
  const messageIndex = conv.messages.findIndex((m: Message) => m.id === messageId);
  if (messageIndex === -1) {
    console.log(`[AI Devtools]   ❌ No message found with ID:`, messageId);
    return;
  }

  const message = conv.messages[messageIndex];
  if (!message) {
    console.log(`[AI Devtools]   ❌ Message is undefined at index:`, messageIndex);
    return;
  }

  const toolCalls = message.toolCalls || [];
  const existingToolIndex = toolCalls.findIndex((t: any) => t.id === toolCallId);

  const toolCall = {
    id: toolCallId,
    name: toolName,
    arguments: JSON.stringify(args, null, 2),
    state: toolCallState,
  };

  if (existingToolIndex >= 0) {
    // Update existing tool call
    console.log(`[AI Devtools]   ↪️  Updating tool call: ${toolName} (${toolCallState})`);
    setState(
      "conversations",
      clientId,
      "messages",
      messageIndex,
      "toolCalls",
      existingToolIndex,
      toolCall
    );
  } else {
    // Add new tool call
    console.log(`[AI Devtools]   ➕ Adding new tool call: ${toolName} (${toolCallState})`);
    setState(
      "conversations",
      clientId,
      "messages",
      messageIndex,
      "toolCalls",
      [...toolCalls, toolCall]
    );
  }
}, { withEventTarget: false });

// Handle approval requests
aiEventClient.on("stream:approval-requested", (e) => {
  const { streamId, messageId, toolCallId, toolName, input, approvalId, timestamp } = e.payload;

  console.log(`[AI Devtools] ⚠️ Approval requested:`, {
    streamId,
    messageId,
    toolCallId,
    toolName,
    approvalId,
  });

  // Find conversation by streamId
  const conversationId = streamToConversation.get(streamId);
  if (!conversationId) {
    console.log(`[AI Devtools]   ❌ No conversation found for streamId:`, streamId);
    return;
  }

  const conv = state.conversations[conversationId];
  if (!conv) {
    console.log(`[AI Devtools]   ❌ No conversation found for conversationId:`, conversationId);
    return;
  }

  console.log(`[AI Devtools]   ✅ Found conversation:`, conversationId);

  // Create an approval chunk
  const chunk: Chunk = {
    id: `chunk-${Date.now()}-${Math.random()}`,
    type: "approval" as const,
    messageId: messageId,
    toolCallId,
    toolName,
    approvalId,
    input,
    timestamp,
  };

  // Add approval chunk
  if (conv.type === "client") {
    addChunkToMessage(conversationId, chunk);
  } else {
    addChunk(conversationId, chunk);
  }

  // Find the assistant message with this tool call
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const message = conv.messages[i];
    if (!message) continue;

    if (message.role === "assistant" && message.toolCalls) {
      const toolCallIndex = message.toolCalls.findIndex((t: any) => t.id === toolCallId);
      if (toolCallIndex >= 0) {
        console.log(`[AI Devtools]   ✅ Found tool call in message ${message.id}, marking as requiring approval`);
        setState(
          "conversations",
          conversationId,
          "messages",
          i,
          "toolCalls",
          toolCallIndex,
          "approvalRequired",
          true
        );
        setState(
          "conversations",
          conversationId,
          "messages",
          i,
          "toolCalls",
          toolCallIndex,
          "approvalId",
          approvalId
        );
        setState(
          "conversations",
          conversationId,
          "messages",
          i,
          "toolCalls",
          toolCallIndex,
          "state",
          "approval-requested"
        );
        return;
      }
    }
  }

  console.log(`[AI Devtools]   ❌ Tool call not found: ${toolCallId}`);
}, { withEventTarget: false });

// Handle client-side approval requests (uses clientId instead of streamId)
aiEventClient.on("client:approval-requested", (e) => {
  const { clientId, messageId, toolCallId, toolName, input, approvalId } = e.payload as {
    clientId: string;
    messageId: string;
    toolCallId: string;
    toolName: string;
    input: any;
    approvalId: string;
    timestamp: number;
  };

  console.log(`[AI Devtools] ⚠️ Client approval requested:`, {
    clientId,
    messageId,
    toolCallId,
    toolName,
    approvalId,
  });

  // Check if conversation exists
  if (!state.conversations[clientId]) {
    console.log(`[AI Devtools]   ❌ No conversation found for clientId:`, clientId);
    return;
  }

  const conv = state.conversations[clientId];
  console.log(`[AI Devtools]   ✅ Found conversation:`, clientId);

  // Find the message by ID
  const messageIndex = conv.messages.findIndex((m: Message) => m.id === messageId);
  if (messageIndex === -1) {
    console.log(`[AI Devtools]   ❌ No message found with ID:`, messageId);
    return;
  }

  const message = conv.messages[messageIndex];
  if (!message) {
    console.log(`[AI Devtools]   ❌ Message is undefined at index:`, messageIndex);
    return;
  }

  // Find the tool call
  if (!message.toolCalls) {
    console.log(`[AI Devtools]   ❌ No tool calls in message:`, messageId);
    return;
  }

  const toolCallIndex = message.toolCalls.findIndex((t: any) => t.id === toolCallId);
  if (toolCallIndex === -1) {
    console.log(`[AI Devtools]   ❌ Tool call not found:`, toolCallId);
    return;
  }

  console.log(`[AI Devtools]   ✅ Found tool call, marking as requiring approval`);

  // Update the tool call to show approval required
  setState(
    "conversations",
    clientId,
    "messages",
    messageIndex,
    "toolCalls",
    toolCallIndex,
    "approvalRequired",
    true
  );
  setState(
    "conversations",
    clientId,
    "messages",
    messageIndex,
    "toolCalls",
    toolCallIndex,
    "approvalId",
    approvalId
  );
  setState(
    "conversations",
    clientId,
    "messages",
    messageIndex,
    "toolCalls",
    toolCallIndex,
    "state",
    "approval-requested"
  );
}, { withEventTarget: false });

// Error tracking
aiEventClient.on("client:error-changed", (e) => {
  const clientId = e.payload.clientId;
  if (state.conversations[clientId]) {
    console.log(`[AI Devtools] ❌ Error in client ${clientId}:`, e.payload.error);
    setState("conversations", clientId, "status", "error");
  }
}, { withEventTarget: false });

export function clearAllConversations() {
  setState("conversations", {});
  setState("activeConversationId", null);
  streamToConversation.clear();
  console.log("[AI Devtools] Cleared all conversations");
}

export function selectConversation(id: string) {
  setState("activeConversationId", id);
}

export { state };

