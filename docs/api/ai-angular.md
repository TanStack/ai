---
title: "@tanstack/ai-angular"
id: ai-angular
order: 6
description: "Angular injectChat, generation injectables, reactive options, structured output."
keywords:
  - tanstack ai
  - "@tanstack/ai-angular"
  - angular
  - signals
  - injectChat
  - injectables
  - api reference
---

If you need streaming chat in Angular → call `injectChat` **inside an injection context**.

```bash
npm install @tanstack/ai-angular
```

> Every `inject*` function calls Angular `inject()`. Valid sites: class field initializer, constructor, or `runInInjectionContext`. Outside → runtime error.

## `injectChat(options?)`

```typescript
import { Component } from "@angular/core";
import { injectChat, fetchServerSentEvents } from "@tanstack/ai-angular";

@Component({
  selector: "app-chat",
  standalone: true,
  template: `...`,
})
export class ChatComponent {
  chat = injectChat({
    connection: fetchServerSentEvents("/api/chat"),
  });
}
```

Read signals by calling them: `chat.messages()`, `chat.isLoading()`. Cleanup via `DestroyRef.onDestroy`. Client tools auto-run (no `onToolCall`).

### Options

Extends `ChatClientOptions` (minus internal state callbacks):

- `connection` — required (or use `fetcher` for one-shot)
- `tools?` — `.client()` implementations
- `initialMessages?` / `id?` / `threadId?` — seed + AG-UI thread
- `forwardedProps?` — reactive (`T | Signal<T> | () => T`)
- `context?` / `live?` — reactive; `context` is client-local (not serialized)

Also: `outputSchema?` (adds typed `partial` / `final`), `persistence?`, `devtools?`, `onResponse?`, `onChunk?`, `onFinish?`, `onError?`, `onCustomEvent?`, `streamProcessor?`.  
`body?` is **deprecated** (still reactive + merged into `forwardedProps`).

### Reactive options

```typescript
import type { Signal } from "@angular/core";

type ReactiveOption<T> = T | Signal<T> | (() => T);
```

Plain value = constant. `Signal` read directly. Zero-arg getter → wrapped in `computed`.

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
  // Only when outputSchema is set:
  partial: Signal<DeepPartial<InferSchemaType<TSchema>>>;
  final: Signal<InferSchemaType<TSchema> | null>;
}
```

---

## Connection adapters

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

---

## Basic chat

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

## Tool approval

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

## Client tools (typed)

```typescript
import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { injectChat, fetchServerSentEvents } from "@tanstack/ai-angular";
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
  private updateUI = updateUIDef.client((input) => {
    return { success: true };
  });

  private saveToStorage = saveToStorageDef.client((input) => {
    localStorage.setItem(input.key, input.value);
    return { saved: true };
  });

  private tools = [this.updateUI, this.saveToStorage];

  chat = injectChat({
    connection: fetchServerSentEvents("/api/chat"),
    tools: this.tools,
  });
}
```

## Reactive options

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

  chat = injectChat({
    connection: fetchServerSentEvents("/api/chat"),
    forwardedProps: () => ({ language: this.language() }),
  });

  toggleLanguage() {
    this.language.set(this.language() === "en" ? "fr" : "en");
  }
}
```

## Structured output

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

---

## Generation injectables

Provide `connection` or `fetcher`, call `generate()`, read signals. Cleanup via `DestroyRef.onDestroy`.

### `injectGeneration(options)`

```typescript
import { Component } from "@angular/core";
import { injectGeneration } from "@tanstack/ai-angular";
import { fetchServerSentEvents } from "@tanstack/ai-client";

@Component({ selector: "app-custom", standalone: true, template: `...` })
export class CustomGenerationComponent {
  gen = injectGeneration({
    connection: fetchServerSentEvents("/api/generate/custom"),
  });
}
```

**Options:** `connection?`, `fetcher?`, `id?`, `body?` (reactive), `devtools?`, `onResult?`, `onError?`, `onProgress?`, `onChunk?`

**Returns:** `generate`, `result`, `isLoading`, `error`, `status`, `stop`, `reset`, `runId` (signals).

### Specialized

| Injectable | Input | Notes |
| --- | --- | --- |
| `injectGenerateImage` | `ImageGenerateInput` | `ImageGenerationResult` |
| `injectGenerateAudio` | `AudioGenerateInput` | `AudioGenerationResult` |
| `injectGenerateSpeech` | `SpeechGenerateInput` | `TTSResult` |
| `injectTranscription` | `TranscriptionGenerateInput` | `TranscriptionResult` |
| `injectSummarize` / `injectGenerateVideo` | summarize / video | video adds `jobId`, `videoStatus` |

### Image example

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

### Audio example

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

### Video example

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

Video-only returns: `jobId: Signal<string | null>`, `videoStatus: Signal<VideoStatusInfo | null>`.

---

## Injection context

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

// runInInjectionContext
const chat = runInInjectionContext(injector, () =>
  injectChat({ connection: fetchServerSentEvents("/api/chat") }),
);
```

## `createChatClientOptions(options)`

```typescript
import {
  createChatClientOptions,
  type InferChatMessages,
} from "@tanstack/ai-client";
import { fetchServerSentEvents } from "@tanstack/ai-angular";
import { tool1, tool2 } from "./tools";

const tools = [tool1, tool2];

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents("/api/chat"),
  tools,
});

type Messages = InferChatMessages<typeof chatOptions>;
```

## Types

From `@tanstack/ai-angular` / client: `UIMessage`, `InjectChatOptions`, `InjectChatResult`, `ReactiveOption`, `DeepPartial`, `ChatRequestBody`, `MultimodalContent`, `ConnectionAdapter`, `InferChatMessages`, generation types (`GenerationClientState`, `ImageGenerateInput`, `AudioGenerateInput`, `SpeechGenerateInput`, `TranscriptionGenerateInput`, `SummarizeGenerateInput`, `VideoGenerateInput`, `VideoGenerateResult`, `VideoStatusInfo`).

Tool authoring — import from `@tanstack/ai` (not re-exported here): `toolDefinition()`, `ToolDefinitionInstance`, `ClientTool`, `ServerTool`.

## Next Steps

- [Getting Started](../getting-started/quick-start)
- [Tools Guide](../tools/tools)
- [Client Tools](../tools/client-tools)
