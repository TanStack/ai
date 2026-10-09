---
id: KeyedAdapterResult
title: KeyedAdapterResult
---

```ts
type KeyedAdapterResult<T> = T extends KeyedAdapter<infer A> ? A : never;
```

Defined in: [packages/ai/src/byok/keyed.ts:71](https://github.com/TanStack/ai/blob/main/packages/ai/src/byok/keyed.ts#L71)

The adapter type that a [KeyedAdapter](../interfaces/KeyedAdapter.md) builds.

## Type Parameters

### T

`T`
