---
id: createAudioOptions
title: createAudioOptions
---

```ts
function createAudioOptions<TAdapter, TStream>(options): AudioActivityOptions<TAdapter, TStream>;
```

Defined in: packages/ai/src/activities/generateAudio/index.ts:318

Create typed options for the generateAudio() function without executing.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`AudioAdapter`](../interfaces/AudioAdapter.md)\<`string`, `AudioProviderOptions`\<`TAdapter`\>\>

### TStream

`TStream` *extends* `boolean` = `false`

## Parameters

### options

`AudioActivityOptions`\<`TAdapter`, `TStream`\>

## Returns

`AudioActivityOptions`\<`TAdapter`, `TStream`\>
