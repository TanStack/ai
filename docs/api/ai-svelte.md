---
title: "@tanstack/ai-svelte"
id: ai-svelte
order: 6
description: "API reference for @tanstack/ai-svelte — Svelte 5 reactive factory functions for streaming chat built on runes."
keywords:
  - tanstack ai
  - "@tanstack/ai-svelte"
  - svelte
  - svelte 5
  - createChat
  - runes
  - api reference
---

Svelte 5 bindings for TanStack AI, providing reactive factory functions for the headless client using Svelte runes.

## Installation

```bash
npm install @tanstack/ai-svelte
```

## `createChat(options)`

Factory function for managing chat state in Svelte 5 with full type safety.

```typescript
import { createChat, fetchServerSentEvents } from "@tanstack/ai-svelte";
import {
  clientTools,
  createChatClientOptions,
  type InferChatMessages,
} from "@tanstack/ai-client";

// In <script> block
const updateUI = updateUIDef.client((input) => {
  notification = input.message;
  return { success: true };
});

const tools = clientTools(updateUI);

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents("/api/chat"),
  tools,
});

// Fully typed messages!
type ChatMessages = InferChatMessages<typeof chatOptions>;

const chat = createChat(chatOptions);
// Access: chat.messages, chat.sendMessage, chat.isLoading, chat.error
```

### Options

Extends `ChatClientOptions` from `@tanstack/ai-client` (minus internal state callbacks):

- `connection` - Connection adapter (required)
- `tools?` - Array of client tool implementations (with `.client()` method)
- `initialMessages?` - Initial messages array
- `id?` - Unique identifier for this chat instance
- `body?` - Additional body parameters to send
- `live?` - Enable live subscription mode (subscribes on creation)
- `onResponse?` - Callback when response is received
- `onChunk?` - Callback when stream chunk is received
- `onFinish?` - Callback when response finishes
- `onError?` - Callback when error occurs
- `onCustomEvent?` - Callback for custom stream events
- `streamProcessor?` - Stream processing configuration

**Note:** Client tools are now automatically executed - no `onToolCall` callback needed!

### Returns

```typescript
interface CreateChatReturn {
  readonly messages: UIMessage[];
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
  readonly isLoading: boolean;
  readonly error: Error | undefined;
  readonly status: ChatClientState;
  readonly isSubscribed: boolean;
  readonly connectionStatus: ConnectionStatus;
  readonly sessionGenerating: boolean;
  setMessages: (messages: UIMessage[]) => void;
  clear: () => void;
  updateBody: (body: Record<string, any>) => void;
}
```

**Key differences from React/Vue:**

- **`create*` naming** -- factory functions, not hooks. Call outside of any lifecycle.
- **Reactive getters** -- state properties (`messages`, `isLoading`, `error`, `status`, `isSubscribed`, `connectionStatus`, `sessionGenerating`) are Svelte 5 `$state` via getters. Access directly (e.g., `chat.messages`, not `chat.messages.value`).
- **No automatic cleanup** -- unlike React/Vue/Solid, `createChat` does not auto-dispose. Call `chat.stop()` manually when the component unmounts (e.g., in `onDestroy` or an `$effect` return).
- **`updateBody()`** -- update request body parameters dynamically (e.g., for model selection). In Vue, body changes are synced via `watch`; in Svelte, call this method explicitly.
- **`.svelte.ts` files** -- source files use the `.svelte.ts` extension for Svelte 5 rune support.

## Connection Adapters

Re-exported from `@tanstack/ai-client` for convenience:

```typescript
import {
  fetchServerSentEvents,
  fetchHttpStream,
  stream,
  type ConnectionAdapter,
} from "@tanstack/ai-svelte";
```

## Example: Basic Chat

```svelte
<script lang="ts">
  import { createChat, fetchServerSentEvents } from "@tanstack/ai-svelte";

  let input = $state("");

  const chat = createChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (input.trim() && !chat.isLoading) {
      chat.sendMessage(input);
      input = "";
    }
  };
</script>

<div>
  <div>
    {#each chat.messages as message (message.id)}
      <div>
        <strong>{message.role}:</strong>
        {#each message.parts as part, idx}
          {#if part.type === "thinking"}
            <div class="text-sm text-gray-500 italic">
              Thinking: {part.content}
            </div>
          {:else if part.type === "text"}
            <span>{part.content}</span>
          {/if}
        {/each}
      </div>
    {/each}
  </div>
  <form onsubmit={handleSubmit}>
    <input bind:value={input} disabled={chat.isLoading} />
    <button type="submit" disabled={chat.isLoading}>Send</button>
  </form>
</div>
```

## Example: Tool Approval

```svelte
<script lang="ts">
  import { createChat, fetchServerSentEvents } from "@tanstack/ai-svelte";

  const chat = createChat({
    connection: fetchServerSentEvents("/api/chat"),
  });
</script>

<div>
  {#each chat.messages as message (message.id)}
    {#each message.parts as part}
      {#if part.type === "tool-call" && part.state === "approval-requested" && part.approval}
        <div>
          <p>Approve: {part.name}</p>
          <button
            onclick={() =>
              chat.addToolApprovalResponse({
                id: part.approval.id,
                approved: true,
              })}
          >
            Approve
          </button>
          <button
            onclick={() =>
              chat.addToolApprovalResponse({
                id: part.approval.id,
                approved: false,
              })}
          >
            Deny
          </button>
        </div>
      {/if}
    {/each}
  {/each}
</div>
```

## Example: Client Tools with Type Safety

```svelte
<script lang="ts">
  import { createChat, fetchServerSentEvents } from "@tanstack/ai-svelte";
  import {
    clientTools,
    createChatClientOptions,
    type InferChatMessages,
  } from "@tanstack/ai-client";
  import { updateUIDef, saveToStorageDef } from "./tool-definitions";

  let notification = $state(null);

  // Create client implementations
  const updateUI = updateUIDef.client((input) => {
    // input is fully typed!
    notification = { message: input.message, type: input.type };
    return { success: true };
  });

  const saveToStorage = saveToStorageDef.client((input) => {
    localStorage.setItem(input.key, input.value);
    return { saved: true };
  });

  // Create typed tools array (no 'as const' needed!)
  const tools = clientTools(updateUI, saveToStorage);

  const chat = createChat({
    connection: fetchServerSentEvents("/api/chat"),
    tools, // Automatic execution, full type safety
  });
</script>

<div>
  {#each chat.messages as message (message.id)}
    {#each message.parts as part}
      {#if part.type === "tool-call" && part.name === "updateUI"}
        <div>Tool executed: {part.name}</div>
      {/if}
    {/each}
  {/each}
</div>
```

## Generation Functions

Factory functions for one-shot generation tasks (images, speech, transcription, summarization, video). All share the same pattern: provide a `connection` or `fetcher`, call `generate()`, and read reactive state.

### `createGeneration(options)`

Base factory for custom generation types. All specialized functions below are built on this.

```typescript
import { createGeneration, fetchServerSentEvents } from "@tanstack/ai-svelte";

const gen = createGeneration({
  connection: fetchServerSentEvents("/api/generate/custom"),
});

// gen.generate({ prompt: 'Hello' })
// gen.result, gen.isLoading, gen.error, gen.status
```

**Options:** `connection?`, `fetcher?`, `id?`, `body?`, `onResult?`, `onError?`, `onProgress?`, `onChunk?`

**Returns:** `generate`, `result`, `isLoading`, `error`, `status`, `stop`, `reset`, `updateBody` -- all state properties are reactive getters.

### `createGenerateImage(options)`

Image generation factory. `generate()` accepts `ImageGenerateInput`, result is `ImageGenerationResult`.

### `createGenerateSpeech(options)`

Text-to-speech factory. `generate()` accepts `SpeechGenerateInput`, result is `TTSResult`.

### `createTranscription(options)`

Audio transcription factory. `generate()` accepts `TranscriptionGenerateInput`, result is `TranscriptionResult`.

### `createSummarize(options)`

Text summarization factory. `generate()` accepts `SummarizeGenerateInput`, result is `SummarizationResult`.

### `createGenerateVideo(options)`

Video generation factory with job polling. Returns additional `jobId` and `videoStatus` reactive getters. Accepts extra `onJobCreated?` and `onStatusUpdate?` callbacks.

No generation function includes automatic cleanup. Call `.stop()` manually when done.

## `createChatClientOptions(options)`

Helper to create typed chat options (re-exported from `@tanstack/ai-client`).

```typescript
import {
  clientTools,
  createChatClientOptions,
  type InferChatMessages,
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
