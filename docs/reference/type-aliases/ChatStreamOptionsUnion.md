---
id: ChatStreamOptionsUnion
title: ChatStreamOptionsUnion
---

# Type Alias: ChatStreamOptionsUnion\<TAdapter\>

```ts
type ChatStreamOptionsUnion<TAdapter> = TAdapter extends AIAdapter<infer Models, any, any, any, infer ModelProviderOptions> ? Models[number] extends infer TModel ? TModel extends string ? Omit<ChatOptions, "model" | "providerOptions" | "responseFormat"> & object : never : never : never;
```

Defined in: [types.ts:484](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L484)

## Type Parameters

### TAdapter

`TAdapter` *extends* [`AIAdapter`](../../interfaces/AIAdapter.md)\<`any`, `any`, `any`, `any`, `any`\>
