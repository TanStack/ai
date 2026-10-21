---
title: Cohere
id: cohere-adapter
order: 11
description: "Use Cohere in TanStack AI with @tanstack/ai-cohere: embed-v4.0 multimodal embeddings for semantic search and RAG, and rerank models to sort results by relevance."
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

Cohere gives you the two retrieval steps of a RAG pipeline: embeddings that turn text and images into vectors, and reranking that sorts documents by relevance to a query.

Cohere has no `chat()`, `summarize()`, or media generation in this package. For those, use [OpenAI](./openai), [Anthropic](./anthropic), or [Gemini](./gemini). The adapter calls the HTTP API of Cohere with `fetch`, with no SDK dependency.

## 1. Install

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

## 2. Set the API key

Get a key from the [Cohere dashboard](https://dashboard.cohere.com/api-keys). Put it in the environment of your server:

```bash
COHERE_API_KEY=your-cohere-api-key
```

`cohereEmbedding` and `cohereRerank` read `COHERE_API_KEY`. To pass the key in code, see [Explicit API keys](#explicit-api-keys).

## 3. Embed documents

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

The Cohere API requires `inputType`, and the types require `modelOptions` on every Cohere embedding call:

- `search_document`: when you index documents.
- `search_query`: when you embed the search query.
- `classification` or `clustering`: for those workloads.

## 4. Rerank results

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

You now have both retrieval steps. For object documents, RAG pipelines, the options, and the result shape, see [Reranking](../rerank/rerank).

## Multimodal embeddings

embed-v4.0 embeds images next to text:

- An image part gives an image vector.
- A nested array of parts (`[textPart, imagePart]`) joins text and image into one vector. Use it for product catalogs and screenshot search.

The outer array is the list of items, so nest the parts to join them:

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

The Cohere API does not fetch remote image URLs. Pass base64 data (or a `data:` URI), or turn on [downloads in the adapter](#image-urls).

## Shorter vectors

embed-v4.0 takes the top-level `dimensions` option (`256`, `512`, `1024`, or `1536`):

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

## Rerank options

Rerank options for one request go in `modelOptions`:

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

| Model | Activity | Notes |
| --- | --- | --- |
| `embed-v4.0` | Embeddings | Text and images, `dimensions` support |
| `rerank-v3.5` | Reranking | Newest multilingual reranker. Recommended |
| `rerank-english-v3.0` | Reranking | Tuned for English |
| `rerank-multilingual-v3.0` | Reranking | Multilingual reranker |

## Advanced

### Explicit API keys

To pass a key in code, not from the environment, use the `create*` factories:

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

### Image URLs

To let the adapter download `http(s)` image URLs and send them as base64, set `allowUrlFetch`:

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

### Behind a proxy

Send every request through a gateway, such as Cloudflare AI Gateway or a corporate proxy, with `baseURL` and `defaultHeaders`. These two option names are the same on every TanStack AI adapter, so one gateway config works for all of them.

```typescript
import { createCohereEmbedding } from "@tanstack/ai-cohere";

const adapter = createCohereEmbedding("embed-v4.0", process.env.COHERE_API_KEY!, {
  baseURL: "https://gateway.example.com/cohere",
  defaultHeaders: { "cf-aig-authorization": `Bearer ${process.env.GATEWAY_TOKEN}` },
});
```

`baseUrl` and `headers` are aliases of the same two options. If you set both forms, `baseURL` and `defaultHeaders` win.

### API reference

| Factory | Creates |
| --- | --- |
| `cohereEmbedding(model, config?)` | Embedding adapter. Reads `COHERE_API_KEY` |
| `createCohereEmbedding(model, apiKey, config?)` | Embedding adapter with an explicit API key |
| `cohereRerank(model, config?)` | Rerank adapter. Reads `COHERE_API_KEY` |
| `createCohereRerank(model, apiKey, config?)` | Rerank adapter with an explicit API key |

Config for both adapters:

- `config.baseURL`: the API base URL (default `https://api.cohere.com`). `baseUrl` is an alias.
- `config.defaultHeaders`: extra request headers. `headers` is an alias.
- `config.allowUrlFetch` (embeddings only): download `http(s)` image URLs and send them as base64. Default `false`.

For the full APIs, see the [Embeddings guide](../embeddings.md), the [Reranking guide](../rerank/rerank), and [Generation Hooks](../media/generation-hooks.md) for usage and lifecycle middleware.
