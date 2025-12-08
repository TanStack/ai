---
id: ExtractModelsFromAdapter
title: ExtractModelsFromAdapter
---

# Type Alias: ExtractModelsFromAdapter\<T\>

```ts
type ExtractModelsFromAdapter<T> = T extends AIAdapter<infer M, any, any, any, any, any> ? M[number] : never;
```

Defined in: [types.ts:862](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L862)

## Type Parameters

### T

`T`
