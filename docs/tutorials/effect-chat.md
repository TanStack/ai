---
title: Effect Chat
id: effect-chat
order: 9
description: "Build a streaming React chat with an Effect server. AI.chat from @tanstack/ai-effect streams the reply, and a get_weather tool is an Effect that reads a service from a Layer."
keywords:
  - tanstack ai
  - tutorial
  - effect
  - ai-effect
  - serverTool
  - layer
  - useChat
  - openai
  - tanstack start
---

Your server code uses Effect, and you want a chat that streams tokens. Core `chat()` gives an async iterable, and its tools return promises. Your Effect services do not reach those tools.

`@tanstack/ai-effect` connects the two. `AI.chat` returns an Effect `Stream`. A tool made with `AI.serverTool` returns an Effect, and a Layer gives the tool its services.

In this tutorial, the model calls a `get_weather` tool, and the tool reads a `Weather` service. This tutorial uses React, TanStack Start, and OpenAI. It takes about 10 minutes.

## 1. Create a Start app

```bash
npx @tanstack/cli@latest create
```

Pick React. Then install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openai @tanstack/ai-effect effect

<!-- ::end:tabs -->

Put your OpenAI key in `.env.local`:

```bash
OPENAI_API_KEY=sk-...
```

## Client and server

- **The server** runs the chat in Effect. It owns the tool and the Layer that gives the tool its service.
- **The client** sends the messages and shows the reply. It does not use Effect.

The next steps build the server first. Then they build the client.

## 2. Add a service and a tool

Create `src/lib/weather.ts`:

```typescript ignore
import { toolDefinition } from '@tanstack/ai'
import * as AI from '@tanstack/ai-effect'
import { Context, Effect, Layer, Schema } from 'effect'

export class Weather extends Context.Service<
  Weather,
  { readonly forecast: (city: string) => Effect.Effect<string> }
>()('Weather') {}

// A fixed forecast. Call a real weather API here.
export const WeatherLive = Layer.succeed(Weather, {
  forecast: (city) => Effect.succeed(`Sunny and 22 C in ${city}`),
})

const getWeatherDef = toolDefinition({
  name: 'get_weather',
  description: 'Get the weather forecast for a city',
  inputSchema: AI.toolSchema(Schema.Struct({ city: Schema.String })),
  outputSchema: AI.toolSchema(Schema.Struct({ forecast: Schema.String })),
})

export const getWeather = AI.serverTool(getWeatherDef, ({ city }) =>
  Effect.gen(function* () {
    const weather = yield* Weather
    return { forecast: yield* weather.forecast(city) }
  }),
)
```

This file has three parts:

- `Weather` is an Effect service with one function, `forecast`.
- `WeatherLive` is a Layer that gives a fixed forecast. Put a call to a real weather API here.
- `getWeather` is the tool. `AI.serverTool` takes a tool definition and a function that returns an Effect.

The type of `getWeather` keeps `Weather` as a requirement. If the Effect fails, the model gets a tool error, and the run continues.

## 3. Add the server route

Create `src/routes/api.chat.ts`, next to `index.tsx`. Start maps this file name to the `/api/chat` path.

```typescript ignore
import { createFileRoute } from '@tanstack/react-router'
import { chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import * as AI from '@tanstack/ai-effect'
import { openaiText } from '@tanstack/ai-openai'
import { Stream } from 'effect'
import { WeatherLive, getWeather } from '@/lib/weather'

export async function POST({ request }: { request: Request }) {
  const params = await chatParamsFromRequest(request)

  const stream = AI.chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    tools: [getWeather],
  }).pipe(Stream.provide(WeatherLive))

  return toServerSentEventsResponse(Stream.toAsyncIterable(stream))
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST,
    },
  },
})
```

What each piece does:

- `chatParamsFromRequest` reads the messages and the thread id from the POST body.
- `AI.chat` takes the options of core `chat()`. It returns a `Stream` of chunks, and `Weather` is in its requirements.
- `Stream.provide(WeatherLive)` gives the `Weather` service to the tool. If you remove this line, `Stream.toAsyncIterable` does not type-check.
- `toServerSentEventsResponse` sends the chunks to the browser as Server-Sent Events.

If the browser closes the request, the stream stops. Then `AI.chat` aborts the request to OpenAI.

## 4. Add the chat page

Replace `src/routes/index.tsx` with this file:

```tsx ignore
import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

function ChatPage() {
  const [input, setInput] = useState('')
  const { messages, sendMessage, isLoading, error, stop } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId: 'effect-chat',
  })

  const handleSendMessage = () => {
    if (!input.trim()) return
    sendMessage(input.trim())
    setInput('')
  }

  return (
    <div className="mx-auto flex h-screen max-w-2xl flex-col gap-3 p-4 text-white">
      <div className="flex-1 space-y-3 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-gray-400">
            Ask for the weather in a city.
          </p>
        ) : null}
        {messages.map((message) => (
          <div key={message.id}>
            <p className="text-xs text-gray-400">{message.role}</p>
            {message.parts.map((part, index) => {
              if (part.type === 'text') {
                return (
                  <p key={index} className="whitespace-pre-wrap">
                    {part.content}
                  </p>
                )
              }
              if (part.type === 'tool-call') {
                return (
                  <p key={index} className="text-sm text-orange-400">
                    Called {part.name}
                  </p>
                )
              }
              return null
            })}
          </div>
        ))}
      </div>
      {error ? <p className="text-sm text-red-400">{error.message}</p> : null}
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              handleSendMessage()
            }
          }}
          placeholder="What is the weather in Oslo?"
          rows={1}
          disabled={isLoading}
          className="flex-1 resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
        />
        {isLoading ? (
          <button
            type="button"
            onClick={stop}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSendMessage}
            disabled={!input.trim()}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm disabled:opacity-50"
          >
            Send
          </button>
        )}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: ChatPage,
})
```

The client does not use Effect:

- `useChat` sends the messages to `/api/chat` and updates `messages` as tokens arrive.
- A `tool-call` part shows each time the model calls `get_weather`.

Run the app and send "What is the weather in Oslo?". The page shows "Called get_weather". Then the reply streams in with the forecast from your `Weather` service.

<!-- ::client-example library=ai framework=react slug=effect-chat -->

You have a streaming chat with an Effect server, and a tool that gets its service from a Layer.

Next, pick one:

- More about Effect tools and tool errors: [Effect tools](../effect/tools).
- Images, embeddings, and other activities in Effect: [Effect activities](../effect/activities).

The full example is on GitHub: [TanStack/ai `examples/react/effect-chat`](https://github.com/TanStack/ai/tree/main/examples/react/effect-chat).
