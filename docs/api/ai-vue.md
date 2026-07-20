---
title: "@tanstack/ai-vue"
id: ai-vue
order: 5
description: "API reference for @tanstack/ai-vue — Vue 3 composables including useChat for streaming chat with full type safety."
keywords:
  - tanstack ai
  - "@tanstack/ai-vue"
  - vue
  - vue 3
  - useChat
  - composables
  - api reference
---

Vue composables for TanStack AI, providing convenient Vue 3 bindings for the headless client.

## Installation

```bash
npm install @tanstack/ai-vue
```

## `useChat(options?)`

Main composable for managing chat state in Vue with full type safety.

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-vue";
import {
  createChatClientOptions,
  type InferChatMessages,
} from "@tanstack/ai-client";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { ref } from "vue";

const updateUIDef = toolDefinition({
  name: "updateUI",
  description: "Show a notification in the UI",
  inputSchema: z.object({ message: z.string() }),
});

const notification = ref<string | null>(null);

// In <script setup>
const updateUI = updateUIDef.client((input) => {
  notification.value = input.message;
  return { success: true };
});

const tools = [updateUI];

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents("/api/chat"),
  tools,
});

// Fully typed messages!
type ChatMessages = InferChatMessages<typeof chatOptions>;

const { messages, sendMessage, isLoading, error, addToolApprovalResponse } =
  useChat(chatOptions);
```

### Options

Extends `ChatClientOptions` from `@tanstack/ai-client` (minus internal state callbacks):

- `connection` - Connection adapter (required)
- `tools?` - Array of client tool implementations (with `.client()` method)
- `initialMessages?` - Initial messages array
- `id?` - Unique identifier for this chat instance
- `threadId?` - Thread ID for AG-UI run correlation. Persists across sends; auto-generated if omitted
- `forwardedProps?` - Arbitrary client-controlled JSON forwarded to the server in the AG-UI `RunAgentInput.forwardedProps` field (reactive -- changes are synced automatically via `watch`)
- `body?` - **Deprecated.** Use `forwardedProps` instead. Still works for backward compatibility; values are merged into `forwardedProps` on the wire (reactive)
- `context?` - Typed client-local runtime context passed to client tool implementations (reactive). This value is not serialized to the server
- `live?` - Enable live subscription mode (auto-subscribes/unsubscribes)
- `onResponse?` - Callback when response is received
- `onChunk?` - Callback when stream chunk is received
- `onFinish?` - Callback when response finishes
- `onError?` - Callback when error occurs
- `onCustomEvent?` - Callback for custom stream events
- `streamProcessor?` - Stream processing configuration

**Note:** Client tools are now automatically executed - no `onToolCall` callback needed!

### Returns

```typescript
import type { DeepReadonly, ShallowRef } from "vue";
import type { UIMessage } from "@tanstack/ai-vue";
import type { ModelMessage } from "@tanstack/ai/client";
import type {
  MultimodalContent,
  ChatClientState,
  ConnectionStatus,
} from "@tanstack/ai-client";

interface UseChatReturn {
  messages: DeepReadonly<ShallowRef<UIMessage[]>>;
  sendMessage: (content: string | MultimodalContent) => Promise<void>;
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
  status: DeepReadonly<ShallowRef<ChatClientState>>;
  isSubscribed: DeepReadonly<ShallowRef<boolean>>;
  connectionStatus: DeepReadonly<ShallowRef<ConnectionStatus>>;
  sessionGenerating: DeepReadonly<ShallowRef<boolean>>;
  setMessages: (messages: UIMessage[]) => void;
  clear: () => void;
}
```

**Note:** Reactive state (`messages`, `isLoading`, `error`, `status`, `isSubscribed`, `connectionStatus`, `sessionGenerating`) is wrapped in `DeepReadonly<ShallowRef<T>>`. In `<script setup>` read the underlying value with `.value` (e.g., `messages.value`); in `<template>` Vue auto-unwraps the ref, so use the bare name (e.g., `v-for="m in messages"`). Cleanup is automatic via `onScopeDispose`.

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

const input = ref("");

const { messages, sendMessage, isLoading } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
});

const handleSubmit = () => {
  if (input.value.trim() && !isLoading.value) {
    sendMessage(input.value);
    input.value = "";
  }
};
</script>

<template>
  <div>
    <div>
      <div v-for="message in messages" :key="message.id">
        <strong>{{ message.role }}:</strong>
        <template v-for="(part, idx) in message.parts" :key="idx">
          <div
            v-if="part.type === 'thinking'"
            class="text-sm text-gray-500 italic"
          >
            Thinking: {{ part.content }}
          </div>
          <span v-else-if="part.type === 'text'">{{ part.content }}</span>
        </template>
      </div>
    </div>
    <form @submit.prevent="handleSubmit">
      <input v-model="input" :disabled="isLoading" />
      <button type="submit" :disabled="isLoading">Send</button>
    </form>
  </div>
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
    <template v-for="message in messages" :key="message.id">
      <template v-for="part in message.parts" :key="part.id">
        <div
          v-if="
            part.type === 'tool-call' &&
            part.state === 'approval-requested' &&
            part.approval
          "
        >
          <p>Approve: {{ part.name }}</p>
          <button
            @click="
              addToolApprovalResponse({
                id: part.approval!.id,
                approved: true,
              })
            "
          >
            Approve
          </button>
          <button
            @click="
              addToolApprovalResponse({
                id: part.approval!.id,
                approved: false,
              })
            "
          >
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
import { ref } from "vue";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-vue";
import {
  createChatClientOptions,
  type InferChatMessages,
} from "@tanstack/ai-client";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

const updateUIDef = toolDefinition({
  name: "updateUI",
  description: "Show a notification in the UI",
  inputSchema: z.object({ message: z.string(), type: z.string() }),
});

const saveToStorageDef = toolDefinition({
  name: "saveToStorage",
  description: "Save a value to localStorage",
  inputSchema: z.object({ key: z.string(), value: z.string() }),
});

const notification = ref<{ message: string; type: string } | null>(null);

// Create client implementations
const updateUI = updateUIDef.client((input) => {
  // input is fully typed!
  notification.value = { message: input.message, type: input.type };
  return { success: true };
});

const saveToStorage = saveToStorageDef.client((input) => {
  localStorage.setItem(input.key, input.value);
  return { saved: true };
});

// Create typed tools array (no 'as const' needed!)
const tools = [updateUI, saveToStorage];

const { messages, sendMessage } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
  tools, // Automatic execution, full type safety
});
</script>

<template>
  <div>
    <template v-for="message in messages" :key="message.id">
      <template v-for="(part, idx) in message.parts" :key="idx">
        <div v-if="part.type === 'tool-call' && part.name === 'updateUI'">
          Tool executed: {{ part.name }}
        </div>
      </template>
    </template>
  </div>
</template>
```

## Generation Composables

Vue composables for one-shot generation tasks (images, speech, transcription, summarization, video). All share the same pattern: provide a `connection` or `fetcher`, call `generate()`, and read reactive state.

### `useGeneration(options)`

Base composable for custom generation types. All specialized composables below are built on this.

```typescript
import { useGeneration } from "@tanstack/ai-vue";
import { fetchServerSentEvents } from "@tanstack/ai-client";

const { generate, result, isLoading, error, status, stop, reset } =
  useGeneration({
    connection: fetchServerSentEvents("/api/generate/custom"),
  });
```

**Options:** `connection?`, `fetcher?`, `id?`, `body?`, `persistence?`, `autoResume?`, `initialResumeSnapshot?`, `resumeState?`, `onResult?`, `onError?`, `onProgress?`, `onChunk?`

**Returns:** `generate`, `result`, `isLoading`, `error`, `status`, `stop`, `reset`, `resume`, `resumeSnapshot`, `resumeState`, `pendingArtifacts`, `resultArtifacts` -- all reactive state is `DeepReadonly<ShallowRef<T>>`. Read refs with `.value` in `<script setup>`.

For the end-to-end persistence setup, see
[Generation Persistence](../persistence/generation-persistence).

### `useGenerateImage(options)`

Image generation composable. `generate()` accepts `ImageGenerateInput`, result is `ImageGenerationResult`.

### `useGenerateSpeech(options)`

Text-to-speech composable. `generate()` accepts `SpeechGenerateInput`, result is `TTSResult`.

### `useTranscription(options)`

Audio transcription composable. `generate()` accepts `TranscriptionGenerateInput`, result is `TranscriptionResult`.

### `useSummarize(options)`

Text summarization composable. `generate()` accepts `SummarizeGenerateInput`, result is `SummarizationResult`.

### `useGenerateVideo(options)`

Video generation composable with job polling. Returns additional `jobId` and `videoStatus` refs. Accepts extra `onJobCreated?` and `onStatusUpdate?` callbacks.

All generation composables automatically clean up via `onScopeDispose`.

## `createChatClientOptions(options)`

Helper to create typed chat options (re-exported from `@tanstack/ai-client`).

```typescript
import {
  createChatClientOptions,
  type InferChatMessages,
} from "@tanstack/ai-client";
import { fetchServerSentEvents } from "@tanstack/ai-vue";
import { tool1, tool2 } from "./tools";

// Create typed tools array (no 'as const' needed!)
const tools = [tool1, tool2];

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
- `ChatClientOptions<TTools, TContext>` - Chat client options with typed client runtime context
- `ConnectionAdapter` - Connection adapter interface
- `InferChatMessages<T>` - Extract message type from options
- `ChatRequestBody` - Request body type
- `GenerationClientState` - Generation lifecycle state
- `ImageGenerateInput` - Image generation input type
- `SpeechGenerateInput` - Speech generation input type
- `TranscriptionGenerateInput` - Transcription input type
- `SummarizeGenerateInput` - Summarization input type
- `VideoGenerateInput` - Video generation input type
- `VideoGenerateResult` - Video generation result type
- `VideoStatusInfo` - Video job status info

Re-exported from `@tanstack/ai`:

- `toolDefinition()` - Create isomorphic tool definition
- `ToolDefinitionInstance` - Tool definition type
- `ClientTool` - Client tool type
- `ServerTool` - Server tool type

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../tools/tools) - Learn about the isomorphic tool system
- [Client Tools](../tools/client-tools) - Learn about client-side tools
