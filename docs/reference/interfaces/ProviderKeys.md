---
id: ProviderKeys
title: ProviderKeys
---

Defined in: packages/ai/src/byok/keyed.ts:25

Finds provider keys for a run. An agent reads it as `ctx.keys`. A host sets
it on the binding and reads each user's own keys. Without a host,
`ctx.keys` reads each provider's `env` names.

## Properties

### adapter

```ts
adapter: <TAdapter>(adapter) => Promise<TAdapter>;
```

Defined in: packages/ai/src/byok/keyed.ts:34

The adapter to call. A plain adapter comes back unchanged. A
[KeyedAdapter](KeyedAdapter.md) is built with the key from `require`.

#### Type Parameters

##### TAdapter

`TAdapter`

#### Parameters

##### adapter

`TAdapter` \| [`KeyedAdapter`](KeyedAdapter.md)\<`TAdapter`\>

#### Returns

`Promise`\<`TAdapter`\>

***

### get

```ts
get: (provider) => Promise<string | null>;
```

Defined in: packages/ai/src/byok/keyed.ts:27

The key for `provider`, or `null` when there is none.

#### Parameters

##### provider

`string` \| `ByokProvider`\<`string`\>

#### Returns

`Promise`\<`string` \| `null`\>

***

### require

```ts
require: (provider) => Promise<string>;
```

Defined in: packages/ai/src/byok/keyed.ts:29

The key for `provider`. Throws when there is none.

#### Parameters

##### provider

`string` \| `ByokProvider`\<`string`\>

#### Returns

`Promise`\<`string`\>
