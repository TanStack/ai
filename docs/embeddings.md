---
title: Embeddings
id: embeddings
order: 1
description: "Generate text and multimodal embedding vectors with OpenAI, Cohere, Gemini, Mistral, Amazon Bedrock, and Ollama via TanStack AI's embed() API."
keywords:
  - tanstack ai
  - embeddings
  - embedding vectors
  - multimodal embeddings
  - semantic search
  - rag
  - embed
  - openai
  - cohere
  - gemini
  - mistral
  - bedrock
  - ollama
---

# Embeddings

TanStack AI provides embedding generation through dedicated embedding adapters that follow the same tree-shakeable, per-model-typed architecture as every other activity. The `embed()` function turns text — and, for multimodal models, images — into vectors for semantic search, RAG, clustering, and classification.

## Overview

Currently supported:

- **OpenAI**: text-embedding-3-small, text-embedding-3-large (text)
- **Cohere**: embed-v4.0 (text + image, fused multimodal)
- **Google Gemini**: gemini-embedding-001 (text)
- **Mistral**: mistral-embed, codestral-embed (text)
- **Amazon Bedrock**: Titan Text Embeddings V2 (text), Titan Multimodal Embeddings G1 (text + image), Cohere Embed v3 on Bedrock (text)
- **Ollama**: nomic-embed-text, mxbai-embed-large, and any local embedding model (text)

## Basic Usage

```typescript
import { embed } from "@tanstack/ai";
import { openaiEmbedding } from "@tanstack/ai-openai";

const result = await embed({
  adapter: openaiEmbedding("text-embedding-3-small"),
  input: "a red guitar",
});

console.log(result.embeddings[0]?.vector); // number[]
```

`input` accepts a single item or an array of items; the result always carries an `embeddings` array with one vector per input item, in input order:

```typescript
import { embed } from "@tanstack/ai";
import { openaiEmbedding } from "@tanstack/ai-openai";

const result = await embed({
  adapter: openaiEmbedding("text-embedding-3-large"),
  input: ["a red guitar", "a blue drum kit", "a vintage synthesizer"],
});

for (const embedding of result.embeddings) {
  console.log(embedding.index, embedding.vector.length);
}
```

## Requesting Dimensions

Models with configurable (Matryoshka) dimensions accept a top-level `dimensions` option:

```typescript
import { embed } from "@tanstack/ai";
import { openaiEmbedding } from "@tanstack/ai-openai";

const result = await embed({
  adapter: openaiEmbedding("text-embedding-3-large"),
  input: "a red guitar",
  dimensions: 1024,
});
```

Adapters for fixed-dimension models (for example `mistral-embed` or Ollama models) throw a clear runtime error when `dimensions` is set.

## Multimodal Embeddings

Multimodal models embed images — alone, or fused with text into a single vector. Image inputs reuse the same content-part shapes as chat messages, and the accepted item types are narrowed per model at compile time: passing an image to a text-only model is a type error.

Each item in the input array produces exactly one vector:

- a string or text part embeds that text
- an image part embeds that image
- a `{ type: "content" }` item fuses its text and image parts into one vector

```typescript
import { embed } from "@tanstack/ai";
import { cohereEmbedding } from "@tanstack/ai-cohere";

const productPhoto = "iVBORw0KGgo..."; // base64 image data

const result = await embed({
  adapter: cohereEmbedding("embed-v4.0"),
  input: [
    "a red guitar",
    {
      type: "image",
      source: {
        type: "data",
        value: productPhoto,
        mimeType: "image/png",
      },
    },
    {
      type: "content",
      content: [
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
    },
  ],
  modelOptions: { inputType: "search_document" },
});

console.log(result.embeddings.length); // 3 — one vector per input item
```

Amazon Titan Multimodal works the same way:

```typescript
import { embed } from "@tanstack/ai";
import { bedrockEmbedding } from "@tanstack/ai-bedrock";

const productPhoto = "iVBORw0KGgo..."; // base64 image data

const result = await embed({
  adapter: bedrockEmbedding("amazon.titan-embed-image-v1"),
  input: {
    type: "content",
    content: [
      { type: "text", content: "a red guitar" },
      {
        type: "image",
        source: {
          type: "data",
          value: productPhoto,
          mimeType: "image/png",
        },
      },
    ],
  },
  dimensions: 1024,
});
```

Adapters do not fetch remote image URLs by default — pass base64 data (or a `data:` URI). The Cohere adapter accepts an `allowUrlFetch` config option to opt into downloading `http(s)` image URLs on your behalf.

## Search Documents vs. Queries

Retrieval-tuned models embed documents and queries differently. Cohere requires an `inputType`, which TanStack AI enforces at the type level — `modelOptions` is required for models with required options:

```typescript
import { embed } from "@tanstack/ai";
import { cohereEmbedding } from "@tanstack/ai-cohere";

// Index time: embed documents
const docs = await embed({
  adapter: cohereEmbedding("embed-v4.0"),
  input: ["doc one", "doc two"],
  modelOptions: { inputType: "search_document" },
});

// Query time: embed the query
const query = await embed({
  adapter: cohereEmbedding("embed-v4.0"),
  input: "which doc mentions one?",
  modelOptions: { inputType: "search_query" },
});
```

Gemini expresses the same idea through an optional `taskType`:

```typescript
import { embed } from "@tanstack/ai";
import { geminiEmbedding } from "@tanstack/ai-gemini";

const result = await embed({
  adapter: geminiEmbedding("gemini-embedding-001"),
  input: "a red guitar",
  modelOptions: { taskType: "RETRIEVAL_DOCUMENT" },
});
```

## Usage and Observability

Adapters report token usage when the provider does, and `embed()` supports the same observe-only generation middleware as the media activities (see [Generation Hooks](./media/generation-hooks.md)):

```typescript
import { embed } from "@tanstack/ai";
import { openaiEmbedding } from "@tanstack/ai-openai";

const result = await embed({
  adapter: openaiEmbedding("text-embedding-3-small"),
  input: ["a red guitar", "a blue drum kit"],
  middleware: [
    {
      name: "usage-logger",
      onUsage: (ctx, usage) => {
        console.log(`${ctx.model}: ${usage.promptTokens} tokens`);
      },
    },
  ],
});

console.log(result.usage?.promptTokens);
```

## Provider Support Matrix

| Provider | Models | Modalities | `dimensions` | Usage reported |
| --- | --- | --- | --- | --- |
| OpenAI | text-embedding-3-small, text-embedding-3-large | text | ✅ | ✅ |
| Cohere | embed-v4.0 | text + image | ✅ | ✅ |
| Gemini | gemini-embedding-001 | text | ✅ | ❌ |
| Mistral | mistral-embed | text | ❌ | ✅ |
| Mistral | codestral-embed | text | ✅ | ✅ |
| Bedrock | amazon.titan-embed-text-v2:0 | text | ✅ (256/512/1024) | ✅ |
| Bedrock | amazon.titan-embed-image-v1 | text + image | ✅ (256/384/1024) | ✅ |
| Bedrock | cohere.embed-english-v3, cohere.embed-multilingual-v3 | text | ❌ | ❌ |
| Ollama | nomic-embed-text, mxbai-embed-large, … | text | ❌ | ✅ |

Notes:

- Bedrock Titan models have no batch API — a batch of N items runs as N requests under a small concurrency cap.
- Gemini's Vertex-only multimodal embedding model (`multimodalembedding@001`) is not supported; `@tanstack/ai-gemini` targets the Gemini API.

## Error Handling

`embed()` rejects with the provider error; middleware `onError` hooks run before the rejection propagates:

```typescript
import { embed } from "@tanstack/ai";
import { openaiEmbedding } from "@tanstack/ai-openai";

try {
  await embed({
    adapter: openaiEmbedding("text-embedding-3-small"),
    input: "a red guitar",
  });
} catch (error) {
  console.error("embedding failed", error);
}
```
