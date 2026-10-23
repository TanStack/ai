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

# @tanstack/ai-pi-stream

Convert between TanStack AI events (AG-UI) and pi agent events, the `AgentEvent`s of `@earendil-works/pi-agent-core`.

- Put TanStack AI `useChat` in front of a pi agent.
- Serve a pi UI from TanStack AI `chat()`.

Some features change shape or are dropped on the way. See the [compatibility table](https://tanstack.com/ai/latest/docs/migration/pi-compatibility).

## Installation

```bash
pnpm add @tanstack/ai-pi-stream @tanstack/ai @earendil-works/pi-agent-core @earendil-works/pi-ai
```

## TanStack AI client, pi agent

```ts
import { agentLoop } from '@earendil-works/pi-agent-core'
import {
  chatParamsFromRequest,
  convertMessagesToModelMessages,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { fromPiAgentEvents, toPiMessages } from '@tanstack/ai-pi-stream'

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)
  const history = toPiMessages(convertMessagesToModelMessages(messages))
  const prompt = history.pop()

  const events = agentLoop(
    prompt ? [prompt] : [],
    { messages: history, tools },
    { model, convertToLlm: (piMessages) => piMessages },
    request.signal,
    streamFn,
  )

  return toServerSentEventsResponse(
    fromPiAgentEvents(events, { threadId, runId }),
  )
}
```

## pi client, TanStack AI server

```ts
import { chat } from '@tanstack/ai'
import { fromPiMessages, toPiAgentEvents } from '@tanstack/ai-pi-stream'

const events = toPiAgentEvents(
  chat({ adapter, threadId, ...fromPiMessages(piMessages) }),
)
for await (const event of events) render(event)
```

## API

| Export                                             | Direction                                              |
| -------------------------------------------------- | ------------------------------------------------------ |
| `fromPiAgentEvents(events, { threadId, runId })`   | pi agent events to AG-UI events, for `useChat`         |
| `toPiAgentEvents(stream, { model })`               | `chat()` events to pi agent events                     |
| `toPiMessages(messages, { systemPrompts, model })` | TanStack `ModelMessage`s to pi messages                |
| `fromPiMessages(messages)`                         | pi messages to `chat()` `messages` and `systemPrompts` |

## Docs

- [TanStack useChat with a pi agent](https://tanstack.com/ai/latest/docs/migration/pi-agent-tanstack-client)
- [pi UI with a TanStack AI server](https://tanstack.com/ai/latest/docs/migration/pi-client-tanstack-server)
- [TanStack AI vs pi](https://tanstack.com/ai/latest/docs/comparison/pi)
