---
id: ChatStreamOptionsForModel
title: ChatStreamOptionsForModel
---

# Type Alias: ChatStreamOptionsForModel\<TAdapter, TModel\>

```ts
type ChatStreamOptionsForModel<TAdapter, TModel> = TAdapter extends AIAdapter<any, any, any, any, infer ModelProviderOptions, infer ModelInputModalities, infer MessageMetadata> ? Omit<ChatOptions, "model" | "providerOptions" | "responseFormat" | "messages"> & object : never;
```

Defined in: [types.ts:795](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L795)

Chat options constrained by a specific model's capabilities.
Unlike ChatStreamOptionsUnion which creates a union over all models,
this type takes a specific model and constrains messages accordingly.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`AIAdapter`](../interfaces/AIAdapter.md)\<`any`, `any`, `any`, `any`, `any`, `any`, `any`\>

### TModel

`TModel` *extends* `string`
