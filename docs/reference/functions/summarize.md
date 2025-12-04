---
id: summarize
title: summarize
---

# Function: summarize()

```ts
function summarize<TAdapter>(options): Promise<SummarizationResult>;
```

Defined in: [core/summarize.ts:16](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/core/summarize.ts#L16)

Standalone summarize function with type inference from adapter

## Type Parameters

### TAdapter

`TAdapter` *extends* [`AIAdapter`](../interfaces/AIAdapter.md)\<`any`, `any`, `any`, `any`, `any`, `Record`\<`string`, readonly [`Modality`](../type-aliases/Modality.md)[]\>, [`DefaultMessageMetadataByModality`](../interfaces/DefaultMessageMetadataByModality.md)\>

## Parameters

### options

`Omit`\<[`SummarizationOptions`](../interfaces/SummarizationOptions.md), `"model"`\> & `object`

## Returns

`Promise`\<[`SummarizationResult`](../interfaces/SummarizationResult.md)\>
