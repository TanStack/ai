---
id: defineRunStore
title: defineRunStore
---

# Function: defineRunStore()

```ts
function defineRunStore<T>(store): T;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:267](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L267)

Type a [RunStore](../interfaces/RunStore.md) implementation inline: pass the object and get
autocomplete plus contract checking with no separate annotation. Mirrors
`defineLock` / `defineSandboxInstanceStore`.

The generic return preserves the argument's own type, so an optional method
the implementation actually provides stays known-present on the result
instead of collapsing back to `| undefined` on the interface.

## Type Parameters

### T

`T` *extends* [`RunStore`](../interfaces/RunStore.md)

## Parameters

### store

`T`

## Returns

`T`
