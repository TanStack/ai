---
id: generateAudio
title: generateAudio
---

# Function: generateAudio()

```ts
function generateAudio<TAdapter, TStream>(options): AudioActivityResult<TStream>;
```

Defined in: [packages/typescript/ai/src/activities/generateAudio/index.ts:115](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateAudio/index.ts#L115)

Audio generation activity - generates audio from text prompts.

Uses AI models to create music, sound effects, and other audio content.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`AudioAdapter`](../interfaces/AudioAdapter.md)\<`string`, `AudioProviderOptions`\<`TAdapter`\>\>

### TStream

`TStream` *extends* `boolean` = `false`

## Parameters

### options

`AudioActivityOptions`\<`TAdapter`, `TStream`\>

## Returns

`AudioActivityResult`\<`TStream`\>

## Example

```ts
import { generateAudio } from '@tanstack/ai'
import { falAudio } from '@tanstack/ai-fal'

const result = await generateAudio({
  adapter: falAudio('fal-ai/diffrhythm'),
  prompt: 'An upbeat electronic track with synths',
  duration: 10
})

console.log(result.audio.url) // URL to generated audio
```
