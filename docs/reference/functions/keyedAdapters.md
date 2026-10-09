---
id: keyedAdapters
title: keyedAdapters
---

```ts
function keyedAdapters<TMap>(map): { [K in string | number | symbol]: TMap[K] extends KeyedAdapter<A> ? KeyedAdapter<A> : TMap[K] extends (key: string) => A ? KeyedAdapter<A> : never };
```

Defined in: [packages/ai/src/byok/keyed.ts:94](https://github.com/TanStack/ai/blob/main/packages/ai/src/byok/keyed.ts#L94)

Keyed adapters for several providers in one map. The map key is the
provider id, so a key goes only to the factory of its own provider. An
entry is a factory (the key comes only from the `x-byok-<id>` header), or a
[keyedAdapter](keyedAdapter.md) made with a BYOK descriptor (its `env` names are the
fallback). Pick one per request with `keyedAdapterFromRequest` from
`@tanstack/ai/byok/server`.

## Type Parameters

### TMap

`TMap` *extends* `Record`\<`string`, 
  \| [`KeyedAdapter`](../interfaces/KeyedAdapter.md)\<`unknown`\>
  \| ((`key`) => `unknown`)\>

## Parameters

### map

`TMap`

## Returns

\{ \[K in string \| number \| symbol\]: TMap\[K\] extends KeyedAdapter\<A\> ? KeyedAdapter\<A\> : TMap\[K\] extends (key: string) =\> A ? KeyedAdapter\<A\> : never \}

## Throws

Error when a key is not a valid provider id, or when a keyed adapter
  entry is for a different provider than its key.

## Example

```ts
const models = keyedAdapters({
  openai: (key) => createOpenaiChat('gpt-6.1-sol', key),
  anthropic: keyedAdapter(anthropicByok, (key) =>
    createAnthropicChat('claude-sonnet-5-5', key),
  ),
})
```
