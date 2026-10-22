---
id: KeyedAdapterResult
title: KeyedAdapterResult
---

```ts
type KeyedAdapterResult<T> = T extends KeyedAdapter<infer A> ? A : never;
```

Defined in: packages/ai/src/byok/keyed.ts:90

The adapter type that a [KeyedAdapter](../interfaces/KeyedAdapter.md) builds.

## Type Parameters

### T

`T`
