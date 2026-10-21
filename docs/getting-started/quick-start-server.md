---
title: "Quick Start: Server Only"
id: quick-start-server
order: 5
description: "Call a model from Node.js with TanStack AI. Get text back in a script, or serve a streaming chat endpoint. No UI framework needed."
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

You have a Node.js backend and you want a model to answer from it. You do not need a UI framework for that.

`chat()` runs on the server and returns a stream. You can read it to the end as text, or send it over HTTP. This takes about 5 minutes.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-openai
vue: @tanstack/ai @tanstack/ai-openai
solid: @tanstack/ai @tanstack/ai-openai
svelte: @tanstack/ai @tanstack/ai-openai
preact: @tanstack/ai @tanstack/ai-openai
angular: @tanstack/ai @tanstack/ai-openai
vanilla: @tanstack/ai @tanstack/ai-openai
octane: @tanstack/ai @tanstack/ai-openai

<!-- ::end:tabs -->

> [!TIP]
> If you do not want a key for each provider, use [OpenRouter](../adapters/openrouter). It gives you 300+ models with one API key.

## 2. Add your API key

Create a `.env` file:

```bash
OPENAI_API_KEY=your-openai-api-key
```

The adapter reads `OPENAI_API_KEY` at runtime. Do not send this key to the browser.

## 3. Get a reply

Call `chat()`, then read the whole stream with `streamToText`:

```typescript
import { chat, streamToText } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'Hello!' }],
})

const { text } = await streamToText(stream)
console.log(text)
```

Run the file. The reply prints to the terminal.

## 4. Serve it over HTTP

This Express server streams the reply as Server-Sent Events on `/api/chat`:

```typescript ignore
import express from 'express'
import {
  chat,
  chatParamsFromRequestBody,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const app = express()
app.use(express.json())

app.post('/api/chat', async (req, res) => {
  const { messages, threadId, runId } = await chatParamsFromRequestBody(
    req.body,
  )

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
    runId,
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

The client hooks (`useChat` in `@tanstack/ai-react`, `@tanstack/ai-vue`, `@tanstack/ai-svelte`, and the others) can talk to this endpoint. Add a UI later with the [Quick Start](./quick-start).

You now have a model that answers from your backend.

## How it works

- `chat()` returns an `AsyncIterable<StreamChunk>`. Nothing runs until you read it.
- `streamToText` reads the stream to the end. It returns `{ text, chunks }`. `text` is the full reply. `chunks` holds the rest of the run: tool calls, usage, and interrupts.
- `toServerSentEventsResponse` turns the stream into a Web `Response` in the TanStack AI SSE format.

Any backend that returns this format works. Fastify, Hono, and other Node.js frameworks are fine.

## Next

- [Tools](../tools/tools): add function calling and agent loops.
- [Adapters](../adapters/openai): connect to other providers.
- [Quick Start](./quick-start): add a frontend.

## Advanced

### Add a server tool

Define a tool with `toolDefinition`, then pass it to `chat()`. The agent loop calls the tool and sends the result back to the model:

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
  return { temp: 22, condition: `sunny in ${city}` }
})

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'Weather in Tokyo?' }],
  tools: [getWeather],
})

const { text } = await streamToText(stream)
console.log(text)
```

The model decides when to call `getWeather`. It gets the result and uses it in its answer, all inside one `chat()` call.

### Newline-delimited JSON

`toHttpResponse()` returns a `Response` with newline-delimited JSON instead of SSE. On the client, pair it with `fetchHttpStream`:

```typescript
import { chat, chatParamsFromRequest, toHttpResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
    runId,
  })
  return toHttpResponse(stream)
}
```

### Read the raw stream

Iterate the stream with `for await` to handle each chunk yourself:

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'Hello!' }],
})

for await (const chunk of stream) {
  if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
    process.stdout.write(chunk.delta ?? '')
  }
}
```

You see every chunk type: text deltas, tool calls, run lifecycle events, and more. For more control, see [StreamProcessor](../reference/classes/StreamProcessor).

### OpenRouter key

To use OpenRouter, put its key in `.env`:

```bash
OPENROUTER_API_KEY=sk-or-...
```

Then use the adapter from [OpenRouter](../adapters/openrouter).
