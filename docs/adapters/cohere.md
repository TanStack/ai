---
title: Cohere
id: cohere-adapter
order: 11
description: "Use Cohere with TanStack AI via @tanstack/ai-cohere: embed-v4.0 multimodal embeddings for semantic search and RAG, plus rerank models for relevance."
keywords:
  - tanstack ai
  - cohere
  - embed-v4
  - embeddings
  - multimodal embeddings
  - semantic search
  - rerank
  - reranking
  - retrieval
  - adapter
---

The Cohere adapter covers the two retrieval steps of a RAG pipeline:

- **Embeddings** (`cohereEmbedding`): turn text, images, and fused text+image inputs into vectors with `embed()`.
- **Reranking** (`cohereRerank`): reorder candidate documents by relevance to a query with `rerank()`.

It does not support `chat()`, `summarize()`, or media generation. Use OpenAI, Anthropic, or Gemini for those. The adapter talks to Cohere's HTTP API directly over `fetch`, with no SDK dependency.

## Installation

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

## Embeddings

```typescript
import { embed } from "@tanstack/ai";
import { cohereEmbedding } from "@tanstack/ai-cohere";

const result = await embed({
  adapter: cohereEmbedding("embed-v4.0"),
  input: ["a red guitar", "a blue drum kit"],
  modelOptions: { inputType: "search_document" },
});

console.log(result.embeddings[0]?.vector);
console.log(result.usage?.promptTokens);
```

`inputType` is required by Cohere's API. Use `search_document` at index time and `search_query` at query time (or `classification` / `clustering` for those workloads). TanStack AI enforces this at the type level, so `modelOptions` is required for Cohere embedding calls.

### Multimodal Embeddings

embed-v4.0 embeds images alongside text. An image part produces an image vector. A nested array of parts (`[textPart, imagePart]`) fuses text and image into one vector, which suits product catalogs and screenshot search. The outer array is the item list, so nest to fuse:

```typescript
import { embed } from "@tanstack/ai";
import { cohereEmbedding } from "@tanstack/ai-cohere";

const productPhoto = "iVBORw0KGgo..."; // base64 image data

const result = await embed({
  adapter: cohereEmbedding("embed-v4.0"),
  input: [
    {
      type: "image",
      source: {
        type: "data",
        value: productPhoto,
        mimeType: "image/png",
      },
    },
    // A nested array fuses its parts into a single vector.
    [
      { type: "text", content: "Fender Stratocaster, sunburst finish" },
      {
        type: "image",
        source: {
          type: "data",
          value: productPhoto,
          mimeType: "image/png",
        },
      },
    ],
  ],
  modelOptions: { inputType: "search_document" },
});

console.log(result.embeddings.length); // 2
```

Cohere's API does not fetch remote image URLs. Pass base64 data (or a `data:` URI), or opt into adapter-side downloading:

```typescript
import { embed } from "@tanstack/ai";
import { cohereEmbedding } from "@tanstack/ai-cohere";

const adapter = cohereEmbedding("embed-v4.0", { allowUrlFetch: true });

const result = await embed({
  adapter,
  input: {
    type: "image",
    source: { type: "url", value: "https://example.com/guitar.png" },
  },
  modelOptions: { inputType: "search_document" },
});
```

### Requesting Dimensions

embed-v4.0 supports Matryoshka output dimensions via the top-level `dimensions` option:

```typescript
import { embed } from "@tanstack/ai";
import { cohereEmbedding } from "@tanstack/ai-cohere";

const result = await embed({
  adapter: cohereEmbedding("embed-v4.0"),
  input: "a red guitar",
  dimensions: 1024, // 256 | 512 | 1024 | 1536
  modelOptions: { inputType: "search_document" },
});
```

## Reranking

```typescript
import { rerank } from "@tanstack/ai";
import { cohereRerank } from "@tanstack/ai-cohere";

const { rerankedDocuments } = await rerank({
  adapter: cohereRerank("rerank-v3.5"),
  query: "talk about rain",
  documents: ["sunny day at the beach", "rainy afternoon in the city"],
});

console.log(rerankedDocuments[0]); // 'rainy afternoon in the city'
```

For the full reranking guide, with object documents, RAG pipelines, options, and the result shape, see [Reranking](../rerank/rerank).

Per-request rerank options go on `modelOptions`:

```typescript
import { rerank } from "@tanstack/ai";
import { cohereRerank } from "@tanstack/ai-cohere";

const { ranking } = await rerank({
  adapter: cohereRerank("rerank-v3.5"),
  query: "refund policy",
  documents: ["Returns accepted within 30 days.", "Free shipping over $50."],
  modelOptions: {
    maxTokensPerDoc: 512, // Cap tokens kept per document (Cohere default: 4096)
  },
});

console.log(ranking);
```

## Models

| Model                      | Capability | Description                                                       |
| -------------------------- | ---------- | ----------------------------------------------------------------- |
| `embed-v4.0`               | Embeddings | Multimodal (text + images), Matryoshka `dimensions` support        |
| `rerank-v3.5`              | Reranking  | Latest multilingual reranker (recommended)                         |
| `rerank-english-v3.0`      | Reranking  | English-optimized reranker                                         |
| `rerank-multilingual-v3.0` | Reranking  | Multilingual reranker                                              |

## Environment Variables

Both adapters read your API key from the environment:

```bash
COHERE_API_KEY=your-cohere-api-key
```

| Variable         | Required | Description         |
| ---------------- | -------- | ------------------- |
| `COHERE_API_KEY` | Yes      | Your Cohere API key |

Get a key from the [Cohere dashboard](https://dashboard.cohere.com/api-keys).

## Explicit API Keys

To pass a key directly instead of reading the environment, use the `create*` factories:

```typescript
import {
  createCohereEmbedding,
  createCohereRerank,
} from "@tanstack/ai-cohere";

const embedAdapter = createCohereEmbedding(
  "embed-v4.0",
  process.env.MY_COHERE_KEY!,
);
const rerankAdapter = createCohereRerank("rerank-v3.5", "your-cohere-api-key");
```

## API Reference

### `cohereEmbedding(model, config?)`

Creates an embedding adapter using `COHERE_API_KEY` from the environment.

- `model`: `"embed-v4.0"`
- `config.baseUrl`: override the API base URL (default `https://api.cohere.com`)
- `config.headers`: extra request headers
- `config.allowUrlFetch`: download `http(s)` image URLs and inline them as base64 (default `false`)

### `createCohereEmbedding(model, apiKey, config?)`

Same as `cohereEmbedding` with an explicit API key.

### `cohereRerank(model, config?)`

Creates a rerank adapter using `COHERE_API_KEY` from the environment.

- `model`: one of the rerank models above
- `config.baseUrl`: override the API base URL (default `https://api.cohere.com`)
- `config.headers`: extra request headers

### `createCohereRerank(model, apiKey, config?)`

Same as `cohereRerank` with an explicit API key.

## Next Steps

- [Embeddings guide](../embeddings.md): the full `embed()` API
- [Reranking guide](../rerank/rerank): full walkthrough including RAG pipelines
- [Generation Hooks](../media/generation-hooks.md): usage and lifecycle middleware
