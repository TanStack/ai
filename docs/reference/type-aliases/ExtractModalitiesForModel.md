---
id: ExtractModalitiesForModel
title: ExtractModalitiesForModel
---

# Type Alias: ExtractModalitiesForModel\<TAdapter, TModel\>

```ts
type ExtractModalitiesForModel<TAdapter, TModel> = TAdapter extends AIAdapter<any, any, any, any, any, infer ModelInputModalities> ? TModel extends keyof ModelInputModalities ? ModelInputModalities[TModel] : ReadonlyArray<Modality> : ReadonlyArray<Modality>;
```

Defined in: [types.ts:852](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L852)

Extract the supported input modalities for a specific model from an adapter.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`AIAdapter`](../interfaces/AIAdapter.md)\<`any`, `any`, `any`, `any`, `any`, `any`\>

### TModel

`TModel` *extends* `string`
