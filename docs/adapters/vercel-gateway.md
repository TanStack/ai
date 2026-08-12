---
title: Vercel AI Gateway
id: vercel-gateway-adapter
description: "Use one API key to reach many providers through Vercel AI Gateway. Route, fall back, and generate chat, embeddings, and images with @tanstack/ai-vercel-gateway."
keywords:
  - tanstack ai
  - vercel
  - ai gateway
  - adapter
  - routing
  - fallback
  - embeddings
  - image generation
---

You want one API key and one URL, and you still want to pick the provider per request. Vercel AI Gateway sits in front of many model providers. This package talks to that public OpenAI-compatible API.

Install `@tanstack/ai-vercel-gateway`. Then call `vercelGatewayText`, `vercelGatewayEmbedding`, or `vercelGatewayImage`.

## Installation

```bash
npm install @tanstack/ai-vercel-gateway
```

## Auth

Set `AI_GATEWAY_API_KEY`. If that key is not set, the adapter uses `VERCEL_OIDC_TOKEN`.

```bash
export AI_GATEWAY_API_KEY="..."
```

You can also pass the key to a `create*` factory:

```typescript
import { createVercelGatewayText } from "@tanstack/ai-vercel-gateway"

const adapter = createVercelGatewayText(
  "anthropic/claude-opus-5",
  process.env.AI_GATEWAY_API_KEY!,
)
```

## Chat

The default adapter uses Chat Completions at `https://ai-gateway.vercel.sh/v1`. Model ids use the `creator/model` form.

**Server.** An endpoint that streams the reply over SSE:

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai"
import { vercelGatewayText } from "@tanstack/ai-vercel-gateway"

export async function POST(request: Request) {
  const { messages } = await request.json()

  const stream = chat({
    adapter: vercelGatewayText("anthropic/claude-opus-5"),
    messages,
  })

  return toServerSentEventsResponse(stream)
}
```

**Client.** The same `useChat` hook as every other provider:

```tsx
import { useState } from "react"
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react"

export function Chat() {
  const [input, setInput] = useState("")

  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  })

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          <strong>{message.role}</strong>
          {message.parts.map((part, index) =>
            part.type === "text" ? <p key={index}>{part.content}</p> : null,
          )}
        </div>
      ))}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!input.trim() || isLoading) return
          sendMessage(input)
          setInput("")
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

## Responses adapter

Use `vercelGatewayResponsesText` when the model must talk to the OpenAI Responses API through the Gateway. Chat Completions stays the default.

```typescript
import { chat } from "@tanstack/ai"
import { vercelGatewayResponsesText } from "@tanstack/ai-vercel-gateway"

const stream = chat({
  adapter: vercelGatewayResponsesText("openai/gpt-5.5"),
  messages: [{ role: "user", content: "Hello" }],
})
```

## Gateway routing

Put Gateway routing on `modelOptions.gateway`. The adapter sends those fields as `providerOptions.gateway`. Do not put `gateway` at the top level of the request body.

```typescript
import { chat } from "@tanstack/ai"
import { vercelGatewayText } from "@tanstack/ai-vercel-gateway"

const stream = chat({
  adapter: vercelGatewayText("anthropic/claude-opus-5"),
  messages: [{ role: "user", content: "Hello" }],
  modelOptions: {
    gateway: {
      order: ["anthropic", "openai"],
      only: ["anthropic"],
      sort: "cost",
      models: ["anthropic/claude-opus-5", "openai/gpt-5.5"],
      caching: "auto",
      disallowPromptTraining: true,
    },
  },
})
```

`order` is the provider try list. `only` limits which providers can run. `sort` picks cost, time to first token, or tokens per second. `models` is the fallback model list.

## Embeddings

```typescript
import { embed } from "@tanstack/ai"
import { vercelGatewayEmbedding } from "@tanstack/ai-vercel-gateway"

const result = await embed({
  adapter: vercelGatewayEmbedding("openai/text-embedding-3-small"),
  input: "a red guitar",
})

console.log(result.embeddings[0]?.vector)
```

## Image

Image generation is text-to-image only. The adapter calls `POST /v1/images/generations`. Image edits are not in this package yet.

```typescript
import { generateImage } from "@tanstack/ai"
import { vercelGatewayImage } from "@tanstack/ai-vercel-gateway"

const result = await generateImage({
  adapter: vercelGatewayImage("openai/gpt-image-1"),
  prompt: "a red guitar",
})
```

## Summarize

```typescript
import { summarize } from "@tanstack/ai"
import { vercelGatewaySummarize } from "@tanstack/ai-vercel-gateway"

const result = await summarize({
  adapter: vercelGatewaySummarize("anthropic/claude-opus-5"),
  text: "The Fender Stratocaster is a versatile electric guitar.",
  stream: false,
})
```

## What this package does not do

This package does not generate video. It does not do speech, transcription, or rerank. Use a dedicated adapter for those activities.

The catalog is a closed list from `GET /v1/models`. Daily CI updates that list.
