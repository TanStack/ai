---
id: stableJson
title: stableJson
---

```ts
function stableJson(value): string;
```

Defined in: [packages/ai/src/utilities/stable-json.ts:7](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/stable-json.ts#L7)

JSON text with the keys of every object in sorted order. Arrays keep their
order. A store can give a value back with its keys in another order
(PostgreSQL `jsonb` does, and so does a schema parse), so compare or hash
this, not `JSON.stringify`, when the value went through a store.

## Parameters

### value

`unknown`

## Returns

`string`
