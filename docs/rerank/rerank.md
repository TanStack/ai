---
title: Reranking
id: rerank
order: 1
description: "Reorder candidate documents by relevance to a query with TanStack AI's rerank() API and the Cohere adapter — the precision step for RAG and search."
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

# Reranking

You have a query and a list of candidate documents — chunks from a vector
search, rows from a keyword query, FAQ entries — and you need them ordered by
how well they actually answer the query. Vector similarity gets you close, but
a dedicated reranking model is far more precise. By the end of this guide
you'll have that list reordered, with a relevance score per document.

`rerank()` is the precision step in a retrieval pipeline: retrieve a broad set
of candidates cheaply, then rerank to surface the few that matter.

## Providers

Reranking is available from two adapters today:

- **Cohere** (`@tanstack/ai-cohere`) — `cohereRerank('rerank-v3.5')`, talking to Cohere directly.
- **OpenRouter** (`@tanstack/ai-openrouter`) — `openRouterRerank('cohere/rerank-v3.5')`, routing rerank through your existing OpenRouter key.

Both implement the same `rerank()` activity — swap the adapter, keep the call.

## Installation

```bash
npm install @tanstack/ai-cohere
# or, to rerank through OpenRouter:
npm install @tanstack/ai-openrouter
```

Peer dependency:

```bash
npm install @tanstack/ai
```

## Basic Usage

Pass a `query` and an array of `documents`. The result's `rerankedDocuments`
are ordered most-relevant first, and `ranking` carries the relevance score and
the original index of each.

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

The adapter reads `COHERE_API_KEY` from the environment. To pass a key
explicitly, use `createCohereRerank('rerank-v3.5', 'co-...')`.

To rerank through OpenRouter instead, swap the adapter — everything else stays
the same:

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

## Reranking Object Documents

Documents don't have to be strings. Pass JSON-serializable objects and the
original object is returned in the result — fully typed — so you can carry an
id or metadata through the rerank and read it back off the ranked results.

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

// `document` is the original object — `id` is available and type-safe.
console.log(ranking[0]?.document.id) // 'doc-2'
```

Object documents are serialized to JSON before being sent to the provider; the
ranking is mapped back to your original elements by index.

## Options

| Option        | Type                          | Description                                                              |
| ------------- | ----------------------------- | ------------------------------------------------------------------------ |
| `adapter`     | `RerankAdapter`               | A rerank adapter created with a model (e.g. `cohereRerank('rerank-v3.5')`) |
| `query`       | `string`                      | The search query documents are scored against — required                |
| `documents`   | `Array<string \| object>`     | Candidate documents to rerank — required                                 |
| `topN`        | `number`                      | Return only the top N results                                            |
| `abortSignal` | `AbortSignal`                 | Cancel the in-flight request                                             |
| `modelOptions`| provider options              | Provider-specific options (see below)                                    |
| `middleware`  | `Array<GenerationMiddleware>` | Observe-only lifecycle hooks (usage, finish, error, abort)               |

### Provider Options

Cohere rerank accepts:

```typescript
import { rerank } from '@tanstack/ai'
import { cohereRerank } from '@tanstack/ai-cohere'

const { ranking } = await rerank({
  adapter: cohereRerank('rerank-v3.5'),
  query: 'refund policy',
  documents: ['Returns accepted within 30 days.', 'Free shipping over $50.'],
  modelOptions: {
    // Cap tokens kept per document when chunking long inputs (Cohere default: 4096).
    maxTokensPerDoc: 512,
  },
})

console.log(ranking)
```

## Result Shape

```typescript
import type { TokenUsage } from '@tanstack/ai'

interface RerankResult<TDocument = string> {
  id: string
  model: string
  // Scored results, most relevant first.
  ranking: Array<{ index: number; score: number; document: TDocument }>
  // The documents reordered by relevance (ranking.map(r => r.document)).
  rerankedDocuments: Array<TDocument>
  // Rerank typically bills in provider "search units" (usage.unitsBilled).
  // Some providers (e.g. OpenRouter) also report totalTokens and cost; Cohere
  // reports only search units and leaves token counts at 0.
  usage: TokenUsage
}
```

## Server Endpoint

Reranking runs on the server (it needs your API key). Wrap it in an API route
and call it from the client over `fetch`:

```typescript ignore
// routes/api/rerank.ts
import { rerank } from '@tanstack/ai'
import { cohereRerank } from '@tanstack/ai-cohere'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/rerank')({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
        const { query, documents } = body
        const topN = 'topN' in body && typeof body.topN === 'number'
          ? body.topN
          : undefined

        const result = await rerank({
          adapter: cohereRerank('rerank-v3.5'),
          query,
          documents,
          topN,
        })

        return Response.json(result)
      },
    },
  },
})
```

```typescript ignore
// client.ts — call the endpoint and use the reordered documents
async function rerankDocuments(query: string, documents: Array<string>) {
  const res = await fetch('/api/rerank', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, documents, topN: 3 }),
  })
  const result = await res.json()
  return result.rerankedDocuments
}
```

## In a RAG Pipeline

Reranking shines as the second stage after a cheap, broad retrieval. Over-fetch
candidates with vector search, then rerank to keep only the most relevant few
for the prompt:

```typescript ignore
import { rerank } from '@tanstack/ai'
import { cohereRerank } from '@tanstack/ai-cohere'
import { vectorSearch } from './my-vector-store'

async function retrieveContext(query: string) {
  // 1. Over-fetch candidates cheaply.
  const candidates = await vectorSearch(query, { limit: 50 })

  // 2. Rerank and keep the most relevant handful for the prompt.
  const { rerankedDocuments } = await rerank({
    adapter: cohereRerank('rerank-v3.5'),
    query,
    documents: candidates.map((c) => c.text),
    topN: 5,
  })

  return rerankedDocuments
}
```

## Cancellation

Pass an `abortSignal` to cancel an in-flight request:

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

## Observability

Attach observe-only middleware to track usage, completion, errors, and
cancellation — the same `GenerationMiddleware` contract the media activities
use:

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
        console.log('search units billed:', usage.unitsBilled)
      },
    },
  ],
})

console.log(result.rerankedDocuments)
```

> **Tip:** Pass `otelMiddleware()` to emit OpenTelemetry spans for rerank
> calls. See [OpenTelemetry](../advanced/otel).

## Environment Variables

The Cohere rerank adapter uses:

- `COHERE_API_KEY`: Your Cohere API key

## Error Handling

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

> Passing an empty `documents` array throws before any request is made.

## Next Steps

- [Cohere Adapter](../adapters/cohere) — models, configuration, and explicit API keys
- [OpenRouter Adapter](../adapters/openrouter) — rerank through your OpenRouter key
- [Middleware](../advanced/middleware) — lifecycle hooks for usage and errors
