---
id: KeyedAdapter
title: KeyedAdapter
---

Defined in: [packages/ai/src/byok/keyed.ts:12](https://github.com/TanStack/ai/blob/main/packages/ai/src/byok/keyed.ts#L12)

An adapter that needs a provider key before it exists. Make one with
[keyedAdapter](../functions/keyedAdapter.md). A host finds the key and calls `create` just before a
call.

## Type Parameters

### TAdapter

`TAdapter`

## Properties

### \[KEYED\_ADAPTER\]

```ts
readonly [KEYED_ADAPTER]: true;
```

Defined in: [packages/ai/src/byok/keyed.ts:13](https://github.com/TanStack/ai/blob/main/packages/ai/src/byok/keyed.ts#L13)

***

### create

```ts
readonly create: (key) => TAdapter;
```

Defined in: [packages/ai/src/byok/keyed.ts:17](https://github.com/TanStack/ai/blob/main/packages/ai/src/byok/keyed.ts#L17)

Builds the adapter from the key.

#### Parameters

##### key

`string`

#### Returns

`TAdapter`

***

### provider

```ts
readonly provider: string | ByokProvider<string>;
```

Defined in: [packages/ai/src/byok/keyed.ts:15](https://github.com/TanStack/ai/blob/main/packages/ai/src/byok/keyed.ts#L15)

The provider whose key `create` needs.
