---
title: "@tanstack/ai-svelte"
id: ai-svelte
order: 6
description: "Svelte 5 createChat factory, generation helpers, and typed client tools."
keywords:
  - tanstack ai
  - "@tanstack/ai-svelte"
  - svelte
  - svelte 5
  - createChat
  - runes
  - api reference
---

If you need streaming chat in Svelte 5 → `createChat` (factory, not a hook).

```bash
npm install @tanstack/ai-svelte
```

## Svelte-specific rules

1. Call `createChat` in `<script>` — not inside lifecycle callbacks.
2. Read state as getters: `chat.messages`, `chat.isLoading` (no `.value`).
3. **No auto-dispose** — call `chat.stop()` on unmount (`onDestroy` or `$effect` cleanup).
4. Update props with `chat.updateForwardedProps()` / `updateContext()` (Vue watches options; Svelte needs methods).
5. Package sources use `.svelte.ts` for runes.

---

## `createChat(options)`

```typescript
import { createChat, fetchServerSentEvents } from "@tanstack/ai-svelte";
import {
  createChatClientOptions,
  type InferChatMessages,
} from "@tanstack/ai-client";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

const updateUIDef = toolDefinition({
  name: "updateUI",
  description: "Update the UI with a notification",
  inputSchema: z.object({
    message: z.string(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
});

// In <script> block
let notification = "";

const updateUI = updateUIDef.client((input) => {
  notification = input.message;
  return { success: true };
});

const tools = [updateUI];

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents("/api/chat"),
  tools,
});

type ChatMessages = InferChatMessages<typeof chatOptions>;

const chat = createChat(chatOptions);
// chat.messages, chat.sendMessage, chat.isLoading, chat.error
```

### Options

Extends `ChatClientOptions` (minus internal state callbacks):

- `connection` — required adapter
- `tools?` — `.client()` implementations (auto-run)
- `initialMessages?` / `id?` / `threadId?` — seed + AG-UI thread
- `forwardedProps?` — client JSON → server
- `context?` — client-local tool context (not serialized)

Also: `live?`, `onResponse?`, `onChunk?`, `onFinish?`, `onError?`, `onCustomEvent?`, `streamProcessor?`.  
`body?` is **deprecated** — use `forwardedProps`.

### Returns

```typescript
import type {
  UIMessage,
  MultimodalContent,
  ChatClientState,
  ConnectionStatus,
} from "@tanstack/ai-client";
import type { ModelMessage } from "@tanstack/ai";

interface CreateChatReturn<TContext = unknown> {
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
  /** @deprecated Use `updateForwardedProps` instead. */
  updateBody: (body: Record<string, any>) => void;
  updateForwardedProps: (forwardedProps: Record<string, any>) => void;
  updateContext: (context: TContext) => void;
}
```

---

## Connection adapters

```typescript
import {
  fetchServerSentEvents,
  fetchHttpStream,
  stream,
  type ConnectionAdapter,
} from "@tanstack/ai-svelte";
```

---

## Basic chat

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

## Tool approval

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

## Client tools (typed)

```svelte
<script lang="ts">
  import { createChat, fetchServerSentEvents } from "@tanstack/ai-svelte";
  import { updateUIDef, saveToStorageDef } from "./tool-definitions";

  let notification = $state(null);

  const updateUI = updateUIDef.client((input) => {
    notification = { message: input.message, type: input.type };
    return { success: true };
  });

  const saveToStorage = saveToStorageDef.client((input) => {
    localStorage.setItem(input.key, input.value);
    return { saved: true };
  });

  const tools = [updateUI, saveToStorage];

  const chat = createChat({
    connection: fetchServerSentEvents("/api/chat"),
    tools,
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

---

## Generation functions

Provide `connection` or `fetcher`, call `generate()`, read reactive getters. **No auto-cleanup** — call `.stop()` when done.

### `createGeneration(options)`

```typescript
import { createGeneration, fetchServerSentEvents } from "@tanstack/ai-svelte";

const gen = createGeneration({
  connection: fetchServerSentEvents("/api/generate/custom"),
});

// gen.generate({ prompt: 'Hello' })
// gen.result, gen.isLoading, gen.error, gen.status
```

**Options:** `connection?`, `fetcher?`, `id?`, `body?`, `onResult?`, `onError?`, `onProgress?`, `onChunk?`

**Returns:** `generate`, `result`, `isLoading`, `error`, `status`, `stop`, `reset`, `runId`, `updateBody`.

### Specialized

| Factory | Input | Result notes |
| --- | --- | --- |
| `createGenerateImage` | `ImageGenerateInput` | `ImageGenerationResult` |
| `createGenerateSpeech` | `SpeechGenerateInput` | `TTSResult` |
| `createTranscription` | `TranscriptionGenerateInput` | `TranscriptionResult` |
| `createSummarize` | `SummarizeGenerateInput` | `SummarizationResult` |
| `createGenerateVideo` | video input | + `jobId`, `videoStatus`; `onJobCreated?`, `onStatusUpdate?` |

---

## `createChatClientOptions(options)`

```typescript
import {
  createChatClientOptions,
  fetchServerSentEvents,
  type InferChatMessages,
} from "@tanstack/ai-client";
import { tool1, tool2 } from "./tools";

const tools = [tool1, tool2];

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents("/api/chat"),
  tools,
});

type Messages = InferChatMessages<typeof chatOptions>;
```

## Types

From `@tanstack/ai-client`: `UIMessage`, `MessagePart`, `TextPart`, `ThinkingPart`, `ToolCallPart`, `ToolResultPart`, `ChatClientOptions`, `ConnectionAdapter`, `InferChatMessages`, `ChatRequestBody`, generation types (`GenerationClientState`, `ImageGenerateInput`, `SpeechGenerateInput`, `TranscriptionGenerateInput`, `SummarizeGenerateInput`, `VideoGenerateInput`, `VideoGenerateResult`, `VideoStatusInfo`).

From `@tanstack/ai`: `toolDefinition()`, `ToolDefinitionInstance`, `ClientTool`, `ServerTool`.

## Next Steps

- [Getting Started](../getting-started/quick-start)
- [Tools Guide](../tools/tools)
- [Client Tools](../tools/client-tools)
