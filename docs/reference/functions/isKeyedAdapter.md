---
id: isKeyedAdapter
title: isKeyedAdapter
---

```ts
function isKeyedAdapter<TAdapter>(value): value is KeyedAdapter<TAdapter>;
```

Defined in: [packages/ai/src/byok/keyed.ts:64](https://github.com/TanStack/ai/blob/main/packages/ai/src/byok/keyed.ts#L64)

True when `value` came from [keyedAdapter](keyedAdapter.md). A host uses it to decide
if an adapter needs a key first.

## Type Parameters

### TAdapter

`TAdapter`

## Parameters

### value

  \| `TAdapter`
  \| [`KeyedAdapter`](../interfaces/KeyedAdapter.md)\<`TAdapter`\>

## Returns

`value is KeyedAdapter<TAdapter>`
