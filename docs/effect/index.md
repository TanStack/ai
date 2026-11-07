---
title: Effect
id: effect
order: 1
description: "Stream a TanStack AI chat from an Effect 4 server. AI.chat from @tanstack/ai-effect returns an Effect Stream that you send to useChat as Server-Sent Events."
keywords:
  - tanstack ai
  - effect
  - effect 4
  - ai-effect
  - stream
  - server-sent events
  - useChat
---

Your server code uses Effect 4. Core `chat()` returns an async iterable and throws plain errors, so it does not fit in your Effect program.

`@tanstack/ai-effect` wraps TanStack AI for Effect. `AI.chat` returns an Effect `Stream` of chunks. Its errors are typed, and interruption stops the model request.

## 1. Install the packages

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-effect @tanstack/ai-openai @tanstack/ai-react effect

<!-- ::end:tabs -->

The package needs Effect 4 (`effect` 4.1 or later).

## 2. Stream the chat from your server route

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

What each piece does:

- `AI.chat` takes the options of core `chat()`. It returns a `Stream<StreamChunk, AIError>`.
- `Stream.toAsyncIterable` turns the `Stream` into the async iterable that `toServerSentEventsResponse` reads.
- If the browser closes the request, the stream stops. Then `AI.chat` aborts the request to the model.

## 3. Show the chat on the client

The client does not use Effect. It reads the Server-Sent Events with `useChat`:

```tsx
import { useState } from 'react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function Chat() {
  const [input, setInput] = useState('')
  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId: 'effect-chat',
  })

  return (
    <div>
      {messages.map((message) => (
        <p key={message.id}>
          {message.role}:{' '}
          {message.parts.map((part) =>
            part.type === 'text' ? part.content : null,
          )}
        </p>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          sendMessage(input)
          setInput('')
        }}
      >
        <input value={input} onChange={(event) => setInput(event.target.value)} />
        <button type="submit" disabled={isLoading}>
          Send
        </button>
      </form>
    </div>
  )
}
```

Send a message. The reply streams in token by token from your Effect server.

## Get the whole reply as an Effect

If you do not need tokens as they arrive, pass `stream: false`. Then `AI.chat` returns an `Effect` of `{ text, chunks }`:

```ts ignore
import * as AI from '@tanstack/ai-effect'
import { openaiText } from '@tanstack/ai-openai'
import { Effect } from 'effect'

const program = Effect.gen(function* () {
  const { text } = yield* AI.chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: [{ role: 'user', content: 'Write a haiku about rivers.' }],
    threadId: 'haiku',
    stream: false,
  })
  return text
})

const haiku = await Effect.runPromise(program)
```

With `outputSchema`, `AI.chat` returns an `Effect` of the parsed object. See [Structured Outputs](../structured-outputs/overview) for the schema options.

## Next

- Build the full app step by step: [Effect Chat tutorial](../tutorials/effect-chat).
- Give your tools Effect services: [Effect tools](./tools).
- Run images, embeddings, and speech as Effects: [Effect activities](./activities).
