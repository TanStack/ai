---
title: Cohere
id: cohere-adapter
order: 11
description: "Rerank documents by relevance to a query with Cohere's rerank models in TanStack AI via the @tanstack/ai-cohere adapter."
keywords:
  - tanstack ai
  - cohere
  - rerank
  - reranking
  - relevance
  - retrieval
  - adapter
---

The Cohere adapter is **rerank-focused**. It exposes one capability:

- **Reranking** (`cohereRerank`) — reorder documents by relevance to a query via `rerank()`.

It does not support text `chat()`, `summarize()`, embeddings, or media — use
OpenAI, Anthropic, or Gemini for those. The adapter talks to Cohere's
`/v2/rerank` endpoint directly over `fetch` (no SDK dependency).

## Installation

```bash
npm install @tanstack/ai-cohere
```

Peer dependency:

```bash
npm install @tanstack/ai
```

## Basic Usage

```typescript
import { rerank } from '@tanstack/ai'
import { cohereRerank } from '@tanstack/ai-cohere'

const { rerankedDocuments } = await rerank({
  adapter: cohereRerank('rerank-v3.5'),
  query: 'talk about rain',
  documents: ['sunny day at the beach', 'rainy afternoon in the city'],
})

console.log(rerankedDocuments[0]) // 'rainy afternoon in the city'
```

For the full reranking guide — object documents, RAG pipelines, options, and
the result shape — see [Reranking](../rerank/rerank).

## Models

| Model                      | Description                              |
| -------------------------- | ---------------------------------------- |
| `rerank-v3.5`              | Latest multilingual reranker (recommended) |
| `rerank-english-v3.0`      | English-optimized reranker               |
| `rerank-multilingual-v3.0` | Multilingual reranker                    |

## Configuration

`cohereRerank(model, config?)` reads `COHERE_API_KEY` from the environment.
`config` accepts:

| Option    | Type                       | Default                    | Description                          |
| --------- | -------------------------- | -------------------------- | ------------------------------------ |
| `baseUrl` | `string`                   | `https://api.cohere.com`   | Override the API base URL            |
| `headers` | `Record<string, string>`  | —                          | Extra headers merged into requests   |

### Provider Options

Per-request options are passed via `modelOptions` on `rerank()`:

```typescript
import { rerank } from '@tanstack/ai'
import { cohereRerank } from '@tanstack/ai-cohere'

const { ranking } = await rerank({
  adapter: cohereRerank('rerank-v3.5'),
  query: 'refund policy',
  documents: ['Returns accepted within 30 days.', 'Free shipping over $50.'],
  modelOptions: {
    maxTokensPerDoc: 512, // Cap tokens kept per document (Cohere default: 4096)
  },
})

console.log(ranking)
```

## Explicit API Keys

To pass an API key directly instead of reading the environment:

```typescript
import { createCohereRerank } from '@tanstack/ai-cohere'

const adapter = createCohereRerank('rerank-v3.5', 'your-cohere-api-key')
```

## Environment Variables

```bash
COHERE_API_KEY=your-cohere-api-key
```

| Variable         | Required | Description         |
| ---------------- | -------- | ------------------- |
| `COHERE_API_KEY` | Yes      | Your Cohere API key |

Get your API key from the [Cohere dashboard](https://dashboard.cohere.com/).

## API Reference

### `cohereRerank(model, config?)`

Creates a Cohere rerank adapter for use with `rerank()`, reading
`COHERE_API_KEY` from the environment.

### `createCohereRerank(model, apiKey, config?)`

Same as `cohereRerank`, but takes an explicit API key.

## Limitations

- **Rerank only** — Use OpenAI, Anthropic, or Gemini for `chat()`, `summarize()`, embeddings, or media generation.

## Next Steps

- [Reranking Guide](../rerank/rerank) — full walkthrough including RAG pipelines
- [OpenAI Adapter](./openai) — text, embeddings, and media
