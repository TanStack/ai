# @tanstack/ai-cohere

Cohere adapter for TanStack AI.

## Installation

```bash
npm install @tanstack/ai-cohere
# or
pnpm add @tanstack/ai-cohere
# or
yarn add @tanstack/ai-cohere
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

embed-v4.0 embeds text, images, and fused text+image items (one vector per input item):

```typescript
const result = await embed({
  adapter,
  input: [
    'a red guitar',
    {
      type: 'image',
      source: { type: 'data', value: base64Png, mimeType: 'image/png' },
    },
    {
      type: 'content',
      content: [
        { type: 'text', content: 'product photo' },
        {
          type: 'image',
          source: { type: 'data', value: base64Jpeg, mimeType: 'image/jpeg' },
        },
      ],
    },
  ],
  modelOptions: { inputType: 'search_document' },
})
```

Cohere does not fetch remote image URLs. Pass base64 data or a `data:` URI, or enable `allowUrlFetch` in the adapter config to have the adapter download http(s) URLs and inline them.

### With Explicit API Key

```typescript
import { createCohereEmbedding } from '@tanstack/ai-cohere'

const adapter = createCohereEmbedding('embed-v4.0', process.env.COHERE_API_KEY!)
```

## Supported Models

### Embedding Models

- `embed-v4.0` - Multimodal embedding model (text + images, Matryoshka dimensions via the top-level `dimensions` option)

## Features

- ✅ Embeddings (batch, one request per input array)
- ✅ Multimodal embedding input (text + images + fused text/image items)
- ✅ Dimension reduction (`dimensions` → Cohere `output_dimension`)
- ❌ Chat / text generation
- ❌ Image generation

## Tree-Shakeable Adapters

This package uses tree-shakeable adapters, so you only import what you need:

```typescript
import { cohereEmbedding } from '@tanstack/ai-cohere'
```

## License

MIT
