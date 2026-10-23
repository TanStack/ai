<div align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://tanstack.com/api/readme/ai.png?theme=dark"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://tanstack.com/api/readme/ai.png"
    />
    <img
      src="https://tanstack.com/api/readme/ai.png"
      alt="TanStack AI"
      width="900"
    />
  </picture>
</div>

<br />

# @tanstack/ai-ui-message-stream

Connect TanStack AI to the Vercel AI SDK UI message stream, the wire format of the AI SDK `useChat` hook.

- Serve AI SDK `useChat` from TanStack AI `chat()`.
- Call an AI SDK `streamText` route from TanStack AI `useChat`.

This package is a stop gap while you port an app from the AI SDK one side at a time. Some features change shape or are dropped on the way. See the [compatibility table](https://tanstack.com/ai/latest/docs/migration/ai-sdk-compatibility). When both sides use TanStack AI, remove it.

## Installation

```bash
pnpm add @tanstack/ai-ui-message-stream @tanstack/ai ai
```

## AI SDK client, TanStack AI server

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import {
  chatParamsFromAISDKRequest,
  toUIMessageStream,
} from '@tanstack/ai-ui-message-stream'
import { createUIMessageStreamResponse } from 'ai'

export async function POST(request: Request) {
  const params = await chatParamsFromAISDKRequest(request)

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    ...params,
  })

  return createUIMessageStreamResponse({ stream: toUIMessageStream(stream) })
}
```

## TanStack AI client, AI SDK server

```tsx
import { useChat } from '@tanstack/ai-react'
import { fromChatTransport } from '@tanstack/ai-ui-message-stream'
import { DefaultChatTransport } from 'ai'

const connection = fromChatTransport(
  new DefaultChatTransport({ api: '/api/chat' }),
)

export function Chat() {
  const { messages, sendMessage } = useChat({
    connection,
    threadId: 'support-chat',
  })
  // render messages
}
```

## API

| Export                                                                       | Direction                                                                  |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `chatParamsFromAISDKRequest(request)`                                        | AI SDK `useChat` request to `chat()` params, approval answers included     |
| `toUIMessageStream(stream)`                                                  | `chat()` events to an AI SDK UI message stream                             |
| `toResumableUIMessageStreamResponse(stream, durability)`                     | A `chat()` run that AI SDK `useChat({ resume: true })` can rejoin          |
| `resumeUIMessageStreamResponse(durability)`                                  | The AI SDK resume `GET`                                                    |
| `fromChatTransport(transport, { threadId, tools, outputSchema, reconnect })` | AI SDK `ChatTransport` to a TanStack `useChat` connection                  |
| `clientToolsFromAISDKBody(body, serverTools)`                                | On an AI SDK route: the client tools of the request, plus the server tools |
| `fromAISDKMessages` / `toAISDKMessages`                                      | Message history in each direction                                          |
| `fromUIMessageStream(stream, ids)`                                           | AI SDK UI message stream to TanStack events                                |

Text, reasoning, tools, tool approvals, activity, subagents and stream resume cross in both directions where the other side has them. Shared state goes from a TanStack server to an AI SDK client only, because the AI SDK client does not send state.

## Docs

- [AI SDK useChat with a TanStack AI server](https://tanstack.com/ai/latest/docs/migration/ai-sdk-client-tanstack-server)
- [TanStack useChat with an AI SDK server](https://tanstack.com/ai/latest/docs/migration/tanstack-client-ai-sdk-server)
