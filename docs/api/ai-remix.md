---
title: "@tanstack/ai-remix"
id: ai-remix
order: 9
description: "API reference for @tanstack/ai-remix. Remix 3 helpers including createChat for streaming chat with full type safety."
keywords:
  - tanstack ai
  - "@tanstack/ai-remix"
  - remix
  - createChat
  - createChatHook
  - api reference
---

Install `@tanstack/ai-remix`, then call `createChat(handle, options)` in a Remix setup function. The package publishes uncompiled source. Remix compiles JSX through `jsxImportSource` `remix/ui`.

For a typed headless chat UI, see [Remix Chat UI](../ui/remix). Import `createChatHook` from `@tanstack/ai-remix/ui`.

## Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

remix: @tanstack/ai-remix remix

<!-- ::end:tabs -->

`remix` is a required peer.

## Server

A Remix controller action can return the same SSE `Response` as any other host.

```typescript ignore
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createController } from 'remix/router'
import { post, route } from 'remix/routes'

const routes = route({
  chat: {
    stream: post('/chat'),
  },
})

export default createController(routes.chat, {
  actions: {
    async stream({ request }) {
      const { messages, threadId, runId } =
        await chatParamsFromRequest(request)

      const stream = chat({
        adapter: openaiText('gpt-5.6'),
        messages,
        threadId,
        runId,
      })

      return toServerSentEventsResponse(stream)
    },
  },
})
```

The matching client calls `createChat` and streams from that route. See [Quick Start](../getting-started/quick-start).

## `createChat(handle, options)`

Manages chat state in a Remix component. Pass the component `Handle` as the first argument. Put `connection` and `tools` in setup. They are not serializable `clientEntry` props.

```tsx ignore
import { createChat, fetchServerSentEvents } from '@tanstack/ai-remix'
import {
  createChatClientOptions,
  type InferChatMessages,
} from '@tanstack/ai-client'
import { toolDefinition } from '@tanstack/ai'
import { clientEntry, on, type Handle } from 'remix/ui'
import { z } from 'zod'

const updateUIDef = toolDefinition({
  name: 'updateUI',
  description: 'Show a notification in the UI',
  inputSchema: z.object({ message: z.string() }),
})

export const ChatComponent = clientEntry(
  import.meta.url,
  function ChatComponent(handle: Handle) {
    let notification: string | null = null
    const updateUI = updateUIDef.client((input) => {
      notification = input.message
      return { success: true }
    })
    const tools = [updateUI]

    const chatOptions = createChatClientOptions({
      connection: fetchServerSentEvents('/api/chat'),
      tools,
    })

    type ChatMessages = InferChatMessages<typeof chatOptions>

    const chat = createChat(handle, chatOptions)

    return () => (
      <div>
        {notification}
        {chat.isLoading ? 'Loading' : null}
        {chat.error ? chat.error.message : null}
        <button
          type="button"
          mix={on('click', () => {
            void chat.sendMessage('hi')
          })}
        >
          Send
        </button>
        {chat.messages.length}
      </div>
    )
  },
)
```

Read `chat.messages` and `chat.isLoading` in the render function so each paint sees the latest values. The default thread id is `options.threadId ?? handle.id`. When `handle.signal` aborts, cleanup runs.

### Options you pass first

Extends `ChatClientOptions` from `@tanstack/ai-client`. Pass `connection` or `fetcher`, not both. `Handle` is the first argument, not an option.

- `connection` or `fetcher` - how the helper talks to your server
- `tools?` - client tool implementations from `.client()`
- `threadId?` - the only identity for this chat. Required when persistence is on
- `initialMessages?` - starting transcript
- `forwardedProps?` - JSON sent to the server on the AG-UI `forwardedProps` field

### Options you add later

- `live?` - subscribe on setup, unsubscribe on dispose
- `queue?` - what to do when `sendMessage` runs while a turn is in flight. Default queues
- `interrupts?` - typed interrupt definitions
- `context?` - client-only runtime context for client tools. Not sent to the server
- `onResponse?` / `onChunk?` / `onFinish?` / `onError?` / `onInterruptStateChange?`
- `devtools?` - display options. The helper always tags `framework: 'remix'`
- `body?` - deprecated. Use `forwardedProps`

Client tools run automatically.

### Returns

```typescript ignore
import type { UIMessage } from '@tanstack/ai-remix'
import type { ModelMessage } from '@tanstack/ai/client'
import type {
  BoundInterrupts,
  MultimodalContent,
  ChatClientState,
  ConnectionStatus,
  QueuedMessage,
  SendMessageOptions,
} from '@tanstack/ai-client'

interface CreateChatReturn {
  messages: Array<UIMessage>
  sendMessage: (
    content: string | MultimodalContent,
    options?: SendMessageOptions,
  ) => Promise<void>
  append: (message: ModelMessage | UIMessage) => Promise<void>
  addToolResult: (result: {
    toolCallId: string
    tool: string
    output: unknown
    state?: 'output-available' | 'output-error'
    errorText?: string
  }) => Promise<void>
  interrupts: BoundInterrupts
  resolveInterrupts: (approved: boolean) => void
  reload: () => Promise<void>
  stop: () => void
  isLoading: boolean
  error: Error | undefined
  status: ChatClientState
  isSubscribed: boolean
  connectionStatus: ConnectionStatus
  sessionGenerating: boolean
  setMessages: (messages: Array<UIMessage>) => void
  clear: () => void
  queue: Array<QueuedMessage>
  cancelQueued: (id: string) => void
  runId: string | null
}
```

State fields are getters. `queue` holds sends that wait while a run is busy. `runId` is the in-flight turn, or `null`.

For a tool with `needsApproval: true`, read `chat.interrupts`. Call `interrupt.resolveInterrupt(true)` on the bound `tool-approval` item.

## Connection adapters

Re-exported from `@tanstack/ai-client`:

```typescript
import {
  fetchServerSentEvents,
  fetchHttpStream,
  stream,
  type ConnectionAdapter,
} from '@tanstack/ai-remix'
```

## Example: basic chat

```tsx ignore
import { createChat, fetchServerSentEvents } from '@tanstack/ai-remix'
import { clientEntry, on, type Handle } from 'remix/ui'

export const Chat = clientEntry(
  import.meta.url,
  function Chat(handle: Handle) {
    const chat = createChat(handle, {
      connection: fetchServerSentEvents('/api/chat'),
    })

    return () => (
      <div>
        {chat.messages.map((message) => (
          <div key={message.id}>
            <strong>{message.role}:</strong>
            {message.parts
              .filter((part) => part.type === 'text')
              .map((part) => part.content)
              .join('')}
          </div>
        ))}
        <form
          mix={on('submit', (event) => {
            event.preventDefault()
            const form = event.currentTarget
            const text = String(new FormData(form).get('message') ?? '').trim()
            if (text === '') {
              return
            }
            form.reset()
            void chat.sendMessage(text)
          })}
        >
          <input name="message" disabled={chat.isLoading} />
          <button type="submit" disabled={chat.isLoading}>
            Send
          </button>
        </form>
      </div>
    )
  },
)
```

## Headless chat UI

For a typed chat layout with your own Remix components, see [Remix Chat UI](../ui/remix). Call `createChatHook` from `@tanstack/ai-remix/ui` once at module scope. Your app calls `createAppChat(handle)` and renders `<ui.Chat chat={chat} />`.

## Other helpers

Each helper takes the Remix `Handle` as the first argument. Call it in setup.

### `createByok(handle, client)`

Subscribe to a BYOK snapshot. The return is a getter for the latest snapshot.

```tsx ignore
import { createByok } from '@tanstack/ai-remix'
import type { Handle } from 'remix/ui'
import { byok } from './byok'

function Keys(handle: Handle) {
  const getSnapshot = createByok(handle, byok)
  return () => <p>{getSnapshot().status}</p>
}
```

Call `byok.update(provider, value)` from your own UI to save a key. See [Bring Your Own Key](../advanced/byok).

### `createRealtimeChat(handle, options)`

Realtime voice chat. Pass `getToken` and `adapter`.

```tsx ignore
import { createRealtimeChat } from '@tanstack/ai-remix'
import { openaiRealtime } from '@tanstack/ai-openai'
import { on, type Handle } from 'remix/ui'

function VoiceChat(handle: Handle) {
  const chat = createRealtimeChat(handle, {
    getToken: () => fetch('/api/realtime-token').then((response) => response.json()),
    adapter: openaiRealtime(),
  })

  return () => (
    <div>
      <p>Status: {chat.status}</p>
      <button
        type="button"
        mix={on('click', () => {
          if (chat.status === 'idle') {
            void chat.connect()
            return
          }
          chat.disconnect()
        })}
      >
        {chat.status === 'idle' ? 'Start' : 'Stop'}
      </button>
    </div>
  )
}
```

### `createGeneration(handle, options)`

Base helper for one-shot generation. Pass `connection` or `fetcher`. Call `generate()`.

```tsx ignore
import { createGeneration, fetchServerSentEvents } from '@tanstack/ai-remix'
import { on, type Handle } from 'remix/ui'

function CustomGenerator(handle: Handle) {
  const gen = createGeneration(handle, {
    connection: fetchServerSentEvents('/api/generate/custom'),
  })

  return () => (
    <div>
      <button
        type="button"
        mix={on('click', () => {
          void gen.generate({ prompt: 'Hello' })
        })}
      >
        Generate
      </button>
      {gen.isLoading ? <p>Generating</p> : null}
    </div>
  )
}
```

### `createGenerateImage(handle, options)`

Image generation. `generate()` accepts `ImageGenerateInput`. The result is `ImageGenerationResult`.

```tsx ignore
import { createGenerateImage, fetchServerSentEvents } from '@tanstack/ai-remix'
import { on, type Handle } from 'remix/ui'

function ImageGenerator(handle: Handle) {
  const image = createGenerateImage(handle, {
    connection: fetchServerSentEvents('/api/generate/image'),
  })

  return () => (
    <div>
      <button
        type="button"
        mix={on('click', () => {
          void image.generate({ prompt: 'A sunset over mountains' })
        })}
      >
        Generate
      </button>
      {image.isLoading ? <p>Generating</p> : null}
    </div>
  )
}
```

The package also exports `createGenerateAudio`, `createGenerateSpeech`, `createGenerateVideo`, `createTranscription`, `createSummarize`, `createAudioRecorder`, and `createMcpAppBridge`.

## Types

Re-exported from `@tanstack/ai-client`:

- `UIMessage<TTools>`
- `ChatClientOptions<TTools, TContext>`
- `InferChatMessages<T>`
- `QueuedMessage`, `SendMessageOptions`, `WhenBusy`

## Next

- [Quick Start](../getting-started/quick-start)
- [Tools](../tools/tools)
- [Client tools](../tools/client-tools)
