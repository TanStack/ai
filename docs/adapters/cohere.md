---
title: Cohere
id: cohere-adapter
order: 18
description: "Use Cohere's embed-v4.0 multimodal embedding model with TanStack AI via @tanstack/ai-cohere — text and image embeddings for semantic search and RAG."
keywords:
  - tanstack ai
  - cohere
  - embed-v4
  - embeddings
  - multimodal embeddings
  - semantic search
  - adapter
---

The Cohere adapter provides access to Cohere's embed-v4.0 multimodal embedding model — text, images, and fused text+image inputs, each producing a single vector.

## Installation

```bash
npm install @tanstack/ai-cohere
```

## Basic Usage

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

`inputType` is required by Cohere's API — use `search_document` at index time and `search_query` at query time (or `classification` / `clustering` for those workloads). TanStack AI enforces this at the type level: `modelOptions` is required for Cohere embedding calls.

## Basic Usage - Custom API Key

```typescript
import { embed } from "@tanstack/ai";
import { createCohereEmbedding } from "@tanstack/ai-cohere";

const adapter = createCohereEmbedding("embed-v4.0", process.env.MY_COHERE_KEY!);

const result = await embed({
  adapter,
  input: "a red guitar",
  modelOptions: { inputType: "search_query" },
});
```

## Multimodal Embeddings

embed-v4.0 embeds images alongside text. An image part produces an image vector; a nested array of parts (`[textPart, imagePart]`) fuses text and image into one vector — ideal for product catalogs and screenshot search. The outer array is the item list, so nest to fuse:

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

## Requesting Dimensions

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

## Environment Variables

Set your API key in environment variables:

```bash
COHERE_API_KEY=...
```

Get a key from the [Cohere dashboard](https://dashboard.cohere.com/api-keys).

## API Reference

### `cohereEmbedding(model, config?)`

Creates an embedding adapter using `COHERE_API_KEY` from the environment.

- `model`: `"embed-v4.0"`
- `config.baseUrl`: override the API base URL (default `https://api.cohere.com`)
- `config.headers`: extra request headers
- `config.allowUrlFetch`: download `http(s)` image URLs and inline them as base64 (default `false`)

### `createCohereEmbedding(model, apiKey, config?)`

Same as `cohereEmbedding` with an explicit API key.

## Next Steps

- [Embeddings guide](../embeddings.md) — the full `embed()` API
- [Generation Hooks](../media/generation-hooks.md) — usage and lifecycle middleware
