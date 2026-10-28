<div align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://tanstack.com/api/readme/ai.png?framework=solid&theme=dark"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://tanstack.com/api/readme/ai.png?framework=solid"
    />
    <img
      src="https://tanstack.com/api/readme/ai.png?framework=solid"
      alt="TanStack Solid AI"
      width="900"
    />
  </picture>
</div>

# @tanstack/ai-solid

Solid primitives for building AI chat interfaces with TanStack AI.

## Installation

```bash
npm install @tanstack/ai-solid
# or
pnpm add @tanstack/ai-solid
# or
yarn add @tanstack/ai-solid
```

## useChat

`useChat` manages chat state, streams responses, and runs client tools. You own the input state. Call `sendMessage()` from any trigger: a form, a button, or a keyboard shortcut.

`useChat` returns Solid accessors. Call `messages()`, `isLoading()`, `error()`, and `interrupts()` to read them.

### Basic usage

```tsx
import { For, createSignal } from 'solid-js'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-solid'

export function Chat() {
  const { messages, sendMessage, isLoading } = useChat({
    threadId: 'support-42',
    connection: fetchServerSentEvents('/api/chat'),
  })
  const [input, setInput] = createSignal('')

  const send = () => {
    const text = input().trim()
    if (!text) return
    void sendMessage(text)
    setInput('')
  }

  return (
    <div>
      <For each={messages()}>
        {(message) => (
          <div>
            <strong>{message.role}: </strong>
            <For each={message.parts}>
              {(part) => (part.type === 'text' ? part.content : null)}
            </For>
          </div>
        )}
      </For>

      <input
        value={input()}
        onInput={(event) => setInput(event.currentTarget.value)}
        onKeyDown={(event) => event.key === 'Enter' && send()}
        disabled={isLoading()}
      />
      <button onClick={send} disabled={isLoading() || !input().trim()}>
        Send
      </button>
    </div>
  )
}
```

### Options

| Option            | Description                                                                   |
| ----------------- | ----------------------------------------------------------------------------- |
| `threadId`        | Required. The chat identity. Use a stable id for each conversation.           |
| `connection`      | Required. A connection adapter, such as `fetchServerSentEvents('/api/chat')`. |
| `tools`           | Client tools, and tool definitions that type tool parts and approvals.        |
| `initialMessages` | Messages to start with.                                                       |
| `forwardedProps`  | Sent to the server as AG-UI `RunAgentInput.forwardedProps`.                   |
| `onChunk`         | Called for each stream chunk.                                                 |
| `onFinish`        | Called with the final assistant message.                                      |
| `onError`         | Called when the run fails.                                                    |

### Return value

| Value                                | Description                                 |
| ------------------------------------ | ------------------------------------------- |
| `messages()`                         | The current conversation.                   |
| `isLoading()`, `status()`, `error()` | Run state.                                  |
| `sendMessage(content)`               | Sends a user message.                       |
| `append(message)`                    | Adds a message and starts a run.            |
| `reload()`                           | Runs the last user message again.           |
| `stop()`                             | Stops the current run.                      |
| `clear()`, `setMessages(messages)`   | Replace the conversation.                   |
| `interrupts()`, `resuming()`         | Paused tool approvals and other interrupts. |

## Connection adapters

```ts
import { fetchServerSentEvents, useChat } from '@tanstack/ai-solid'

const token = localStorage.getItem('token') ?? ''

const chat = useChat({
  threadId: 'support-42',
  connection: fetchServerSentEvents('/api/chat', {
    headers: { Authorization: `Bearer ${token}` },
  }),
})
```

`fetchHttpStream`, `fetchJson`, `webSocket`, `stream` (for server functions), and custom `ConnectionAdapter` objects are also available. See [Transports](https://tanstack.com/ai/latest/docs/transports/overview).

## Tool approval

Mark a tool `needsApproval: true` on the server. When the run pauses, the approval appears in `interrupts()`. Resolve it on the item with `resolveInterrupt`:

```tsx
import { For, Show } from 'solid-js'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-solid'
import { transferTool } from '../tools/transfer'

export function TransferApprovals() {
  const { interrupts, resuming } = useChat({
    threadId: 'account-42',
    connection: fetchServerSentEvents('/api/chat'),
    tools: [transferTool] as const,
  })

  return (
    <For each={interrupts()}>
      {(interrupt) => (
        <Show
          when={
            interrupt.kind === 'tool-approval' &&
            interrupt.toolName === 'transfer'
          }
        >
          <button
            disabled={!interrupt.canResolve || resuming()}
            onClick={() => interrupt.resolveInterrupt(true)}
          >
            Approve
          </button>
          <button
            disabled={!interrupt.canResolve || resuming()}
            onClick={() => interrupt.resolveInterrupt(false)}
          >
            Reject
          </button>
        </Show>
      )}
    </For>
  )
}
```

The full server and client code is in [Tool Approval](https://tanstack.com/ai/latest/docs/interrupts/tool-approval).

## Server endpoint

Use `chat()` on the server. It runs server tools in a loop and streams the result. `chatParamsFromRequest` reads `messages`, `threadId`, and `runId` from the request body:

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
    runId,
  })

  return toServerSentEventsResponse(stream)
}
```

## Chat UI components

`createChatHook` from `@tanstack/ai-solid/ui` binds your chat options and your components once, with typed tool parts and interrupts. See [Solid Chat UI](https://tanstack.com/ai/latest/docs/ui/solid).

## More

- [Quick Start](https://tanstack.com/ai/latest/docs/getting-started/quick-start)
- [Transports](https://tanstack.com/ai/latest/docs/transports/overview)
- [OpenTelemetry](https://tanstack.com/ai/latest/docs/advanced/otel)

## License

MIT
