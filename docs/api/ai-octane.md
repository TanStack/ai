---
title: "@tanstack/ai-octane"
id: ai-octane
order: 8
description: "API reference for @tanstack/ai-octane. Octane hooks including useChat for streaming chat with full type safety."
keywords:
  - tanstack ai
  - "@tanstack/ai-octane"
  - octane
  - useChat
  - octane hooks
  - api reference
---

Install `@tanstack/ai-octane`, then call `useChat` the same way you would in React. The hook modules are `.tsrx` and compile in your Octane plugin.

## Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

octane: @tanstack/ai-octane octane

<!-- ::end:tabs -->

`octane` is a required peer. This package publishes uncompiled source, like Svelte packages that ship `.svelte`.

## `useWebMCPTools(tools, options?)`

Register executable client tools after the Octane component mounts. Octane removes them on cleanup and replaces them when `tools` or `options` change.

For a complete setup and behavior guide, see [WebMCP Tools](../tools/webmcp).

```tsx
import {
  useWebMCPTools,
  type UseWebMCPToolsOptions,
} from '@tanstack/ai-octane'
import { searchProducts } from './tools'

const tools = [searchProducts]
const options: UseWebMCPToolsOptions<typeof tools> = {
  onError(error) {
    console.error(error)
  },
}

function ProductsPage() {
  useWebMCPTools(tools, options)
  return null
}
```

`UseWebMCPToolsOptions<TTools, TContext>` contains `toolOptions`, `context`, and `onError`. The hook owns the registration signal.

The `context` field is required when a tool declares a required runtime context. Keep `tools` and `options` stable when their values do not change.

## `useChat(options)`

Manages chat state in an Octane component.

```tsx
import { useState } from 'octane'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-octane'
import {
  createChatClientOptions,
  type InferChatMessages,
} from '@tanstack/ai-client'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const updateUIDef = toolDefinition({
  name: 'updateUI',
  description: 'Show a notification in the UI',
  inputSchema: z.object({ message: z.string() }),
})

export function ChatComponent() {
  const [notification, setNotification] = useState<string | null>(null)
  const updateUI = updateUIDef.client((input) => {
    setNotification(input.message)
    return { success: true }
  })
  const tools = [updateUI]

  const chatOptions = createChatClientOptions({
    connection: fetchServerSentEvents('/api/chat'),
    tools,
  })

  type ChatMessages = InferChatMessages<typeof chatOptions>

  const { messages, sendMessage, isLoading, error, addToolApprovalResponse } =
    useChat(chatOptions)

  return (
    <div>
      {notification}
      {isLoading ? 'Loading' : null}
      {error ? error.message : null}
      <button onClick={() => void sendMessage('hi')} type="button">
        Send
      </button>
      <button
        onClick={() =>
          void addToolApprovalResponse({ id: 'approval-1', approved: true })
        }
        type="button"
      >
        Approve
      </button>
      {messages.length}
    </div>
  )
}
```

The matching server route still runs `chat({ adapter, messages })` and returns SSE. See [Quick Start](../getting-started/quick-start).

### Options you pass first

Extends `ChatClientOptions` from `@tanstack/ai-client`. Pass `connection` or `fetcher`, not both.

- `connection` or `fetcher` - how the hook talks to your server
- `tools?` - client tool implementations from `.client()`
- `threadId?` - the only identity for this chat. Required when persistence is on
- `initialMessages?` - starting transcript
- `forwardedProps?` - JSON sent to the server on the AG-UI `forwardedProps` field

### Options you add later

- `live?` - subscribe on mount, unsubscribe on unmount
- `queue?` - what to do when `sendMessage` runs while a turn is in flight. Default queues
- `interrupts?` - typed interrupt definitions
- `context?` - client-only runtime context for client tools. Not sent to the server
- `onResponse?` / `onChunk?` / `onFinish?` / `onError?` / `onInterruptStateChange?`
- `devtools?` - display options. The hook always tags `framework: 'octane'`
- `body?` - deprecated. Use `forwardedProps`

Client tools run automatically. There is no `onToolCall` callback.

Changing `connection` or `fetcher` updates the live `ChatClient`. Changing `threadId` creates a new client.

### Returns

```typescript
import type { UIMessage } from '@tanstack/ai-octane'
import type { ModelMessage } from '@tanstack/ai/client'
import type {
  MultimodalContent,
  ChatClientState,
  ConnectionStatus,
  QueuedMessage,
  SendMessageOptions,
} from '@tanstack/ai-client'

interface UseChatReturn {
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
  addToolApprovalResponse: (response: {
    id: string
    approved: boolean
  }) => Promise<void>
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

`queue` holds sends that wait while a run is busy. `runId` is the in-flight turn, or `null`. Interrupt helpers (`interrupts`, `resolveInterrupts`, `cancelInterrupts`, `retryInterrupts`) are on the same object when you pass `interrupts`.

## Connection adapters

Re-exported from `@tanstack/ai-client`:

```typescript
import {
  fetchServerSentEvents,
  fetchHttpStream,
  stream,
  type ConnectionAdapter,
} from '@tanstack/ai-octane'
```

## Example: basic chat

```tsx
import { useState } from 'octane'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-octane'

export function Chat() {
  const [input, setInput] = useState('')
  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          <strong>{message.role}:</strong>
          {message.parts
            .filter((part) => part.type === 'text')
            .map((part) => part.content)
            .join('')}
        </div>
      ))}
      <input
        value={input}
        disabled={isLoading}
        onInput={(event) => setInput(event.currentTarget.value)}
      />
      <button
        disabled={isLoading}
        onClick={() => {
          void sendMessage(input)
          setInput('')
        }}
        type="button"
      >
        Send
      </button>
    </div>
  )
}
```

## Example: tool approval

```tsx
import { useChat, fetchServerSentEvents } from '@tanstack/ai-octane'

export function ChatWithApproval() {
  const { messages, sendMessage, addToolApprovalResponse } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  return (
    <div>
      <button onClick={() => void sendMessage('run the tool')} type="button">
        Send
      </button>
      {messages.map((message) =>
        message.parts.map((part) => {
          if (
            part.type !== 'tool-call' ||
            part.state !== 'approval-requested' ||
            !part.approval
          ) {
            return null
          }
          const approvalId = part.approval.id
          return (
            <div key={part.id}>
              <p>Approve: {part.name}</p>
              <button
                onClick={() =>
                  void addToolApprovalResponse({
                    id: approvalId,
                    approved: true,
                  })
                }
                type="button"
              >
                Approve
              </button>
              <button
                onClick={() =>
                  void addToolApprovalResponse({
                    id: approvalId,
                    approved: false,
                  })
                }
                type="button"
              >
                Deny
              </button>
            </div>
          )
        }),
      )}
    </div>
  )
}
```

## Other hooks

The package also exports `useRealtimeChat`, `useMcpAppBridge`, `useGeneration`, `useGenerateImage`, `useGenerateAudio`, `useGenerateSpeech`, `useGenerateVideo`, `useTranscription`, `useSummarize`, and `useAudioRecorder`.

The `./mcp-apps` React `AppRenderer` subpath is not in this package. `useMcpAppBridge` is.

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
