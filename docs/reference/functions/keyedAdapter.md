---
id: keyedAdapter
title: keyedAdapter
---

```ts
function keyedAdapter<TAdapter>(provider, create): KeyedAdapter<TAdapter>;
```

Defined in: [packages/ai/src/byok/keyed.ts:44](https://github.com/TanStack/ai/blob/main/packages/ai/src/byok/keyed.ts#L44)

Wrap an adapter factory that needs a provider key. The host finds the key
and calls `create` just before each call, so the key is not in your code
or in a `.env` file. Works for every adapter kind: text, image, speech,
audio, video, and the rest.

## Type Parameters

### TAdapter

`TAdapter`

## Parameters

### provider

`string` \| `ByokProvider`\<`string`\>

The provider whose key `create` needs: a BYOK descriptor
  such as `openaiByok` (its `env` names are the fallback), or a provider id.

### create

(`key`) => `TAdapter`

Builds the adapter from the key.

## Returns

[`KeyedAdapter`](../interfaces/KeyedAdapter.md)\<`TAdapter`\>

## Throws

Error when the provider id is not a valid BYOK slug.

## Example

```ts
import { createOpenaiChat } from '@tanstack/ai-openai'
import { openaiByok } from '@tanstack/ai-openai/byok'

const adapter = keyedAdapter(openaiByok, (key) =>
  createOpenaiChat('gpt-5.5', key),
)
// In a server route, with `getByokKey` from `@tanstack/ai/byok/server`:
const key = getByokKey(request, adapter.provider)
if (key) chat({ adapter: adapter.create(key), messages })
```
