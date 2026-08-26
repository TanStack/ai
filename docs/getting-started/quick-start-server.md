---
title: "Quick Start: Server Only"
id: quick-start-server
order: 5
description: "Streaming AI chat endpoints in Node.js — no UI framework."
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

If you need AI on a Node backend only → install core + adapter, call `chat()`, return SSE or NDJSON.

Prefer one key for many models → [OpenRouter](../adapters/openrouter).

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

vanilla: @tanstack/ai @tanstack/ai-openai

<!-- ::end:tabs -->

## 2. One-shot text

```typescript
import { chat, streamToText } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages: [{ role: 'user', content: 'Hello!' }],
})

const text = await streamToText(stream)
console.log(text)
```

`chat()` → `AsyncIterable<StreamChunk>`. `streamToText` accumulates text.

## 3. Streaming HTTP (SSE)

Compatible with `@tanstack/ai-react` / `ai-vue` / `ai-svelte` later. Fastify/Hono also work if they return TanStack AI SSE.

```typescript ignore
import express from 'express'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const app = express()
app.use(express.json())

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body

  const stream = chat({
    adapter: openaiText('gpt-5.5'),
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

## 4. Tools (optional)

Agent loop calls the tool and continues in one `chat()`:

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
  adapter: openaiText('gpt-5.5'),
  messages: [{ role: 'user', content: 'Weather in Tokyo?' }],
  tools: [getWeather],
})

const text = await streamToText(stream)
console.log(text)
```

## Other response shapes

**NDJSON** — pair with `fetchHttpStream` on the client:

```typescript
import { chat, toHttpResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages } = await request.json()
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages,
  })
  return toHttpResponse(stream)
}
```

**Raw chunks**

```typescript
import { stream } from './stream'

for await (const chunk of stream) {
  if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
    process.stdout.write(chunk.delta ?? '')
  }
}
```

## API keys

```bash
# OpenRouter (recommended — access 300+ models with one key)
OPENROUTER_API_KEY=sk-or-...

# OpenAI
OPENAI_API_KEY=your-openai-api-key
```

Adapter reads the key at runtime. Never expose to the browser.

## Next

- [Tools](../tools/tools)
- [StreamProcessor](../reference/classes/StreamProcessor)
- [Adapters](../adapters/openai)
- [React Quick Start](./quick-start)
