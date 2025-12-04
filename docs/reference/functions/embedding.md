---
id: embedding
title: embedding
---

# Function: embedding()

```ts
function embedding<TAdapter>(options): Promise<EmbeddingResult>;
```

Defined in: [core/embedding.ts:16](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/core/embedding.ts#L16)

Standalone embedding function with type inference from adapter

## Type Parameters

### TAdapter

`TAdapter` *extends* [`AIAdapter`](../../interfaces/AIAdapter)\<`any`, `any`, `any`, `any`, `any`, `Record`\<`string`, readonly [`Modality`](../../type-aliases/Modality)[]\>, [`DefaultMessageMetadataByModality`](../../interfaces/DefaultMessageMetadataByModality)\>

## Parameters

### options

`Omit`\<[`EmbeddingOptions`](../../interfaces/EmbeddingOptions), `"model"`\> & `object`

## Returns

`Promise`\<[`EmbeddingResult`](../../interfaces/EmbeddingResult)\>
