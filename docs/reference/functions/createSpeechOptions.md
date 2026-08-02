---
id: createSpeechOptions
title: createSpeechOptions
---

# Function: createSpeechOptions()

```ts
function createSpeechOptions<TAdapter, TStream>(options): TTSActivityOptions<TAdapter, TStream>;
```

Defined in: [packages/ai/src/activities/generateSpeech/index.ts:274](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateSpeech/index.ts#L274)

Create typed options for the generateSpeech() function without executing.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`TTSAdapter`](../interfaces/TTSAdapter.md)\<`string`, `TTSProviderOptions`\<`TAdapter`\>\>

### TStream

`TStream` *extends* `boolean` = `false`

## Parameters

### options

`TTSActivityOptions`\<`TAdapter`, `TStream`\>

## Returns

`TTSActivityOptions`\<`TAdapter`, `TStream`\>
