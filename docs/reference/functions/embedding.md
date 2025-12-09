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

`TAdapter` *extends* [`AIAdapter`](../interfaces/AIAdapter.md)\<`any`, `any`, `any`, `any`, `any`, `Record`\<`string`, readonly [`Modality`](../type-aliases/Modality.md)[]\>, [`DefaultMessageMetadataByModality`](../interfaces/DefaultMessageMetadataByModality.md)\>

## Parameters

### options

`Omit`\<[`EmbeddingOptions`](../interfaces/EmbeddingOptions.md), `"model"`\> & `object`

## Returns

`Promise`\<[`EmbeddingResult`](../interfaces/EmbeddingResult.md)\>
