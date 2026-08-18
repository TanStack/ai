<div align="center">
  <img src="https://raw.githubusercontent.com/TanStack/ai/main/media/header_ai.png" alt="TanStack AI" />
</div>

<br />

<div align="center">
  <a href="https://npmjs.com/package/@tanstack/ai-cohere" target="_parent">
    <img alt="NPM downloads" src="https://img.shields.io/npm/dm/@tanstack/ai-cohere.svg" />
  </a>
  <a href="https://github.com/TanStack/ai" target="_parent">
    <img alt="GitHub stars" src="https://img.shields.io/github/stars/TanStack/ai.svg?style=social&label=Star" />
  </a>
</div>

# @tanstack/ai-cohere

Cohere adapter for [TanStack AI](https://tanstack.com/ai). It gives you two
things: multimodal embeddings with `embed-v4.0`, and document reranking with
Cohere's rerank models — the precision step for RAG and search pipelines.

For chat, summarization, or media, use OpenAI, Anthropic, or Gemini.

## Install

```bash
pnpm add @tanstack/ai @tanstack/ai-cohere
```

## Setup

Get your API key from the [Cohere Dashboard](https://dashboard.cohere.com/api-keys) and set it as an environment variable:

```bash
export COHERE_API_KEY="..."
```

## Usage

### Embedding Adapter

```typescript
import { cohereEmbedding } from '@tanstack/ai-cohere'
import { embed } from '@tanstack/ai'

const adapter = cohereEmbedding('embed-v4.0')

const result = await embed({
  adapter,
  input: ['a red guitar', 'a blue drum kit'],
  modelOptions: { inputType: 'search_document' },
})

console.log(result.embeddings[0].vector)
```

### Multimodal Inputs

embed-v4.0 embeds text, images, and fused text+image items (one vector per input item). Fuse parts by nesting them in an array — the outer array is the item list:

```typescript
const result = await embed({
  adapter,
  input: [
    'a red guitar',
    {
      type: 'image',
      source: { type: 'data', value: base64Png, mimeType: 'image/png' },
    },
    // A nested array fuses its parts into a single vector.
    [
      { type: 'text', content: 'product photo' },
      {
        type: 'image',
        source: { type: 'data', value: base64Jpeg, mimeType: 'image/jpeg' },
      },
    ],
  ],
  modelOptions: { inputType: 'search_document' },
})
```

Cohere does not fetch remote image URLs. Pass base64 data or a `data:` URI, or enable `allowUrlFetch` in the adapter config to have the adapter download http(s) URLs and inline them.

### Rerank Adapter

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
```

### With Explicit API Key

Both adapters read `COHERE_API_KEY` from the environment. To pass a key
explicitly, use the `create*` factories:

```typescript
import { createCohereEmbedding, createCohereRerank } from '@tanstack/ai-cohere'

const embedAdapter = createCohereEmbedding(
  'embed-v4.0',
  process.env.COHERE_API_KEY!,
)
const rerankAdapter = createCohereRerank('rerank-v3.5', 'co-...')
```

## Supported Models

### Embedding Models

- `embed-v4.0` - Multimodal embedding model (text + images, Matryoshka dimensions via the top-level `dimensions` option)

### Rerank Models

- `rerank-v3.5`
- `rerank-english-v3.0`
- `rerank-multilingual-v3.0`

## Features

- ✅ Embeddings (batch, one request per input array)
- ✅ Multimodal embedding input (text + images + fused text/image items)
- ✅ Dimension reduction (`dimensions` → Cohere `output_dimension`)
- ✅ Document reranking
- ❌ Chat / text generation
- ❌ Image generation

## Tree-Shakeable Adapters

This package uses tree-shakeable adapters, so you only import what you need:

```typescript
import { cohereEmbedding, cohereRerank } from '@tanstack/ai-cohere'
```

## <a href="https://tanstack.com/ai/latest/docs/adapters/cohere">Read the docs -></a>

- [Reranking Guide](https://tanstack.com/ai/latest/docs/rerank/rerank) — object
  documents, RAG pipelines, options, and the result shape.
- [Cohere Adapter](https://tanstack.com/ai/latest/docs/adapters/cohere) —
  models, configuration, and explicit API keys.

## License

MIT
