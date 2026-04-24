---
title: "Quick Start: Server Only"
id: quick-start-server
order: 5
description: "Add a streaming AI chat endpoint to a Node.js backend with TanStack AI — no UI framework required."
keywords:
  - tanstack ai
  - node.js
  - server
  - backend
  - quick start
  - streaming chat
  - openai
  - sse
---

You have a Node.js backend and want to add AI capabilities. By the end of this guide, you'll have a working chat endpoint powered by TanStack AI and OpenAI -- no UI framework required.

> **Tip:** If you'd prefer not to sign up with individual AI providers, [OpenRouter](../adapters/openrouter) gives you access to 300+ models with a single API key and is the easiest way to get started.

## Installation

```bash
npm install @tanstack/ai @tanstack/ai-openai
# or
pnpm add @tanstack/ai @tanstack/ai-openai
# or
yarn add @tanstack/ai @tanstack/ai-openai
```

## Basic Chat

The simplest way to get a response -- call `chat()` and collect the text:

```typescript
import { chat, streamToText } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openaiText('gpt-4o'),
  messages: [{ role: 'user', content: 'Hello!' }],
})

const text = await streamToText(stream)
console.log(text)
```

`chat()` returns an `AsyncIterable<StreamChunk>`. `streamToText` consumes it and returns the accumulated text content.

## HTTP Endpoint

Here's an Express server that exposes a streaming chat endpoint using Server-Sent Events:

```typescript
import express from 'express'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const app = express()
app.use(express.json())

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body

  const stream = chat({
    adapter: openaiText('gpt-4o'),
    messages,
  })

  const response = toServerSentEventsResponse(stream)
  res.writeHead(response.status, Object.fromEntries(response.headers))

  const body = response.body
  if (body) {
    const reader = body.getReader()
    const pump = async () => {
      const { done, value } = await reader.read()
      if (done) {
        res.end()
        return
      }
      res.write(value)
      await pump()
    }
    await pump()
  }
})

app.listen(3000, () => console.log('Server running on port 3000'))
```

> **Tip:** Any backend that returns the TanStack AI SSE format works -- you can use Fastify, Hono, or any other Node.js framework.

This endpoint is compatible with TanStack AI's client-side `useChat` hooks (`@tanstack/ai-react`, `@tanstack/ai-vue`, `@tanstack/ai-svelte`), so you can pair it with any frontend later.

## With Tools

Define a server tool with `toolDefinition` and pass it to `chat()`. The agent loop automatically calls your tool and feeds the result back to the model:

```typescript
import { chat, toolDefinition, streamToText } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const getWeather = toolDefinition({
  name: 'getWeather',
  description: 'Get weather for a city',
  inputSchema: z.object({ city: z.string() }),
  outputSchema: z.object({ temp: z.number(), condition: z.string() }),
}).server(async ({ city }) => {
  return { temp: 22, condition: 'sunny' }
})

const stream = chat({
  adapter: openaiText('gpt-4o'),
  messages: [{ role: 'user', content: 'Weather in Tokyo?' }],
  tools: [getWeather],
})

const text = await streamToText(stream)
console.log(text)
```

The model decides when to call `getWeather`, receives the result, and incorporates it into its response -- all within a single `chat()` call.

## Alternative Response Formats

TanStack AI ships several ways to return a stream over HTTP:

**`toHttpResponse()`** returns a `Response` using newline-delimited JSON instead of SSE. Pair it with `fetchHttpStream` on the client:

```typescript
import { chat, toHttpResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openaiText('gpt-4o'),
  messages,
})
const response = toHttpResponse(stream)
```

**Raw stream consumption** -- iterate the `AsyncIterable` directly with `for await`:

```typescript
for await (const chunk of stream) {
  if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
    process.stdout.write(chunk.delta ?? '')
  }
}
```

This gives you full control over every chunk type (text deltas, tool calls, run lifecycle events, etc.).

## Environment Variables

Create a `.env` file with your API key:

```bash
# OpenRouter (recommended — access 300+ models with one key)
OPENROUTER_API_KEY=sk-or-...

# OpenAI
OPENAI_API_KEY=your-openai-api-key
```

The adapter reads `OPENAI_API_KEY` at runtime. Never expose it to the browser.

## Next Steps

- Learn about [Tools](../tools/tools) to add function calling and agent loops
- Explore [StreamProcessor](../reference/classes/StreamProcessor) for fine-grained stream control
- Check out the [Adapters](../adapters/openai) to connect to different providers
- See the [React Quick Start](./quick-start) to add a frontend
