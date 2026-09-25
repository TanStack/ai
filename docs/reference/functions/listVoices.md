---
id: listVoices
title: listVoices
---

```ts
function listVoices<TAdapter>(options): Promise<ListVoicesResult>;
```

Defined in: [packages/ai/src/activities/generateSpeech/index.ts:453](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateSpeech/index.ts#L453)

List the voices an account can pass to `generateSpeech()`.

Only providers with a per-account catalog implement this. A provider whose
voices are a fixed list publishes that list as a const in its package, so
import it from there rather than calling this.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`TTSAdapter`](../interfaces/TTSAdapter.md)\<`string`, `TTSProviderOptions`\<`TAdapter`\>\>

## Parameters

### options

`ListVoicesActivityOptions`\<`TAdapter`\>

## Returns

`Promise`\<[`ListVoicesResult`](../interfaces/ListVoicesResult.md)\>

## Example

**Find the voices you created**

```ts
import { listVoices } from '@tanstack/ai'
import { elevenlabsSpeech } from '@tanstack/ai-elevenlabs'

const { voices } = await listVoices({
  adapter: elevenlabsSpeech('eleven_v3'),
  origins: ['generated', 'cloned'],
})
```
