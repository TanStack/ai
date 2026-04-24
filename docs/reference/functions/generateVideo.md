---
id: generateVideo
title: generateVideo
---

# Function: generateVideo()

```ts
function generateVideo<TAdapter, TStream>(options): TStream extends true ? AsyncIterable<AGUIEvent, any, any> : Promise<VideoJobResult>;
```

Defined in: [packages/typescript/ai/src/activities/generateVideo/index.ts:230](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateVideo/index.ts#L230)

**`Experimental`**

Generate video - creates a video generation job from a text prompt.

Uses AI video generation models to create videos based on natural language descriptions.
Unlike image generation, video generation is asynchronous and requires polling for completion.

When `stream: true` is passed, handles the full job lifecycle automatically:
create job → poll for status → stream updates → yield final result.

 Video generation is an experimental feature and may change.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`VideoAdapter`](../interfaces/VideoAdapter.md)\<`string`, `any`, `any`, `any`\>

### TStream

`TStream` *extends* `boolean` = `false`

## Parameters

### options

`VideoCreateOptions`\<`TAdapter`, `TStream`\>

## Returns

`TStream` *extends* `true` ? `AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md), `any`, `any`\> : `Promise`\<[`VideoJobResult`](../interfaces/VideoJobResult.md)\>

## Examples

```ts
import { generateVideo } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

// Start a video generation job
const { jobId } = await generateVideo({
  adapter: openaiVideo('sora-2'),
  prompt: 'A cat chasing a dog in a sunny park'
})

console.log('Job started:', jobId)
```

```ts
import { generateVideo, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

const stream = generateVideo({
  adapter: openaiVideo('sora-2'),
  prompt: 'A cat chasing a dog in a sunny park',
  stream: true,
  pollingInterval: 3000,
})

return toServerSentEventsResponse(stream)
```
