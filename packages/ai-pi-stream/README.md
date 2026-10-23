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
import { chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import { runPiAgent } from '@tanstack/ai-pi-stream'

export async function POST(request: Request) {
  return toServerSentEventsResponse(
    runPiAgent(await chatParamsFromRequest(request), {
      config: { model, convertToLlm: (piMessages) => piMessages },
      streamFn,
      tools,
      needsApproval: ['deleteFile'],
      systemPrompts: ['Be helpful.'],
    }),
  )
}
```

A pi tool in `needsApproval` pauses for a `useChat` approval. The client tools of `useChat` run in the browser.

## pi client, TanStack AI server

```ts
import { chat } from '@tanstack/ai'
import {
  chatParamsFromPiRequest,
  toPiAgentEvents,
} from '@tanstack/ai-pi-stream'

export async function POST(request: Request) {
  const events = toPiAgentEvents(
    chat({
      adapter,
      systemPrompts: ['Be helpful.'],
      ...(await chatParamsFromPiRequest(request)),
    }),
  )
  // Stream the events to the pi client, for example one JSON line each.
}
```

`chatParamsFromPiRequest` drops the client's system messages, so the server sets the system prompt. Approvals arrive as `tanstack-interrupt` pi messages and go back as `resume`.

## API

| Export                                           | Direction                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `runPiAgent(params, options)`                    | A pi agent for a `useChat` request, with approvals and client tools |
| `chatParamsFromPiRequest(request)`               | A pi client request to `chat()` params, with `resume`               |
| `fromPiAgentEvents(events, { threadId, runId })` | pi agent events to AG-UI events                                     |
| `toPiAgentEvents(stream, { model })`             | `chat()` events to pi agent events                                  |
| `toPiMessages` / `fromPiMessages`                | The history in each direction                                       |

## Docs

- [TanStack useChat with a pi agent](https://tanstack.com/ai/latest/docs/migration/pi-agent-tanstack-client)
- [pi UI with a TanStack AI server](https://tanstack.com/ai/latest/docs/migration/pi-client-tanstack-server)
- [TanStack AI vs pi](https://tanstack.com/ai/latest/docs/comparison/pi)
