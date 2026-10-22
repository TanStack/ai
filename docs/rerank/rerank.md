---
title: Reranking
id: rerank
order: 1
description: "Sort candidate documents by how well they answer a query with rerank(). Use it as the precision step for RAG and search, with Cohere or OpenRouter."
keywords:
  - tanstack ai
  - rerank
  - reranking
  - relevance
  - rag
  - retrieval
  - semantic search
  - cohere
---

`rerank()` sorts candidate documents by relevance to a query. Use it after vector search or keyword search.

`rerank()` sends the query and the candidates to a reranking model. You get the documents back sorted by relevance, with a score for each.

## Quick setup

1. Install the core package and the Cohere adapter:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-cohere
vue: @tanstack/ai @tanstack/ai-cohere
solid: @tanstack/ai @tanstack/ai-cohere
svelte: @tanstack/ai @tanstack/ai-cohere
preact: @tanstack/ai @tanstack/ai-cohere
angular: @tanstack/ai @tanstack/ai-cohere
vanilla: @tanstack/ai @tanstack/ai-cohere
octane: @tanstack/ai @tanstack/ai-cohere

<!-- ::end:tabs -->

2. Put your key on the server. The adapter reads it at runtime:

```bash
COHERE_API_KEY=your-cohere-api-key
```

3. Call `rerank()` on the server:

```typescript
import { rerank } from '@tanstack/ai'
import { cohereRerank } from '@tanstack/ai-cohere'

const { ranking, rerankedDocuments } = await rerank({
  adapter: cohereRerank('rerank-v3.5'),
  query: 'talk about rain',
  documents: ['sunny day at the beach', 'rainy afternoon in the city'],
  topN: 2,
})

console.log(rerankedDocuments[0]) // 'rainy afternoon in the city'
console.log(ranking[0]) // { index: 1, score: 0.98, document: 'rainy afternoon in the city' }
```

The most relevant document is now first.

## How it works

- `rerankedDocuments` holds your documents, most relevant first.
- `ranking` holds the same order with a `score` and the original `index` for each document.
- `topN` keeps only the best N results. Leave it out to get all of them back.
- Every rerank adapter uses the same `rerank()` call. To change provider, change the adapter.

## Use it in a RAG pipeline

Reranking is the second stage after a broad, cheap retrieval. Fetch many candidates with vector search. Then rerank and keep only the best few for the prompt:

```typescript ignore
import { rerank } from '@tanstack/ai'
import { cohereRerank } from '@tanstack/ai-cohere'
import { vectorSearch } from './my-vector-store'

async function retrieveContext(query: string) {
  // 1. Fetch many candidates cheaply.
  const candidates = await vectorSearch(query, { limit: 50 })

  // 2. Rerank and keep the most relevant few for the prompt.
  const { rerankedDocuments } = await rerank({
    adapter: cohereRerank('rerank-v3.5'),
    query,
    documents: candidates.map((c) => c.text),
    topN: 5,
  })

  return rerankedDocuments
}
```

To make the vectors for that first stage, see [Embeddings](../embeddings).

## Rerank objects, not only strings

Pass JSON-serializable objects to keep an id or metadata with each document. The result gives back your original object, with full types:

```typescript
import { rerank } from '@tanstack/ai'
import { cohereRerank } from '@tanstack/ai-cohere'

const chunks = [
  { id: 'doc-1', text: 'A heavy gaming desktop with an RTX card.' },
  { id: 'doc-2', text: 'A lightweight ultrabook with all-day battery.' },
]

const { ranking } = await rerank({
  adapter: cohereRerank('rerank-v3.5'),
  query: 'best laptop for travel',
  documents: chunks,
})

// `document` is the original object, so `id` is typed.
console.log(ranking[0]?.document.id) // 'doc-2'
```

## Call it from the browser

`rerank()` needs your API key, so it runs on the server. Put it in a route and call the route from the client.

Server route:

```typescript
import { rerank } from '@tanstack/ai'
import { cohereRerank } from '@tanstack/ai-cohere'

export async function POST(request: Request) {
  const body: unknown = await request.json()
  if (
    typeof body !== 'object' ||
    body === null ||
    !('query' in body) ||
    typeof body.query !== 'string' ||
    !('documents' in body) ||
    !Array.isArray(body.documents)
  ) {
    return new Response('Invalid request body', { status: 400 })
  }

  const result = await rerank({
    adapter: cohereRerank('rerank-v3.5'),
    query: body.query,
    documents: body.documents,
    topN: 3,
  })

  return Response.json(result)
}
```

Client:

```typescript
export async function rerankDocuments(query: string, documents: Array<string>) {
  const res = await fetch('/api/rerank', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, documents }),
  })
  const result = await res.json()
  return result.rerankedDocuments
}
```

## Use OpenRouter instead

OpenRouter routes rerank through your existing OpenRouter key. Install `@tanstack/ai-openrouter`, then swap the adapter:

```typescript
import { rerank } from '@tanstack/ai'
import { openRouterRerank } from '@tanstack/ai-openrouter'

const { rerankedDocuments } = await rerank({
  adapter: openRouterRerank('cohere/rerank-v3.5'),
  query: 'talk about rain',
  documents: ['sunny day at the beach', 'rainy afternoon in the city'],
  topN: 2,
})

console.log(rerankedDocuments[0]) // 'rainy afternoon in the city'
```

`openRouterRerank` reads `OPENROUTER_API_KEY` from the environment.

## Try the example

`examples/ts-react-rerank` is a small TanStack Start app. It shows a list of support articles, a query box, and the original order next to the reranked order with scores. A dropdown switches between the Cohere and OpenRouter adapters.

```bash
cd examples/ts-react-rerank
pnpm install
cp .env.example .env   # add COHERE_API_KEY and/or OPENROUTER_API_KEY
pnpm dev
```

## Advanced

### Options

| Option         | Type                          | Description                                                             |
| -------------- | ----------------------------- | ----------------------------------------------------------------------- |
| `adapter`      | `RerankAdapter`               | A rerank adapter with a model, for example `cohereRerank('rerank-v3.5')` |
| `query`        | `string`                      | The query to score documents against. Required.                         |
| `documents`    | `Array<string \| object>`     | The candidate documents. Required.                                      |
| `topN`         | `number`                      | Return only the top N results                                           |
| `abortSignal`  | `AbortSignal`                 | Cancel the request                                                      |
| `modelOptions` | provider options              | Provider-specific options (see below)                                   |
| `middleware`   | `Array<GenerationMiddleware>` | Observe-only lifecycle hooks (usage, finish, error, abort)              |

### Cohere options

Cohere rerank accepts `maxTokensPerDoc`. It caps the tokens kept per document when Cohere splits long inputs. The Cohere default is 4096.

```typescript
import { rerank } from '@tanstack/ai'
import { cohereRerank } from '@tanstack/ai-cohere'

const { ranking } = await rerank({
  adapter: cohereRerank('rerank-v3.5'),
  query: 'refund policy',
  documents: ['Returns accepted within 30 days.', 'Free shipping over $50.'],
  modelOptions: {
    maxTokensPerDoc: 512,
  },
})

console.log(ranking)
```

### API keys

- `cohereRerank` reads `COHERE_API_KEY`.
- `openRouterRerank` reads `OPENROUTER_API_KEY`.
- To pass a Cohere key in code, use `createCohereRerank('rerank-v3.5', 'co-...')`.

### Object documents on the wire

The adapter serializes object documents to JSON before it sends them to the provider. Then it maps the ranking back to your original objects by index.

### Result shape

```typescript
import type { TokenUsage } from '@tanstack/ai'

interface RerankResult<TDocument = string> {
  id: string
  model: string
  // Scored results, most relevant first.
  ranking: Array<{ index: number; score: number; document: TDocument }>
  // The documents in relevance order (ranking.map(r => r.document)).
  rerankedDocuments: Array<TDocument>
  // Rerank usually bills in provider "search units"
  // (usage.billed = { quantity, unit: 'units' }). Some providers (for example
  // OpenRouter) also report totalTokens and cost. Cohere reports only search
  // units and leaves token counts at 0.
  usage: TokenUsage
}
```

### Cancel a request

Pass an `abortSignal`:

```typescript
import { rerank } from '@tanstack/ai'
import { cohereRerank } from '@tanstack/ai-cohere'

const controller = new AbortController()
setTimeout(() => controller.abort(), 5000)

const result = await rerank({
  adapter: cohereRerank('rerank-v3.5'),
  query: 'q',
  documents: ['a', 'b'],
  abortSignal: controller.signal,
})

console.log(result.rerankedDocuments)
```

### Track usage

Add observe-only middleware to track usage, completion, errors, and cancellation. It is the same `GenerationMiddleware` contract that the media activities use. See [Middleware](../advanced/middleware).

```typescript
import { rerank } from '@tanstack/ai'
import { cohereRerank } from '@tanstack/ai-cohere'

const result = await rerank({
  adapter: cohereRerank('rerank-v3.5'),
  query: 'q',
  documents: ['a', 'b'],
  middleware: [
    {
      name: 'usage-logger',
      onUsage: (_ctx, usage) => {
        if (usage.billed) {
          console.log(
            `search units billed: ${usage.billed.quantity} ${usage.billed.unit}`,
          )
        }
      },
    },
  ],
})

console.log(result.rerankedDocuments)
```

> [!TIP]
> Pass `otelMiddleware()` to emit OpenTelemetry spans for rerank calls. See [OpenTelemetry](../advanced/otel).

### Errors

An empty `documents` array throws before any request goes out. Provider errors reject the promise:

```typescript
import { rerank } from '@tanstack/ai'
import { cohereRerank } from '@tanstack/ai-cohere'

try {
  const result = await rerank({
    adapter: cohereRerank('rerank-v3.5'),
    query: 'q',
    documents: ['a', 'b'],
  })
  console.log(result.rerankedDocuments)
} catch (error) {
  if (error instanceof Error) {
    console.error('Rerank failed:', error.message)
  }
}
```

For models and explicit keys, see the [Cohere adapter](../adapters/cohere) and the [OpenRouter adapter](../adapters/openrouter).
