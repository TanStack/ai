---
id: TextStreamOptionsForModel
title: TextStreamOptionsForModel
---

# Type Alias: TextStreamOptionsForModel\<TAdapter, TModel\>

```ts
type TextStreamOptionsForModel<TAdapter, TModel> = TAdapter extends AIAdapter<any, any, any, any, infer ModelProviderOptions, infer ModelInputModalities, infer MessageMetadata> ? Omit<TextOptions, "model" | "providerOptions" | "responseFormat" | "messages"> & object : never;
```

Defined in: [types.ts:883](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L883)

Chat options constrained by a specific model's capabilities.
Unlike TextStreamOptionsUnion which creates a union over all models,
this type takes a specific model and constrains messages accordingly.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`AIAdapter`](../interfaces/AIAdapter.md)\<`any`, `any`, `any`, `any`, `any`, `any`, `any`\>

### TModel

`TModel` *extends* `string`
