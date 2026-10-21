---
title: "@tanstack/ai-vue"
id: ai-vue
order: 5
description: "API reference for @tanstack/ai-vue: the useChat composable, generation composables, and Vue 3 bindings for the headless TanStack AI client."
keywords:
  - tanstack ai
  - "@tanstack/ai-vue"
  - vue
  - vue 3
  - useChat
  - composables
  - api reference
---

Vue 3 composables for TanStack AI. To build your first chat, start with the [Quick Start](../getting-started/quick-start). For a typed chat layout, see [Vue Chat UI](../ui/vue).

## Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

vue: @tanstack/ai-vue

<!-- ::end:tabs -->

## `useChat(options)`

Holds the messages and the run state of one chat, and talks to your server route.

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
    <div v-for="message in messages" :key="message.id">
      <strong>{{ message.role }}:</strong>
      <template v-for="(part, idx) in message.parts" :key="idx">
        <span v-if="part.type === 'text'">{{ part.content }}</span>
      </template>
    </div>
    <form @submit.prevent="handleSubmit">
      <input v-model="input" />
      <button type="submit" :disabled="isLoading">Send</button>
    </form>
  </div>
</template>
```

### Options

You must pass `connection` or `fetcher`, not both.

| Option | What it does |
| --- | --- |
| `connection` | Connection adapter, for example `fetchServerSentEvents("/api/chat")`. See [Transports](../transports/overview). |
| `fetcher` | A function that returns a `Response` or a stream. Use it with server functions. |
| `tools` | Client tools from `.client()`. They run when the model calls them. Pass a ref or a getter to change them later. See [Client Tools](../tools/client-tools). |
| `threadId` | The id of this chat. Required when `persistence` is on. If you omit it, the composable makes one after mount. |
| `initialMessages` | The messages to show first. |
| `forwardedProps` | JSON sent to the server in the AG-UI `forwardedProps` field, for example `{ model: "gpt-6.1-sol" }`. |
| `persistence` | `true` to load the thread from the server, or a storage adapter. See [Chat Persistence](../persistence/chat-persistence). |
| `outputSchema` | A Standard Schema. Adds typed `partial` and `final` to the return value. See [Streaming structured output](../structured-outputs/streaming). |
| `context` | Client-only runtime context for client tools. It is not sent to the server. |
| `live` | Subscribe while `live` is `true`. |
| `queue` | What `sendMessage` does while a run is busy. Default: queue the message. See [Queueing](../chat/queueing). |
| `interrupts` | Definitions from `defineInterrupt()`. See [Interrupts](../interrupts/overview). |
| `byok`, `byokProvider` | A keyring from `defineByok()`. See [Bring Your Own Key](../advanced/byok). |
| `devtools` | Display options for TanStack AI Devtools. |

The composable also takes the `ChatClient` callbacks (`onResponse`, `onChunk`, `onFinish`, `onError`, `onInterruptStateChange`, `onCustomEvent`) and the other client options. See [`ChatClient` options](./ai-client#constructor-options).

The composable watches `forwardedProps`, `context`, `queue`, and `live`. To change them after the chat starts, read reactive state in an option getter (for example `get forwardedProps() { ... }`). A change updates the current chat.

### Returns

State values are read-only Vue refs. Read `.value` in `<script setup>`. In `<template>`, Vue unwraps them, so use the bare name. Cleanup runs in `onScopeDispose`.

| Field | What it is |
| --- | --- |
| `messages` | The `UIMessage` array of the chat. |
| `sendMessage(content, options?)` | Sends a user message. `content` is a string or `{ content, id?, metadata? }`. `options` takes `whenBusy` and `body`. |
| `isLoading` | `true` while a response streams. |
| `error` | The last error, or `undefined`. |
| `status` | `"ready"`, `"submitted"`, `"streaming"`, or `"error"`. |
| `stop()` | Stops the current response. |
| `reload()` | Runs the last user message again. |
| `append(message)` | Adds a `UIMessage` or `ModelMessage` and starts a run. |
| `addToolResult(result)` | Gives the result of a client tool by hand: `{ toolCallId, tool, output, state?, errorText? }`. |
| `setMessages(messages)`, `clear()` | Replace or clear the messages. |
| `queue`, `cancelQueued(id)` | Messages that wait while a run is busy. See [Queueing](../chat/queueing). |
| `runId` | The id of the run in flight, or `null`. |
| `interrupts` | Pending interrupts. Each item has `resolveInterrupt(...)`. See [Interrupts](../interrupts/overview). |
| `resolveInterrupts`, `cancelInterrupts`, `retryInterrupts`, `resumeInterruptsUnsafe` | Act on all pending interrupts at once. |
| `interruptErrors`, `resuming` | Errors from the last resume, and `true` while a resume runs. |
| `isHydrating` | `true` while the chat loads from persistence. |
| `hasOlderMessages`, `loadOlderMessages()` | Page in older messages. See [Chat Persistence](../persistence/chat-persistence). |
| `isSubscribed`, `connectionStatus`, `sessionGenerating` | State of the live subscription. |
| `partial`, `final` | Structured output. Only when you pass `outputSchema`. |

### Example: tool approval

A tool with `needsApproval: true` pauses the run. The pending call shows up in `interrupts`.

```vue
<script setup lang="ts">
import { toolDefinition } from "@tanstack/ai";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-vue";
import { z } from "zod";

const deleteFileTool = toolDefinition({
  name: "delete_file",
  description: "Delete a file",
  needsApproval: true,
  inputSchema: z.object({ path: z.string() }),
});

const { interrupts } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
  tools: [deleteFileTool],
});
</script>

<template>
  <template v-for="interrupt in interrupts" :key="interrupt.id">
    <div v-if="interrupt.kind === 'tool-approval'">
      <p>Approve: {{ interrupt.toolName }}</p>
      <button @click="interrupt.resolveInterrupt(true)">Approve</button>
      <button @click="interrupt.resolveInterrupt(false)">Deny</button>
    </div>
  </template>
</template>
```

See [Tool Approval](../interrupts/tool-approval) for the server side.

## `createChatHook(options)`

Binds chat options once at module scope and returns a `useChat` composable that uses them.

```ts
import { createChatHook, fetchServerSentEvents } from "@tanstack/ai-vue";

export const { useChat: useSupportChat } = createChatHook({
  connection: fetchServerSentEvents("/api/chat"),
});

// In a component: const chat = useSupportChat({ threadId: "support-1" })
```

The bound composable takes these per-call overrides: `threadId`, `initialMessages`, `live`, and `forwardedProps`. Keep `tools`, `interrupts`, and `outputSchema` on the factory options.

`@tanstack/ai-vue/ui` has its own `createChatHook` that also returns typed UI components. See [Vue Chat UI](../ui/vue).

## Generation hooks

Each composable runs one generation request and keeps its result. See [Generation Hooks](../media/generation-hooks).

| Composable | `generate()` input | `result` |
| --- | --- | --- |
| `useGenerateImage` | `ImageGenerateInput` | `ImageGenerationResult` |
| `useGenerateAudio` | `AudioGenerateInput` | `AudioGenerationResult` |
| `useGenerateSpeech` | `SpeechGenerateInput` | `TTSResult` |
| `useTranscription` | `TranscriptionGenerateInput` | `TranscriptionResult` |
| `useSummarize` | `SummarizeGenerateInput` | `SummarizationResult` |
| `useGenerateVideo` | `VideoGenerateInput` | `VideoGenerateResult` |
| `useGeneration` | Your own input type | Your own result type |

```vue
<script setup lang="ts">
import { useGenerateImage, fetchServerSentEvents } from "@tanstack/ai-vue";

const image = useGenerateImage({
  connection: fetchServerSentEvents("/api/generate/image"),
});
</script>

<template>
  <button
    :disabled="image.isLoading.value"
    @click="image.generate({ prompt: 'A mountain at sunset' })"
  >
    Generate
  </button>
</template>
```

Options: `connection` or `fetcher`, `body`, `threadId`, `persistence`, `byok`, `byokProvider`, `devtools`, `onResult`, `onError`, `onProgress`, `onChunk`.

Returns: `generate(input)`, `result`, `isLoading`, `error`, `status`, `stop()`, `reset()`, `runId`. The state fields are read-only refs. Cleanup runs in `onScopeDispose`.

`useGenerateVideo` also returns `jobId` and `videoStatus`, and takes `onJobCreated` and `onStatusUpdate`.

## Realtime chat

This package does not export a realtime composable. Use `RealtimeClient`, which this package re-exports. See [Realtime Chat](../media/realtime-chat).

## `useAudioRecorder(options?)`

Records audio from the microphone. See [Audio Recording](../media/audio-recording).

Returns `recording` and `isRecording` (read-only refs), `isSupported`, `start()`, `stop()`, and `cancel()`. Pass `onComplete` to transform the recording. Then `recording` and `stop()` use the transformed type.

## `useByok(client)`

Subscribes to a BYOK keyring and returns a read-only ref of its snapshot. See [Bring Your Own Key](../advanced/byok).

```ts
import { computed } from "vue";
import { useByok } from "@tanstack/ai-vue";
import { byok } from "./byok";

const snapshot = useByok(byok);
const last4 = computed(() => {
  const openai = snapshot.value.status.openai;
  return openai && "masked" in openai ? openai.masked : "No key";
});
```

The snapshot has `status`, `locked`, `prompt`, and `storageError`. Save a key from your own UI with `byok.update(provider, value)`.

## MCP App bridge

This package does not export a bridge composable. Use `createMcpAppBridge`, which this package re-exports. See [MCP Apps](../mcp/apps).

## `useRegisterWebMCPTools(tools, options?)`

Exposes client tools to the browser WebMCP API for the current Vue scope. Vue removes them when the scope is disposed. See [WebMCP Tools](../tools/webmcp).

```vue
<script setup lang="ts">
import { useRegisterWebMCPTools } from "@tanstack/ai-vue";
import { searchProducts } from "./tools";

useRegisterWebMCPTools([searchProducts], {
  onError: (error) => console.error(error),
});
</script>
```

Options: `toolOptions`, `context`, and `onError`. `context` is required when a tool declares a required runtime context.

## `usePageWebMCPTools(options?)`

Reads the WebMCP tools that the page registered, as client tools. The ref starts empty and updates when the page adds or removes a tool. Pass the ref to `useChat` as `tools`. See [Page WebMCP Tools in Chat](../tools/webmcp-page-tools).

```ts
import { usePageWebMCPTools } from "@tanstack/ai-vue";

export function useSameOriginPageTools() {
  return usePageWebMCPTools({
    filter: (tool) => tool.origin === location.origin,
  });
}
```

Options: `filter` (return `false` to skip a tool) and `onError`.

## Re-exports from `@tanstack/ai-client`

You can import these from `@tanstack/ai-vue` directly. See [`@tanstack/ai-client`](./ai-client) for details.

| Group | Exports |
| --- | --- |
| Connection adapters | `fetchServerSentEvents`, `fetchHttpStream`, `fetchJson`, `xhrServerSentEvents`, `xhrHttpStream`, `webSocket`, `stream`, `rpcStream` |
| Typed options | `createChatClientOptions`, `clientTools` |
| Persistence | `localStoragePersistence`, `sessionStoragePersistence`, `indexedDBPersistence` |
| Clients | `ChatClient`, `GenerationClient`, `VideoGenerationClient`, `RealtimeClient`, `AudioRecorder`, `InterruptManager` |
| WebMCP and MCP Apps | `registerWebMCPTools`, `getWebMCPTools`, `subscribeWebMCPTools`, `createMcpAppBridge` |
| Errors | `UnsupportedResponseStreamError`, `StreamTruncatedError`, `DurableStreamIncompleteError`, `StreamReconnectLimitError`, `StorageUnavailableError` |
| Stream helpers | `StreamProcessor`, chunk strategies, `parsePartialJSON`, message converters |

BYOK helpers (`defineByok`, `defaultByokStorage`, and more) are on the `@tanstack/ai-vue/byok` subpath.

## Types

| Type | What it is |
| --- | --- |
| `UseChatOptions`, `UseChatReturn` | The options and return value of `useChat`. |
| `UIMessage<TTools>` | A chat message with typed parts. |
| `InferChatMessages<T>` | The message type for a `createChatClientOptions` result. |
| `SendMessageOptions`, `WhenBusy`, `QueueOption`, `QueuedMessage` | Send and queue types. |
| `DeepPartial<T>` | The type of `partial` while structured output streams. |
| `Use<Composable>Options`, `Use<Composable>Return` | Options and return types for the generation and recorder composables. The WebMCP composables export only an options type. |

Pass a plain tools array to `useChat` or `createChatClientOptions`. Tool names, inputs, and outputs stay typed without `as const`. Import `toolDefinition` from `@tanstack/ai`.
