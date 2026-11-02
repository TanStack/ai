---
id: generateLiveVideo
title: generateLiveVideo
---

```ts
function generateLiveVideo<TAdapter, TStream>(options): LiveVideoActivityResult<TStream>;
```

Defined in: [packages/ai/src/activities/generateLiveVideo/index.ts:155](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateLiveVideo/index.ts#L155)

**`Experimental`**

Live generation activity - opens a live, prompt-steerable video session.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`LiveVideoAdapter`](../interfaces/LiveVideoAdapter.md)\<`string`, `LiveVideoProviderOptions`\<`TAdapter`\>\>

### TStream

`TStream` *extends* `boolean` = `false`

## Parameters

### options

`LiveVideoActivityOptions`\<`TAdapter`, `TStream`\>

## Returns

`LiveVideoActivityResult`\<`TStream`\>

## Example

**Mint a session token on the server**

```ts
import { generateLiveVideo } from '@tanstack/ai'
import { reactorVideo } from '@tanstack/ai-reactor'

const live = await generateLiveVideo({
  adapter: reactorVideo('helios'),
  prompt: 'A red sports car powerslides a mountain hairpin',
})

// Hand live.token, live.model, and live.prompt to the browser.
```

 Live generation is an experimental feature and may change.
