---
id: embed
title: embed
---

# Function: embed()

```ts
function embed<TAdapter>(options): Promise<EmbeddingResult>;
```

Defined in: [packages/ai/src/activities/embed/index.ts:189](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/embed/index.ts#L189)

Embed activity - generates embedding vectors from text and image inputs.

Accepts a single item or an array of items; the result always carries an
`embeddings` array with one vector per input item, in input order.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`EmbeddingAdapter`](../interfaces/EmbeddingAdapter.md)\<`string`, `any`, `any`, `any`\>

## Parameters

### options

`EmbedOptions`\<`TAdapter`\>

## Returns

`Promise`\<[`EmbeddingResult`](../interfaces/EmbeddingResult.md)\>

## Examples

**Embed a single text**

```ts
import { embed } from '@tanstack/ai'
import { openaiEmbedding } from '@tanstack/ai-openai'

const result = await embed({
  adapter: openaiEmbedding('text-embedding-3-small'),
  input: 'a red guitar',
})

console.log(result.embeddings[0].vector)
```

**Batch with requested dimensions**

```ts
const result = await embed({
  adapter: openaiEmbedding('text-embedding-3-large'),
  input: ['a red guitar', 'a blue drum kit'],
  dimensions: 1024,
})
```

**Multimodal embedding (text + image fused into one vector)**

```ts
import { cohereEmbedding } from '@tanstack/ai-cohere'

// A nested array of parts fuses them into a single vector. The outer array
// is the item list, so this embeds one fused item into one vector.
const result = await embed({
  adapter: cohereEmbedding('embed-v4.0'),
  input: [
    [
      { type: 'text', content: 'product photo' },
      { type: 'image', source: { type: 'data', value: base64, mimeType: 'image/png' } },
    ],
  ],
  modelOptions: { inputType: 'search_document' },
})
```
