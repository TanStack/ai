---
title: Embeddings
id: embeddings
order: 1
description: "Turn text and images into vectors with embed(). Use them for semantic search, RAG, and clustering with OpenAI, Cohere, Gemini, Mistral, Amazon Bedrock, Ollama, or Vercel AI Gateway."
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
  - vercel ai gateway
---

`embed()` turns text into a vector. Search, RAG, and clustering then compare those vectors.

Multimodal models also embed images.

## Quick setup

1. Install the core package and an adapter:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-openai
vue: @tanstack/ai @tanstack/ai-openai
solid: @tanstack/ai @tanstack/ai-openai
svelte: @tanstack/ai @tanstack/ai-openai
preact: @tanstack/ai @tanstack/ai-openai
angular: @tanstack/ai @tanstack/ai-openai
vanilla: @tanstack/ai @tanstack/ai-openai
octane: @tanstack/ai @tanstack/ai-openai

<!-- ::end:tabs -->

2. Put your key on the server. The adapter reads it at runtime:

```bash
OPENAI_API_KEY=your-openai-api-key
```

3. Call `embed()` on the server:

```typescript
import { embed } from "@tanstack/ai";
import { openaiEmbedding } from "@tanstack/ai-openai";

const result = await embed({
  adapter: openaiEmbedding("text-embedding-3-small"),
  input: ["a red guitar", "a blue drum kit", "a vintage synthesizer"],
});

for (const embedding of result.embeddings) {
  console.log(embedding.index, embedding.vector.length);
}
```

You now have one `number[]` vector per input string. Store them in your vector database.

## How it works

- `input` is one item or an array of items.
- Each item gives exactly one vector.
- `result.embeddings` keeps the input order. Each entry has an `index` and a `vector`.
- Every provider uses the same `embed()` call. To change provider, change the adapter.

## Providers

| Provider          | Adapter                                   | Models                                                                                                  | Input        |
| ----------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------ |
| OpenAI            | `openaiEmbedding` (`@tanstack/ai-openai`) | `text-embedding-3-small`, `text-embedding-3-large`                                                      | text         |
| Cohere            | `cohereEmbedding` (`@tanstack/ai-cohere`) | `embed-v4.0`                                                                                            | text + image |
| Google Gemini     | `geminiEmbedding` (`@tanstack/ai-gemini`) | `gemini-embedding-001`                                                                                  | text         |
| Mistral           | `mistralEmbedding` (`@tanstack/ai-mistral`) | `mistral-embed`, `codestral-embed`                                                                    | text         |
| Amazon Bedrock    | `bedrockEmbedding` (`@tanstack/ai-bedrock`) | Titan Text Embeddings V2 (text), Titan Multimodal Embeddings G1 (text + image), Cohere Embed v3 (text) | text, or text + image |
| Ollama            | `ollamaEmbedding` (`@tanstack/ai-ollama`) | `nomic-embed-text`, `mxbai-embed-large`, and any local embedding model                                  | text         |
| Vercel AI Gateway | `vercelGatewayEmbedding` (`@tanstack/ai-vercel-gateway`) | OpenAI-compatible models such as `openai/text-embedding-3-small`                         | text         |

Vercel AI Gateway takes a `creator/model` id:

```typescript
import { embed } from "@tanstack/ai";
import { vercelGatewayEmbedding } from "@tanstack/ai-vercel-gateway";

const result = await embed({
  adapter: vercelGatewayEmbedding("openai/text-embedding-3-small"),
  input: "a red guitar",
});
```

## Pick the vector size

Some models (Matryoshka models) let you choose the number of dimensions. Pass `dimensions`:

```typescript
import { embed } from "@tanstack/ai";
import { openaiEmbedding } from "@tanstack/ai-openai";

const result = await embed({
  adapter: openaiEmbedding("text-embedding-3-large"),
  input: "a red guitar",
  dimensions: 1024,
});
```

Fixed-size models (for example `mistral-embed` or Ollama models) throw a runtime error when you set `dimensions`.

## Embed documents and queries differently

Retrieval models give better results when they know if the text is a document or a query.

Cohere requires an `inputType`. The types make `modelOptions` required for this model:

```typescript
import { embed } from "@tanstack/ai";
import { cohereEmbedding } from "@tanstack/ai-cohere";

// Index time: embed the documents
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

Gemini has an optional `taskType` for the same purpose:

```typescript
import { embed } from "@tanstack/ai";
import { geminiEmbedding } from "@tanstack/ai-gemini";

const result = await embed({
  adapter: geminiEmbedding("gemini-embedding-001"),
  input: "a red guitar",
  modelOptions: { taskType: "RETRIEVAL_DOCUMENT" },
});
```

## Embed images

Multimodal models embed images, or an image and text together as one vector. Image items use the same content-part shape as chat messages.

The types narrow the accepted items per model. An image sent to a text-only model is a type error.

Each item in the top-level `input` array gives one vector:

- A string or a text part embeds that text.
- An image part embeds that image.
- A nested array of parts (`[textPart, imagePart]`) fuses the parts into one vector.

So `[textPart, imagePart]` gives two vectors, and `[[textPart, imagePart]]` gives one fused vector.

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
    // A nested array fuses its parts into one vector.
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

console.log(result.embeddings.length); // 3, one vector per input item
```

Amazon Titan Multimodal works the same way. Nest the parts to fuse them:

```typescript
import { embed } from "@tanstack/ai";
import { bedrockEmbedding } from "@tanstack/ai-bedrock";

const productPhoto = "iVBORw0KGgo..."; // base64 image data

const result = await embed({
  adapter: bedrockEmbedding("amazon.titan-embed-image-v1"),
  input: [
    [
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
  ],
  dimensions: 1024,
});
```

Pass images as base64 data or as a `data:` URI. Adapters do not download remote image URLs by default.

Need to rank the results after a vector search? See [Reranking](./rerank/rerank).

## Advanced

### Remote image URLs

The Cohere adapter has an `allowUrlFetch` config option. When you turn it on, the adapter downloads `http(s)` image URLs for you.

### Token usage and middleware

Adapters report token usage when the provider does. `embed()` accepts the same observe-only generation middleware as the media activities. See [Generation Hooks](./media/generation-hooks.md).

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

### Errors

`embed()` rejects with the provider error. Middleware `onError` hooks run before the rejection reaches your code.

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
