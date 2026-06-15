<div align="center">
  <img src="https://raw.githubusercontent.com/TanStack/ai/main/media/header_ai.png" alt="TanStack AI" />
</div>

<br />

<div align="center">
  <a href="https://npmjs.com/package/@tanstack/ai-angular" target="_parent">
    <img alt="NPM downloads" src="https://img.shields.io/npm/dm/@tanstack/ai-angular.svg" />
  </a>
  <a href="https://github.com/TanStack/ai" target="_parent">
    <img alt="GitHub stars" src="https://img.shields.io/github/stars/TanStack/ai.svg?style=social&label=Star" />
  </a>
  <a href="https://github.com/TanStack/ai/releases" target="_parent">
    <img alt="Release" src="https://img.shields.io/github/v/release/tanstack/ai" />
  </a>
  <a href="https://bundlephobia.com/result?p=@tanstack/ai-angular@latest" target="_parent">
    <img alt="Bundle size" src="https://badgen.net/bundlephobia/minzip/@tanstack/ai-angular@latest" />
  </a>
  <a href="https://twitter.com/tan_stack">
    <img alt="Follow @TanStack" src="https://img.shields.io/twitter/follow/tan_stack.svg?style=social" />
  </a>
</div>

# TanStack AI — Angular

Angular signal-based bindings for TanStack AI — streaming chat, tool-calling agents, and media generation built on Angular's native reactivity model.

## <a href="https://tanstack.com/ai">Read the docs -></a>

## Install

```bash
pnpm add @tanstack/ai-angular @tanstack/ai
```

```bash
npm install @tanstack/ai-angular @tanstack/ai
```

## Minimal Usage

> **Important:** All `inject*` functions use Angular's dependency injection system and **must** be called within an Angular injection context — a component or directive class field initializer, the constructor, or inside `runInInjectionContext`. Calling them outside an injection context will throw a runtime error.

The example below shows a standalone component that streams chat messages from a server endpoint via SSE:

```typescript
import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { injectChat } from '@tanstack/ai-angular'
import { fetchServerSentEvents } from '@tanstack/ai-client'

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ul>
      @for (message of chat.messages(); track message.id) {
        <li>{{ message.role }}: {{ message.content }}</li>
      }
    </ul>
    <input #input placeholder="Type a message..." />
    <button (click)="chat.sendMessage(input.value); input.value = ''">
      Send
    </button>
    @if (chat.isLoading()) {
      <p>Thinking...</p>
    }
  `,
})
export class ChatComponent {
  // injectChat is called in a field initializer — this is a valid injection context.
  chat = injectChat({
    connection: fetchServerSentEvents('/api/chat'),
  })
}
```

All state is exposed as Angular `Signal`s. Read them by calling them as functions:

| Signal | Type | Description |
| --- | --- | --- |
| `chat.messages()` | `UIMessage[]` | Current message list |
| `chat.isLoading()` | `boolean` | Whether a response is streaming |
| `chat.error()` | `Error \| undefined` | Last error, if any |
| `chat.status()` | `ChatClientState` | `'ready'`, `'streaming'`, `'error'`, ... |
| `chat.isSubscribed()` | `boolean` | Whether a live (SSE push) session is active |
| `chat.connectionStatus()` | `ConnectionStatus` | Transport connection status |

Available methods on the return value: `sendMessage`, `append`, `reload`, `stop`, `clear`, `setMessages`, `addToolResult`, `addToolApprovalResponse`.

## Server endpoint

The client pairs with any endpoint that returns a TanStack AI SSE stream:

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const body = await request.json()

  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: body.messages,
  })

  return toServerSentEventsResponse(stream)
}
```

## Available Functions

| Function | Description |
| --- | --- |
| `injectChat` | Streaming chat with messages, tool calls, and structured outputs |
| `injectGeneration` | Generic generation client (streaming or one-shot) |
| `injectGenerateImage` | Image generation |
| `injectGenerateAudio` | Audio generation |
| `injectGenerateVideo` | Video generation |
| `injectGenerateSpeech` | Text-to-speech |
| `injectSummarize` | Summarization |
| `injectTranscription` | Audio transcription |

All generation functions return signals (`result`, `isLoading`, `error`, `status`) and methods (`generate`, `stop`, `reset`).

## Injection Context

Angular's DI system requires that `inject()` is called during component construction. Every `inject*` function in this package calls `inject()` internally. Valid call sites:

```typescript
// Field initializer (recommended)
export class MyComponent {
  chat = injectChat({ connection: fetchServerSentEvents('/api/chat') })
}

// Constructor
export class MyComponent {
  chat: ReturnType<typeof injectChat>
  constructor() {
    this.chat = injectChat({ connection: fetchServerSentEvents('/api/chat') })
  }
}

// Inside runInInjectionContext
const chat = runInInjectionContext(injector, () =>
  injectChat({ connection: fetchServerSentEvents('/api/chat') }),
)
```

## Get Involved

- Read the [docs](https://tanstack.com/ai).
- Participate in [GitHub discussions](https://github.com/TanStack/ai/discussions).
- Chat with the community on [Discord](https://discord.com/invite/WrRKjPJ).
- See [CONTRIBUTING.md](https://github.com/TanStack/ai/blob/main/CONTRIBUTING.md) for setup instructions.
- [Become a sponsor](https://github.com/sponsors/tannerlinsley/).
