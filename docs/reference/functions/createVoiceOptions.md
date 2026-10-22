---
id: createVoiceOptions
title: createVoiceOptions
---

```ts
function createVoiceOptions<TAdapter, TStream>(options): VoiceActivityOptions<TAdapter, TStream>;
```

Defined in: packages/ai/src/activities/generateVoice/index.ts:359

Create typed options for the generateVoice() function without executing.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`VoiceAdapter`](../interfaces/VoiceAdapter.md)\<`string`, `VoiceProviderOptions`\<`TAdapter`\>\>

### TStream

`TStream` *extends* `boolean` = `false`

## Parameters

### options

`VoiceActivityOptions`\<`TAdapter`, `TStream`\>

## Returns

`VoiceActivityOptions`\<`TAdapter`, `TStream`\>
