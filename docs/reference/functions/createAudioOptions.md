---
id: createAudioOptions
title: createAudioOptions
---

# Function: createAudioOptions()

```ts
function createAudioOptions<TAdapter, TStream>(options): AudioActivityOptions<TAdapter, TStream>;
```

Defined in: [packages/ai/src/activities/generateAudio/index.ts:285](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateAudio/index.ts#L285)

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
