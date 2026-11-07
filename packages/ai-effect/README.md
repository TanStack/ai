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

# @tanstack/ai-effect

Effect 4 bindings for TanStack AI.

- `chat` returns an Effect `Stream` of chunks.
- `serverTool` makes a tool from a function that returns an Effect. A Layer gives the tool its services.
- `toolSchema` turns an Effect Schema into a tool schema that works with OpenAI strict mode.
- Every other activity (images, speech, embeddings, and more) returns an `Effect`, or a `Stream` with `stream: true`.
- Every failure is a typed `AIError`. Interruption aborts the request to the provider.

## Install

```bash
npm install @tanstack/ai @tanstack/ai-effect effect
```

The package needs `effect` 4.1 or later.

## Stream a chat

```ts ignore
import { chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import * as AI from '@tanstack/ai-effect'
import { openaiText } from '@tanstack/ai-openai'
import { Stream } from 'effect'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)

  const stream = AI.chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
  })

  return toServerSentEventsResponse(Stream.toAsyncIterable(stream))
}
```

## Docs

- [Effect guide](https://tanstack.com/ai/latest/docs/effect/index)
- [Effect tools](https://tanstack.com/ai/latest/docs/effect/tools)
- [Effect activities](https://tanstack.com/ai/latest/docs/effect/activities)
- [Effect Chat tutorial](https://tanstack.com/ai/latest/docs/tutorials/effect-chat)
- [API reference](https://tanstack.com/ai/latest/docs/api/ai-effect)
