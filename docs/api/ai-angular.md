---
title: "@tanstack/ai-angular"
id: ai-angular
order: 6
description: "API reference for @tanstack/ai-angular — Angular signal-based injectables including injectChat for streaming chat with full type safety."
keywords:
  - tanstack ai
  - "@tanstack/ai-angular"
  - angular
  - signals
  - injectChat
  - injectables
  - api reference
---

Angular signal-based bindings for TanStack AI, providing convenient Angular bindings for the headless client.

> **Injection context requirement:** Every `inject*` function in this package calls Angular's `inject()` internally. They **must** be called within an Angular injection context — a component or directive class field initializer, the constructor, or inside `runInInjectionContext`. Calling them outside an injection context will throw a runtime error.

## Installation

```bash
npm install @tanstack/ai-angular
```

## `injectChat(options?)`

Main injectable for managing chat state in Angular with full type safety.

```typescript
import { Component } from "@angular/core";
import { injectChat, fetchServerSentEvents } from "@tanstack/ai-angular";

@Component({
  selector: "app-chat",
  standalone: true,
  template: `...`,
})
export class ChatComponent {
  // injectChat is called in a field initializer — valid injection context.
  chat = injectChat({
    connection: fetchServerSentEvents("/api/chat"),
  });
}
```

### Options

Extends `ChatClientOptions` from `@tanstack/ai-client` (minus internal state callbacks):

- `connection` - Connection adapter (required, or use `fetcher`)
- `fetcher?` - Direct async function for one-shot generation (alternative to `connection`)
- `tools?` - Array of client tool implementations (with `.client()` method)
- `initialMessages?` - Initial messages array
- `id?` - Unique identifier for this chat instance
- `threadId?` - Thread ID for AG-UI run correlation. Persists across sends; auto-generated if omitted
- `forwardedProps?` - Arbitrary client-controlled JSON forwarded to the server in the AG-UI `RunAgentInput.forwardedProps` field. Reactive — accepts a plain value, an Angular `Signal`, or a zero-arg getter; changes sync automatically via `effect`
- `body?` - **Deprecated.** Use `forwardedProps` instead. Still works for backward compatibility; values are merged into `forwardedProps` on the wire. Reactive (same forms as `forwardedProps`)
- `context?` - Typed client-local runtime context passed to client tool implementations. Reactive (same forms). This value is not serialized to the server
- `live?` - Enable live subscription mode (auto-subscribes/unsubscribes). Reactive (same forms)
- `outputSchema?` - Standard-schema-compatible schema (Zod, Valibot, ArkType, or JSON Schema). When provided, adds typed `partial` and `final` signals to the return value
- `persistence?` - Persistence configuration
- `devtools?` - Display options for TanStack AI Devtools
- `onResponse?` - Callback when response is received
- `onChunk?` - Callback when stream chunk is received
- `onFinish?` - Callback when response finishes
- `onError?` - Callback when error occurs
- `onCustomEvent?` - Callback for custom stream events
- `streamProcessor?` - Stream processing configuration

**Reactive options** (`body`, `forwardedProps`, `context`, `live`) accept a `ReactiveOption<T>`, which is one of:

```typescript
import type { Signal } from "@angular/core";

type ReactiveOption<T> = T | Signal<T> | (() => T);
```

A plain value becomes a constant; a `Signal` is read directly; a zero-arg getter is wrapped in `computed` so any signals read inside it are tracked.

**Note:** Client tools are automatically executed — no `onToolCall` callback needed!

### Returns

```typescript
import type { Signal } from "@angular/core";
import type {
  UIMessage,
  MultimodalContent,
  DeepPartial,
} from "@tanstack/ai-angular";
import type { ModelMessage, InferSchemaType } from "@tanstack/ai/client";
import type { ChatClientState, ConnectionStatus } from "@tanstack/ai-client";
type TSchema = any;

interface InjectChatResult {
  messages: Signal<UIMessage[]>;
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
  clear: () => void;
  setMessages: (messages: UIMessage[]) => void;
  isLoading: Signal<boolean>;
  error: Signal<Error | undefined>;
  status: Signal<ChatClientState>;
  isSubscribed: Signal<boolean>;
  connectionStatus: Signal<ConnectionStatus>;
  sessionGenerating: Signal<boolean>;
  // Only present when outputSchema is supplied:
  partial: Signal<DeepPartial<InferSchemaType<TSchema>>>;
  final: Signal<InferSchemaType<TSchema> | null>;
}
```

**Note:** All reactive state (`messages`, `isLoading`, `error`, `status`, `isSubscribed`, `connectionStatus`, `sessionGenerating`) is exposed as read-only Angular `Signal`s. Read them by calling them as functions (e.g., `chat.messages()`, `chat.isLoading()`). Cleanup is automatic via `DestroyRef.onDestroy`.

## Connection Adapters

Re-exported from `@tanstack/ai-client` for convenience:

```typescript
import {
  fetchServerSentEvents,
  fetchHttpStream,
  xhrServerSentEvents,
  xhrHttpStream,
  stream,
  rpcStream,
  type ConnectionAdapter,
} from "@tanstack/ai-angular";
```

## Example: Basic Chat

```typescript
import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { injectChat, fetchServerSentEvents } from "@tanstack/ai-angular";

@Component({
  selector: "app-chat",
  standalone: true,
  imports: [CommonModule],
  template: `
    <ul>
      @for (message of chat.messages(); track message.id) {
        <li>
          <strong>{{ message.role }}:</strong>
          @for (part of message.parts; track $index) {
            @if (part.type === 'thinking') {
              <em>Thinking: {{ part.content }}</em>
            } @else if (part.type === 'text') {
              <span>{{ part.content }}</span>
            }
          }
        </li>
      }
    </ul>
    <input #input placeholder="Type a message..." />
    <button
      (click)="chat.sendMessage(input.value); input.value = ''"
      [disabled]="chat.isLoading()"
    >
      Send
    </button>
    @if (chat.isLoading()) {
      <p>Thinking...</p>
    }
  `,
})
export class ChatComponent {
  chat = injectChat({
    connection: fetchServerSentEvents("/api/chat"),
  });
}
```

## Example: Tool Approval

```typescript
import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { injectChat, fetchServerSentEvents } from "@tanstack/ai-angular";

@Component({
  selector: "app-approval-chat",
  standalone: true,
  imports: [CommonModule],
  template: `
    @for (message of chat.messages(); track message.id) {
      @for (part of message.parts; track $index) {
        @if (
          part.type === 'tool-call' &&
          part.state === 'approval-requested' &&
          part.approval
        ) {
          <div>
            <p>Approve: {{ part.name }}</p>
            <button (click)="chat.addToolApprovalResponse({ id: part.approval!.id, approved: true })">
              Approve
            </button>
            <button (click)="chat.addToolApprovalResponse({ id: part.approval!.id, approved: false })">
              Deny
            </button>
          </div>
        }
      }
    }
  `,
})
export class ApprovalChatComponent {
  chat = injectChat({
    connection: fetchServerSentEvents("/api/chat"),
  });
}
```

## Example: Client Tools with Type Safety

```typescript
import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { injectChat, fetchServerSentEvents } from "@tanstack/ai-angular";
import {
  clientTools,
  createChatClientOptions,
  type InferChatMessages,
} from "@tanstack/ai-client";
import { updateUIDef, saveToStorageDef } from "./tool-definitions";

@Component({
  selector: "app-typed-chat",
  standalone: true,
  imports: [CommonModule],
  template: `
    @for (message of chat.messages(); track message.id) {
      @for (part of message.parts; track $index) {
        @if (part.type === 'tool-call' && part.name === 'updateUI') {
          <div>Tool executed: {{ part.name }}</div>
        }
      }
    }
  `,
})
export class TypedChatComponent {
  // Create client implementations
  private updateUI = updateUIDef.client((input: any) => {
    // input is fully typed!
    return { success: true };
  });

  private saveToStorage = saveToStorageDef.client((input: any) => {
    localStorage.setItem(input.key, input.value);
    return { saved: true };
  });

  // Create typed tools array (no 'as const' needed!)
  private tools = clientTools(this.updateUI, this.saveToStorage);

  chat = injectChat({
    connection: fetchServerSentEvents("/api/chat"),
    tools: this.tools, // Automatic execution, full type safety
  });
}
```

## Example: Reactive Options with Signals

```typescript
import { Component, signal } from "@angular/core";
import { injectChat, fetchServerSentEvents } from "@tanstack/ai-angular";

@Component({
  selector: "app-reactive-chat",
  standalone: true,
  template: `
    <button (click)="toggleLanguage()">Toggle Language</button>
    @for (message of chat.messages(); track message.id) {
      <p>{{ message.role }}: {{ message.parts[0]?.content }}</p>
    }
  `,
})
export class ReactiveChatComponent {
  language = signal("en");

  // forwardedProps is reactive — the signal is read on every request
  chat = injectChat({
    connection: fetchServerSentEvents("/api/chat"),
    forwardedProps: () => ({ language: this.language() }),
  });

  toggleLanguage() {
    this.language.set(this.language() === "en" ? "fr" : "en");
  }
}
```

## Example: Structured Output

```typescript
import { Component } from "@angular/core";
import { injectChat, fetchServerSentEvents } from "@tanstack/ai-angular";
import { z } from "zod";

const recipeSchema = z.object({
  title: z.string(),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
});

@Component({
  selector: "app-recipe-chat",
  standalone: true,
  template: `
    <button (click)="chat.sendMessage('Give me a pasta recipe')">Ask</button>
    @if (chat.partial().title) {
      <h2>{{ chat.partial().title }}</h2>
    }
    @if (chat.final()) {
      <ul>
        @for (step of chat.final()!.steps; track $index) {
          <li>{{ step }}</li>
        }
      </ul>
    }
  `,
})
export class RecipeChatComponent {
  chat = injectChat({
    connection: fetchServerSentEvents("/api/chat"),
    outputSchema: recipeSchema,
  });
}
```

## Generation Injectables

Angular injectables for one-shot generation tasks (images, audio, speech, transcription, summarization, video). All share the same pattern: provide a `connection` or `fetcher`, call `generate()`, and read reactive signals.

### `injectGeneration(options)`

Base injectable for custom generation types. All specialized injectables below are built on this.

```typescript
import { Component } from "@angular/core";
import { injectGeneration } from "@tanstack/ai-angular";
import { fetchServerSentEvents } from "@tanstack/ai-client";

@Component({ selector: "app-custom", standalone: true, template: `...` })
export class CustomGenerationComponent {
  gen = injectGeneration({
    connection: fetchServerSentEvents("/api/generate/custom"),
  });

  // Call gen.generate(input), read gen.result(), gen.isLoading(), etc.
}
```

**Options:** `connection?`, `fetcher?`, `id?`, `body?` (reactive), `devtools?`, `onResult?`, `onError?`, `onProgress?`, `onChunk?`

**Returns:** `generate`, `result`, `isLoading`, `error`, `status`, `stop`, `reset` — all reactive state is a read-only `Signal<T>`.

### `injectGenerateImage(options)`

Image generation injectable. `generate()` accepts `ImageGenerateInput`, result is `ImageGenerationResult`.

```typescript
import { Component } from "@angular/core";
import { injectGenerateImage } from "@tanstack/ai-angular";
import { fetchServerSentEvents } from "@tanstack/ai-client";

@Component({
  selector: "app-image",
  standalone: true,
  template: `
    <button (click)="gen.generate({ prompt: 'A mountain at sunset' })" [disabled]="gen.isLoading()">
      Generate
    </button>
    @if (gen.result()) {
      <img [src]="gen.result()!.images[0]!.url" alt="Generated image" />
    }
  `,
})
export class ImageComponent {
  gen = injectGenerateImage({
    connection: fetchServerSentEvents("/api/generate/image"),
  });
}
```

### `injectGenerateAudio(options)`

Audio generation injectable (music, sound effects). `generate()` accepts `AudioGenerateInput`, result is `AudioGenerationResult`.

```typescript
import { Component } from "@angular/core";
import { injectGenerateAudio } from "@tanstack/ai-angular";
import { fetchServerSentEvents } from "@tanstack/ai-client";

@Component({
  selector: "app-audio",
  standalone: true,
  template: `
    <button (click)="gen.generate({ prompt: 'An upbeat electronic track', duration: 10 })" [disabled]="gen.isLoading()">
      Generate
    </button>
    @if (gen.result()) {
      <audio [src]="gen.result()!.audio.url" controls></audio>
    }
  `,
})
export class AudioComponent {
  gen = injectGenerateAudio({
    connection: fetchServerSentEvents("/api/generate/audio"),
  });
}
```

### `injectGenerateSpeech(options)`

Text-to-speech injectable. `generate()` accepts `SpeechGenerateInput`, result is `TTSResult`.

### `injectTranscription(options)`

Audio transcription injectable. `generate()` accepts `TranscriptionGenerateInput`, result is `TranscriptionResult`.

### `injectSummarize(options)`

Text summarization injectable. `generate()` accepts `SummarizeGenerateInput`, result is `SummarizationResult`.

### `injectGenerateVideo(options)`

Video generation injectable with job polling. Returns additional `jobId` and `videoStatus` signals. Accepts extra `onJobCreated?` and `onStatusUpdate?` callbacks.

```typescript
import { Component } from "@angular/core";
import { injectGenerateVideo } from "@tanstack/ai-angular";
import { fetchServerSentEvents } from "@tanstack/ai-client";

@Component({
  selector: "app-video",
  standalone: true,
  template: `
    <button (click)="gen.generate({ prompt: 'A time-lapse of a sunset' })" [disabled]="gen.isLoading()">
      Generate
    </button>
    @if (gen.videoStatus()) {
      <p>Status: {{ gen.videoStatus()!.status }}</p>
    }
    @if (gen.result()) {
      <video [src]="gen.result()!.url" controls></video>
    }
  `,
})
export class VideoComponent {
  gen = injectGenerateVideo({
    connection: fetchServerSentEvents("/api/generate/video"),
    onJobCreated: (jobId) => console.log("Job created:", jobId),
  });
}
```

**Additional returns (video only):**
- `jobId: Signal<string | null>` — The polling job ID, once the server creates it
- `videoStatus: Signal<VideoStatusInfo | null>` — Real-time status updates from the polling loop

All generation injectables automatically clean up via `DestroyRef.onDestroy`.

## Injection Context

Angular's DI system requires that `inject()` is called during component construction. Every `inject*` function in this package calls `inject()` internally. Valid call sites:

```typescript
import { inject, runInInjectionContext, Injector } from "@angular/core";
import { injectChat, fetchServerSentEvents } from "@tanstack/ai-angular";

const injector = inject(Injector);

// Field initializer (recommended)
export class MyComponent {
  chat = injectChat({ connection: fetchServerSentEvents("/api/chat") });
}

// Constructor
export class MyComponentAlt {
  chat: ReturnType<typeof injectChat>;
  constructor() {
    this.chat = injectChat({ connection: fetchServerSentEvents("/api/chat") });
  }
}

// Inside runInInjectionContext
const chat = runInInjectionContext(injector, () =>
  injectChat({ connection: fetchServerSentEvents("/api/chat") }),
);
```

## `createChatClientOptions(options)`

Helper to create typed chat options (re-exported from `@tanstack/ai-client`).

```typescript
import {
  clientTools,
  createChatClientOptions,
  type InferChatMessages,
} from "@tanstack/ai-client";
import { fetchServerSentEvents } from "@tanstack/ai-angular";
import { tool1, tool2 } from "./tools";

// Create typed tools array (no 'as const' needed!)
const tools = clientTools(tool1, tool2);

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents("/api/chat"),
  tools,
});

type Messages = InferChatMessages<typeof chatOptions>;
```

## Types

Re-exported from `@tanstack/ai-angular` (sourced from `@tanstack/ai-client`):

- `UIMessage<TTools>` - Message type with tool type parameter
- `InjectChatOptions<TTools, TSchema, TContext>` - Chat injectable options
- `InjectChatResult<TTools, TSchema>` - Chat injectable return type
- `ReactiveOption<T>` - Union of `T | Signal<T> | (() => T)` for reactive option fields
- `DeepPartial<T>` - Recursive partial; used to type the in-flight `partial` value
- `ChatRequestBody` - Request body type
- `MultimodalContent` - Multimodal content type for `sendMessage`
- `ConnectionAdapter` - Connection adapter interface
- `InferChatMessages<T>` - Extract message type from options
- `GenerationClientState` - Generation lifecycle state
- `ImageGenerateInput` - Image generation input type
- `AudioGenerateInput` - Audio generation input type
- `SpeechGenerateInput` - Speech generation input type
- `TranscriptionGenerateInput` - Transcription input type
- `SummarizeGenerateInput` - Summarization input type
- `VideoGenerateInput` - Video generation input type
- `VideoGenerateResult` - Video generation result type
- `VideoStatusInfo` - Video job status info

Tool authoring types — import directly from `@tanstack/ai` (not re-exported by `@tanstack/ai-angular`):

- `toolDefinition()` - Create isomorphic tool definition
- `ToolDefinitionInstance` - Tool definition type
- `ClientTool` - Client tool type
- `ServerTool` - Server tool type

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../tools/tools) - Learn about the isomorphic tool system
- [Client Tools](../tools/client-tools) - Learn about client-side tools
