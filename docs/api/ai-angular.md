---
title: "@tanstack/ai-angular"
id: ai-angular
order: 6
description: "API reference for @tanstack/ai-angular: the injectChat injectable, generation injectables, and Angular signal bindings for the headless TanStack AI client."
keywords:
  - tanstack ai
  - "@tanstack/ai-angular"
  - angular
  - signals
  - injectChat
  - injectables
  - api reference
---

Angular injectables for TanStack AI, built on signals. To build your first chat, start with the [Quick Start](../getting-started/quick-start). For a typed chat layout, see [Angular Chat UI](../ui/angular).

## Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

angular: @tanstack/ai-angular

<!-- ::end:tabs -->

> [!WARNING]
> Call every `inject*` function in an Angular injection context: a class field initializer, the constructor, or `runInInjectionContext`. Outside one, the call throws.

```typescript
import { Injector, inject, runInInjectionContext } from "@angular/core";
import { injectChat, fetchServerSentEvents } from "@tanstack/ai-angular";

export class MyComponent {
  // Field initializer
  chat = injectChat({ connection: fetchServerSentEvents("/api/chat"), threadId: "support-chat" });

  private injector = inject(Injector);

  // Later, outside the constructor
  openSecondChat() {
    return runInInjectionContext(this.injector, () =>
      injectChat({ connection: fetchServerSentEvents("/api/chat"), threadId: "support-chat" }),
    );
  }
}
```

## `injectChat(options)`

Holds the messages and the run state of one chat, and talks to your server route.

```typescript
import { Component } from "@angular/core";
import { injectChat, fetchServerSentEvents } from "@tanstack/ai-angular";

@Component({
  selector: "app-chat",
  standalone: true,
  template: `
    @for (message of chat.messages(); track message.id) {
      <p>
        <strong>{{ message.role }}:</strong>
        @for (part of message.parts; track $index) {
          @if (part.type === 'text') {
            <span>{{ part.content }}</span>
          }
        }
      </p>
    }
    <input #input />
    <button
      (click)="chat.sendMessage(input.value); input.value = ''"
      [disabled]="chat.isLoading()"
    >
      Send
    </button>
  `,
})
export class ChatComponent {
  chat = injectChat({
    connection: fetchServerSentEvents("/api/chat"),
    threadId: "support-chat",
  });
}
```

### Options

You must pass `threadId`. You must also pass `connection` or `fetcher`, not both.

| Option | What it does |
| --- | --- |
| `connection` | Connection adapter, for example `fetchServerSentEvents("/api/chat")`. See [Transports](../transports/overview). |
| `fetcher` | A function that returns a `Response` or a stream. Use it with server functions. |
| `tools` | Client tools from `.client()`. They run when the model calls them. Reactive. See [Client Tools](../tools/client-tools). |
| `threadId` | Required. The id of this chat. Use a stable id for each conversation, for example the id from your route. |
| `initialMessages` | The messages to show first. |
| `forwardedProps` | JSON sent to the server in the AG-UI `forwardedProps` field, for example `{ model: "gpt-6.1-sol" }`. Reactive. |
| `persistence` | `true` to load the thread from the server, or a storage adapter. See [Chat Persistence](../persistence/chat-persistence). |
| `outputSchema` | A Standard Schema. Adds typed `partial` and `final` signals to the return value. See [Streaming structured output](../structured-outputs/streaming). |
| `context` | Client-only runtime context for client tools. It is not sent to the server. Reactive. |
| `live` | Subscribe while `live` is `true`. Reactive. |
| `queue` | What `sendMessage` does while a run is busy. Default: queue the message. See [Queueing](../chat/queueing). |
| `interrupts` | Definitions from `defineInterrupt()`. See [Interrupts](../interrupts/overview). |
| `byok`, `byokProvider` | A keyring from `defineByok()`. See [Bring Your Own Key](../advanced/byok). |
| `devtools` | Display options for TanStack AI Devtools. |

The injectable also takes the `ChatClient` callbacks (`onResponse`, `onChunk`, `onFinish`, `onError`, `onInterruptStateChange`, `onCustomEvent`) and the other client options. See [`ChatClient` options](./ai-client#constructor-options).

A reactive option is a `ReactiveOption<T>`: a plain value, a `Signal<T>`, or a getter `() => T`. A getter runs in `computed`, so the signals it reads are tracked. A change updates the current chat.

```typescript
import { Component, signal } from "@angular/core";
import { injectChat, fetchServerSentEvents } from "@tanstack/ai-angular";

@Component({ selector: "app-model-chat", standalone: true, template: "" })
export class ModelChatComponent {
  model = signal("gpt-6.1-sol");

  chat = injectChat({
    connection: fetchServerSentEvents("/api/chat"),
    threadId: "support-chat",
    forwardedProps: () => ({ model: this.model() }),
  });
}
```

### Returns

State values are read-only Angular `Signal`s. Call them to read the value, for example `chat.messages()`. Cleanup runs in `DestroyRef.onDestroy`.

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

```typescript
import { Component } from "@angular/core";
import { toolDefinition } from "@tanstack/ai";
import { injectChat, fetchServerSentEvents } from "@tanstack/ai-angular";
import { z } from "zod";

const deleteFileTool = toolDefinition({
  name: "delete_file",
  description: "Delete a file",
  needsApproval: true,
  inputSchema: z.object({ path: z.string() }),
});

@Component({
  selector: "app-approval-chat",
  standalone: true,
  template: `
    @for (interrupt of chat.interrupts(); track interrupt.id) {
      @if (interrupt.kind === 'tool-approval') {
        <div>
          <p>Approve: {{ interrupt.toolName }}</p>
          <button (click)="interrupt.resolveInterrupt(true)">Approve</button>
          <button (click)="interrupt.resolveInterrupt(false)">Deny</button>
        </div>
      }
    }
  `,
})
export class ApprovalChatComponent {
  chat = injectChat({
    connection: fetchServerSentEvents("/api/chat"),
    threadId: "support-chat",
    tools: [deleteFileTool],
  });
}
```

See [Tool Approval](../interrupts/tool-approval) for the server side.

## `createChatHook(options)`

This package does not export `createChatHook` from its main entry. `@tanstack/ai-angular/ui` has a `createChatHook` that binds chat options and typed UI components. See [Angular Chat UI](../ui/angular).

## Generation hooks

Each injectable runs one generation request and keeps its result. See [Generation Hooks](../media/generation-hooks).

| Injectable | `generate()` input | `result` |
| --- | --- | --- |
| `injectGenerateImage` | `ImageGenerateInput` | `ImageGenerationResult` |
| `injectGenerateAudio` | `AudioGenerateInput` | `AudioGenerationResult` |
| `injectGenerateSpeech` | `SpeechGenerateInput` | `TTSResult` |
| `injectTranscription` | `TranscriptionGenerateInput` | `TranscriptionResult` |
| `injectSummarize` | `SummarizeGenerateInput` | `SummarizationResult` |
| `injectGenerateVideo` | `VideoGenerateInput` | `VideoGenerateResult` |
| `injectGeneration` | Your own input type | Your own result type |

```typescript
import { Component } from "@angular/core";
import { injectGenerateImage, fetchServerSentEvents } from "@tanstack/ai-angular";

@Component({
  selector: "app-image",
  standalone: true,
  template: `
    <button
      (click)="image.generate({ prompt: 'A mountain at sunset' })"
      [disabled]="image.isLoading()"
    >
      Generate
    </button>
  `,
})
export class ImageComponent {
  image = injectGenerateImage({
    connection: fetchServerSentEvents("/api/generate/image"),
    threadId: "image-studio",
  });
}
```

Options: `threadId` (required), `connection` or `fetcher`, `body` (reactive), `persistence`, `byok`, `byokProvider`, `devtools`, `onResult`, `onError`, `onProgress`, `onChunk`.

Returns: `generate(input)`, `result`, `isLoading`, `error`, `status`, `stop()`, `reset()`, `runId`. The state fields are read-only signals. Cleanup runs in `DestroyRef.onDestroy`.

`injectGenerateVideo` also returns `jobId` and `videoStatus` signals, and takes `onJobCreated` and `onStatusUpdate`.

## Realtime chat

This package does not export a realtime injectable. Use `RealtimeClient`, which this package re-exports. See [Realtime Chat](../media/realtime-chat).

## `injectAudioRecorder(options?)`

Records audio from the microphone. See [Audio Recording](../media/audio-recording).

Returns `recording` and `isRecording` (signals), `isSupported`, `start()`, `stop()`, and `cancel()`. Pass `onComplete` to transform the recording. Then `recording` and `stop()` use the transformed type.

## `injectByok(client)`

Subscribes to a BYOK keyring and returns a read-only `Signal` of its snapshot. See [Bring Your Own Key](../advanced/byok).

```typescript
import { Component, computed } from "@angular/core";
import { injectByok } from "@tanstack/ai-angular";
import { byok } from "./byok";

@Component({
  selector: "app-key-status",
  standalone: true,
  template: `<p>{{ last4() }}</p>`,
})
export class KeyStatusComponent {
  snapshot = injectByok(byok);

  last4 = computed(() => {
    const openai = this.snapshot().status.openai;
    return openai && "masked" in openai ? openai.masked : "No key";
  });
}
```

The snapshot has `status`, `locked`, `prompt`, and `storageError`. Save a key from your own UI with `byok.update(provider, value)`.

## MCP App bridge

This package does not export a bridge injectable. Use `createMcpAppBridge`, which this package re-exports. See [MCP Apps](../mcp/apps).

## `injectRegisterWebMCPTools(tools, options?)`

Exposes client tools to the browser WebMCP API for the current injection owner. Angular removes them when it destroys that owner. See [WebMCP Tools](../tools/webmcp).

```typescript
import { Component } from "@angular/core";
import { injectRegisterWebMCPTools } from "@tanstack/ai-angular";
import { searchProducts } from "./tools";

@Component({ selector: "app-products", standalone: true, template: "" })
export class ProductsComponent {
  registration = injectRegisterWebMCPTools([searchProducts], {
    onError: (error) => console.error(error),
  });
}
```

Options: `toolOptions`, `context`, and `onError`. `context` is required when a tool declares a required runtime context.

## `injectPageWebMCPTools(options?)`

Reads the WebMCP tools that the page registered, as client tools. The signal starts empty and updates when the page adds or removes a tool. Pass the signal to `injectChat` as `tools`. See [Page WebMCP Tools in Chat](../tools/webmcp-page-tools).

```typescript
import { Component } from "@angular/core";
import { injectPageWebMCPTools } from "@tanstack/ai-angular";

@Component({ selector: "app-page-tools", standalone: true, template: "" })
export class PageToolsComponent {
  pageTools = injectPageWebMCPTools({
    filter: (tool) => tool.origin === location.origin,
  });
}
```

Options: `filter` (return `false` to skip a tool) and `onError`.

## Re-exports from `@tanstack/ai-client`

You can import these from `@tanstack/ai-angular` directly. See [`@tanstack/ai-client`](./ai-client) for details.

| Group | Exports |
| --- | --- |
| Connection adapters | `fetchServerSentEvents`, `fetchHttpStream`, `fetchJson`, `xhrServerSentEvents`, `xhrHttpStream`, `webSocket`, `stream`, `rpcStream` |
| Typed options | `createChatClientOptions`, `clientTools` |
| Persistence | `localStoragePersistence`, `sessionStoragePersistence`, `indexedDBPersistence` |
| Clients | `ChatClient`, `GenerationClient`, `VideoGenerationClient`, `RealtimeClient`, `AudioRecorder`, `InterruptManager` |
| WebMCP and MCP Apps | `registerWebMCPTools`, `getWebMCPTools`, `subscribeWebMCPTools`, `createMcpAppBridge` |
| Errors | `UnsupportedResponseStreamError`, `StreamTruncatedError`, `DurableStreamIncompleteError`, `StreamReconnectLimitError`, `StorageUnavailableError` |
| Stream helpers | `StreamProcessor`, chunk strategies, `parsePartialJSON`, message converters |

BYOK helpers (`defineByok`, `defaultByokStorage`, and more) are on the `@tanstack/ai-angular/byok` subpath.

## Types

| Type | What it is |
| --- | --- |
| `InjectChatOptions`, `InjectChatResult` | The options and return value of `injectChat`. |
| `ReactiveOption<T>` | `T`, `Signal<T>`, or `() => T`. |
| `UIMessage<TTools>` | A chat message with typed parts. |
| `InferChatMessages<T>` | The message type for a `createChatClientOptions` result. |
| `MultimodalContent`, `SendMessageOptions`, `WhenBusy`, `QueueOption`, `QueuedMessage` | Send and queue types. |
| `DeepPartial<T>` | The type of `partial` while structured output streams. |
| `Inject<Name>Options`, `Inject<Name>Result` | Options and return types for the generation and recorder injectables. The WebMCP injectables export only an options type. |

Pass a plain tools array to `injectChat` or `createChatClientOptions`. Tool names, inputs, and outputs stay typed without `as const`. Import `toolDefinition` from `@tanstack/ai`. This package does not re-export it.
