---
title: Neon AI Gateway
id: neon-adapter
description: "Call Claude, GPT, Gemini, and open models with one Neon credential through the Neon AI Gateway. Chat, embeddings, and summarize work with @tanstack/ai-neon."
keywords:
  - tanstack ai
  - neon
  - ai gateway
  - adapter
  - claude
  - gemini
  - embeddings
  - pgvector
---

You want Claude, GPT, and Gemini in your app, and you do not want an account and a key for each provider. The Neon AI Gateway gives your Neon branch one credential for every model in its catalog.

Install `@tanstack/ai-neon`. Then call `neonText` with a model id such as `claude-opus-5-5`.

## Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-neon
vue: @tanstack/ai-neon
solid: @tanstack/ai-neon
svelte: @tanstack/ai-neon
preact: @tanstack/ai-neon
angular: @tanstack/ai-neon
vanilla: @tanstack/ai-neon
octane: @tanstack/ai-neon

<!-- ::end:tabs -->

## Auth

The adapter reads two variables:

- `NEON_AI_GATEWAY_TOKEN`: the Neon credential (`nt_live_...`).
- `NEON_AI_GATEWAY_BASE_URL`: the gateway host of your branch, with no path.

`neon env pull` writes both to `.env`. A deployed Neon Function gets both automatically.

```bash
NEON_AI_GATEWAY_TOKEN=nt_live_...
NEON_AI_GATEWAY_BASE_URL=https://br-winter-pond-aptw82ef-api.ai.c-2.us-east-2.aws.neon.tech
```

You can also pass the token to a `create*` factory. `baseURL` is the same bare host:

```typescript
import { createNeonText } from "@tanstack/ai-neon"

const adapter = createNeonText("claude-opus-5-5", process.env.NEON_AI_GATEWAY_TOKEN!, {
  baseURL: process.env.NEON_AI_GATEWAY_BASE_URL,
})
```

## Chat

Model ids are the catalog ids, with no provider prefix.

**Server.** An endpoint that streams the reply over SSE:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai"
import { neonText } from "@tanstack/ai-neon"

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)

  const stream = chat({
    adapter: neonText("claude-opus-5-5"),
    messages,
    threadId,
    runId,
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
    threadId: "support-chat",
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

To change the model, change the id. The rest of the code stays the same.

## Which endpoint each model uses

The gateway has one endpoint per API style. `neonText` sends each model to the endpoint that serves it best:

| Models | Endpoint | What you get |
| --- | --- | --- |
| Claude (`claude-*`) | `/anthropic/v1/messages` | The [Anthropic adapter](./anthropic), with thinking budgets and prompt caching |
| `gpt-5-3-codex`, `gpt-5-5-pro` | `/openai/v1/responses` | The OpenAI Responses API, the only API that serves these models |
| All other models | `/v1/chat/completions` | Chat Completions, which serves every model in the catalog |

The types follow the endpoint. For example, a Claude model takes the Anthropic model options.

Chat Completions accepts text and images through this adapter. For documents, use Claude or a GPT model with `api: "responses"`. Audio and video inputs are not supported.

Other GPT models can also use the Responses API. Pass `{ api: "responses" }`:

```typescript
import { chat } from "@tanstack/ai"
import { neonText } from "@tanstack/ai-neon"

const stream = chat({
  adapter: neonText("gpt-6-1-sol", { api: "responses" }),
  messages: [{ role: "user", content: "Hello" }],
  threadId: "thread-1",
})
```

`NEON_RESPONSES_MODELS` lists the models that take `api: "responses"`. TypeScript rejects it for any other model.

Need a header on each request, or a log of each model call? The chat adapters on this page support [`wrapFetch`](../advanced/middleware#change-the-http-requests-of-a-call).

## Reasoning

Set `reasoning` on `chat()`. The types take the levels of each model:

```typescript
import { chat } from "@tanstack/ai"
import { neonText } from "@tanstack/ai-neon"

const stream = chat({
  adapter: neonText("gemini-3-8-flash"),
  messages: [{ role: "user", content: "Plan a database migration." }],
  threadId: "thread-1",
  reasoning: "high",
})
```

- Chat Completions sends `reasoning_effort`. Responses sends `reasoning.effort`. Neither takes `budgetTokens`.
- Claude takes the same levels as on [Anthropic](./anthropic#reasoning), and older Claude models also take `budgetTokens`.

## Embeddings

Embed text with the same credential. Then keep the vectors in your branch, next to the rows they describe:

```typescript
import { embed } from "@tanstack/ai"
import { neonEmbedding } from "@tanstack/ai-neon"

const result = await embed({
  adapter: neonEmbedding("qwen3-embedding-0-6b"),
  input: ["Neon branches a database like code."],
})

console.log(result.embeddings[0]?.vector.length) // 1024
```

All three embedding models (`qwen3-embedding-0-6b`, `gte-large-en`, `bge-large-en`) return 1024 numbers. A pgvector column of the same size stores them:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE documents (id serial PRIMARY KEY, body text, embedding vector(1024));
```

## Summarize

```typescript
import { summarize } from "@tanstack/ai"
import { neonSummarize } from "@tanstack/ai-neon"

const result = await summarize({
  adapter: neonSummarize("gpt-6-1-sol"),
  threadId: "thread-1",
  text: "The Fender Stratocaster is a versatile electric guitar.",
  maxLength: 60,
})
```

Summarize uses the same endpoint and route options as `neonText` for the model. With `api: "responses"`, `modelOptions` accepts Responses options such as `max_output_tokens`.

## Models

Pass a model id from the catalog. TypeScript rejects an id that is not on a list.

- `NEON_CHAT_MODELS`: every chat model.
- `NEON_ANTHROPIC_MODELS`: the Claude models that go to the Anthropic endpoint.
- `NEON_RESPONSES_MODELS`: the models that take `api: "responses"`.
- `NEON_EMBEDDING_MODELS`: the embedding models.

The lists come from the [Neon model catalog](https://neon.com/models). Your account can have a smaller set. To see the models your branch can call, ask the gateway:

```bash
curl "$NEON_AI_GATEWAY_BASE_URL/v1/models" \
  -H "Authorization: Bearer $NEON_AI_GATEWAY_TOKEN"
```

A model with `"enabled": false` in that list is in the catalog, but your account cannot call it yet.

## Errors

- `401`: the token is missing, wrong, or revoked.
- `403 credential not authorized for ai gateway`: the credential has no `ai_gateway:invoke` scope. Make a new credential with that scope.
- `403 model requires a verified account`: request access to the model on the AI Gateway page of your branch in the Neon Console.
- `429`: your account quota or the upstream provider limit is reached. The response has a `Retry-After` header.

The gateway needs a paid Neon plan and a project in a supported region. See [Neon AI Gateway](https://neon.com/docs/ai-gateway/overview) for regions, pricing, and limits.
