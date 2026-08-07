---
title: "@tanstack/ai-vue"
id: ai-vue
order: 5
description: "Vue 3 useChat composable, generation helpers, and typed client tools."
keywords:
  - tanstack ai
  - "@tanstack/ai-vue"
  - vue
  - vue 3
  - useChat
  - composables
  - api reference
---

If you need streaming chat in Vue 3 → `useChat` + a connection adapter.

```bash
npm install @tanstack/ai-vue
```

## `useChat(options?)`

1. Call inside `<script setup>`.
2. Pass connection + optional `.client()` tools (auto-executed).
3. Read refs with `.value` in script; bare names in template.

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

type ChatMessages = InferChatMessages<typeof chatOptions>;

const { messages, sendMessage, isLoading, error, addToolApprovalResponse } =
  useChat(chatOptions);
```

### Options

Extends `ChatClientOptions` (minus internal state callbacks):

- `connection` — required adapter
- `tools?` — `.client()` implementations (auto-run)
- `initialMessages?` / `id?` / `threadId?` — seed + AG-UI thread
- `forwardedProps?` — reactive; synced via `watch`
- `context?` — reactive client-local tool context (not serialized)

Also: `live?`, `onResponse?`, `onChunk?`, `onFinish?`, `onError?`, `onCustomEvent?`, `streamProcessor?`.  
`body?` is **deprecated** (still reactive + merged into `forwardedProps`).

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

Reactive fields are `DeepReadonly<ShallowRef<T>>`. Cleanup runs via `onScopeDispose`.

---

## Connection adapters

```typescript
import {
  fetchServerSentEvents,
  fetchHttpStream,
  stream,
  type ConnectionAdapter,
} from "@tanstack/ai-vue";
```

---

## Basic chat

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

## Tool approval

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

## Client tools (typed)

```vue
<script setup lang="ts">
import { ref } from "vue";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-vue";
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

const updateUI = updateUIDef.client((input) => {
  notification.value = { message: input.message, type: input.type };
  return { success: true };
});

const saveToStorage = saveToStorageDef.client((input) => {
  localStorage.setItem(input.key, input.value);
  return { saved: true };
});

const tools = [updateUI, saveToStorage];

const { messages, sendMessage } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
  tools,
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

---

## Generation composables

One-shot tasks: provide `connection` or `fetcher`, call `generate()`, read reactive state. Cleanup via `onScopeDispose`.

### `useGeneration(options)`

Base composable; specialized ones below wrap it.

```typescript
import { useGeneration } from "@tanstack/ai-vue";
import { fetchServerSentEvents } from "@tanstack/ai-client";

const { generate, result, isLoading, error, status, stop, reset } =
  useGeneration({
    connection: fetchServerSentEvents("/api/generate/custom"),
  });
```

**Options:** `connection?`, `fetcher?`, `id?`, `body?`, `onResult?`, `onError?`, `onProgress?`, `onChunk?`

**Returns:** `generate`, `result`, `isLoading`, `error`, `status`, `stop`, `reset`, `runId` (state is `DeepReadonly<ShallowRef<T>>`).

### Specialized

| Composable | Input | Result notes |
| --- | --- | --- |
| `useGenerateImage` | `ImageGenerateInput` | `ImageGenerationResult` |
| `useGenerateSpeech` | `SpeechGenerateInput` | `TTSResult` |
| `useTranscription` | `TranscriptionGenerateInput` | `TranscriptionResult` |
| `useSummarize` | `SummarizeGenerateInput` | `SummarizationResult` |
| `useGenerateVideo` | video input | + `jobId`, `videoStatus`; `onJobCreated?`, `onStatusUpdate?` |

---

## `createChatClientOptions(options)`

```typescript
import {
  createChatClientOptions,
  type InferChatMessages,
} from "@tanstack/ai-client";
import { fetchServerSentEvents } from "@tanstack/ai-vue";
import { tool1, tool2 } from "./tools";

const tools = [tool1, tool2];

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents("/api/chat"),
  tools,
});

type Messages = InferChatMessages<typeof chatOptions>;
```

## Types

From `@tanstack/ai-client`: `UIMessage`, `MessagePart`, `TextPart`, `ThinkingPart`, `ToolCallPart`, `ToolResultPart`, `ChatClientOptions`, `ConnectionAdapter`, `InferChatMessages`, `ChatRequestBody`, generation input/result types (`ImageGenerateInput`, `SpeechGenerateInput`, `TranscriptionGenerateInput`, `SummarizeGenerateInput`, `VideoGenerateInput`, `VideoGenerateResult`, `VideoStatusInfo`, `GenerationClientState`).

From `@tanstack/ai`: `toolDefinition()`, `ToolDefinitionInstance`, `ClientTool`, `ServerTool`.

## Next Steps

- [Getting Started](../getting-started/quick-start)
- [Tools Guide](../tools/tools)
- [Client Tools](../tools/client-tools)
