---
title: TanStack AI Vue API
slug: /api/ai-vue
---

Vue hooks for TanStack AI, providing convenient Vue bindings for the headless client.

## Installation

```bash
npm install @tanstack/ai-vue
```

## `useChat(options?)`

Main composable for managing chat state in Vue with full type safety.

```vue
<script setup lang="ts">
import { ref } from "vue";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-vue";
import {
  clientTools,
  createChatClientOptions,
  type InferChatMessages
} from "@tanstack/ai-client";
// see more in https://tanstack.com/ai/latest/docs/guides/client-tools#defining-client-tools
import { updateUIDef } from "@/tools/definitions";

const notification = ref<string | null>(null);

// Create client tool implementations,
const updateUI = updateUIDef.client((input) => {
  notification.value = input.message;
  return { success: true };
});

// Create typed tools array (no 'as const' needed!)
const tools = clientTools(updateUI);

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents("/api/chat"),
  tools,
});

// Fully typed messages!
type ChatMessages = InferChatMessages<typeof chatOptions>;

const { messages, sendMessage, isLoading, error, addToolApprovalResponse } = useChat(chatOptions);
</script>

<template>
  <div><!-- Chat UI with typed messages --></div>
</template>
```

### Options

Extends `ChatClientOptions` from `@tanstack/ai-client`:

- `connection` - Connection adapter (required)
- `tools?` - Array of client tool implementations (with `.client()` method)
- `initialMessages?` - Initial messages array
- `id?` - Unique identifier for this chat instance
- `body?` - Additional body parameters to send
- `onResponse?` - Callback when response is received
- `onChunk?` - Callback when stream chunk is received
- `onFinish?` - Callback when response finishes
- `onError?` - Callback when error occurs
- `streamProcessor?` - Stream processing configuration

**Note:** Client tools are now automatically executed - no `onToolCall` callback needed!

### Returns

```typescript
interface UseChatReturn {
  messages: DeepReadonly<ShallowRef<Array<UIMessage>>>;
  sendMessage: (content: string) => Promise<void>;
  append: (message: ModelMessage | UIMessage) => Promise<void>;
  addToolResult: (result: {
    toolCallId: string;
    tool: string;
    output: any;
    state?: "output-available" | "output-error";
    errorText?: string;
  }) => Promise<void>;
  addToolApprovalResponse: (response: {
    id: string;
    approved: boolean;
  }) => Promise<void>;
  reload: () => Promise<void>;
  stop: () => void;
  isLoading: DeepReadonly<ShallowRef<boolean>>;
  error: DeepReadonly<ShallowRef<Error | undefined>>;
  setMessages: (messages: UIMessage[]) => void;
  clear: () => void;
}
```

## Connection Adapters

Re-exported from `@tanstack/ai-client` for convenience:

```typescript
import {
  fetchServerSentEvents,
  fetchHttpStream,
  stream,
  type ConnectionAdapter,
} from "@tanstack/ai-vue";
```

## Example: Basic Chat

```vue
<script setup lang="ts">
import { ref } from "vue";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-vue";

const input = ref('')

const { messages, sendMessage, isLoading } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
});

const handleSubmit = (e: Event) => {
  const val = input.value.trim()
  if (((val ?? '') !== '') && !isLoading) {
    sendMessage(input.value);
    input.value = '';
  }
};
</script>
<template>
  <div>
    <div v-for="message in messages" :key="message.id">
      <strong>{{ message.role }}</strong>
      <div v-for="part in message.parts" :key="part.id">
        <span v-if="part.type === 'text'">{{ part.content }}</span>
        <div v-else-if="part.type === 'thinking'" class="text-sm text-gray-500 italic"> 💭 Thinking: {{ part.content }}</div>
        <!-- you can custom more parts -->
      </div>
    </div>
    <form @submit.prevent="handleSubmit">
      <input v-model="input" :disabled="isLoading"/>
      <button type="submit" :disabled="isLoading">
        Send
      </button>
    </form>
  <div>
</template>
```

## Example: Tool Approval

```vue
<script setup lang="ts">
import { useChat, fetchServerSentEvents } from "@tanstack/ai-vue";

const { messages, sendMessage, addToolApprovalResponse } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
});

</script>
<template>
  <div>
    <template v-for="message in messages" >
      <template v-for="part in message.parts" >
        <div  v-if="part.type === 'tool-call' && part.state === 'approval-requested' && part.approval" :key="part.id">
          <p>Approve: {{ part.name }}</p>
          <button @click="() => addToolApprovalResponse({ id: part.approval!.id, approved: true })">
            Approve
          </button>
          <button @click="() => addToolApprovalResponse({ id: part.approval!.id, approved: false })">
            Deny
          </button>
        </div>
        </template>
    </template>
  </div>
</template>
```

## Example: Client Tools with Type Safety

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useChat, fetchServerSentEvents } from "@tanstack/ai-vue";
import { 
  clientTools, 
  createChatClientOptions, 
  type InferChatMessages 
} from "@tanstack/ai-client";
import { updateUIDef, saveToStorageDef } from "@/tools/definitions";

const notification = ref<{message: string; type: 'success' | 'error'}>(null);

const updateUI = updateUIDef.client((input) => {
    // ✅ input is fully typed!
  notification.value = { message: input.message, type: input.type };
  return { success: true };
});

const saveToStorage = saveToStorageDef.client((input) => {
  localStorage.setItem(input.key, input.value);
  return { saved: true };
});

// Create typed tools array (no 'as const' needed!)
const tools = clientTools(updateUI, saveToStorage);

const { messages, sendMessage } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
  tools, // ✅ Automatic execution, full type safety
});

</script>
<template>
  <div>
    <template v-for="message in messages" >
      <template v-for="part in message.parts" >
        <div  v-if="part.type === 'tool-call' && part.name === 'updateUI'" :key="part.id">
          <p>Tool executed: {{ part.name }}</p>
        </div>
      </template>
    </template>
  </div>
</template>
```

## `createChatClientOptions(options)`

Helper to create typed chat options (re-exported from `@tanstack/ai-client`).

```typescript
import { 
  clientTools, 
  createChatClientOptions, 
  type InferChatMessages 
} from "@tanstack/ai-client";

// Create typed tools array (no 'as const' needed!)
const tools = clientTools(tool1, tool2);

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents("/api/chat"),
  tools,
});

type Messages = InferChatMessages<typeof chatOptions>;
```

## Types

Re-exported from `@tanstack/ai-client`:

- `UIMessage<TTools>` - Message type with tool type parameter
- `MessagePart<TTools>` - Message part with tool type parameter
- `TextPart` - Text content part
- `ThinkingPart` - Thinking content part
- `ToolCallPart<TTools>` - Tool call part (discriminated union)
- `ToolResultPart` - Tool result part
- `ChatClientOptions<TTools>` - Chat client options
- `ConnectionAdapter` - Connection adapter interface
- `InferChatMessages<T>` - Extract message type from options

Re-exported from `@tanstack/ai`:

- `toolDefinition()` - Create isomorphic tool definition
- `ToolDefinitionInstance` - Tool definition type
- `ClientTool` - Client tool type
- `ServerTool` - Server tool type

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../guides/tools) - Learn about the isomorphic tool system
- [Client Tools](../guides/client-tools) - Learn about client-side tools
