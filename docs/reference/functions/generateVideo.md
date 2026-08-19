---
id: generateVideo
title: generateVideo
---

# Function: generateVideo()

```ts
function generateVideo<TAdapter, TStream>(options): TStream extends true ? AsyncIterable<AGUIEvent, any, any> : Promise<VideoJobResult>;
```

Defined in: [packages/ai/src/activities/generateVideo/index.ts:389](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVideo/index.ts#L389)

**`Experimental`**

Generate video - creates a video generation job from a text prompt.

Uses AI video generation models to create videos based on natural language descriptions.
Unlike image generation, video generation is asynchronous and requires polling for completion.

When `stream: true` is passed, handles the full job lifecycle automatically:
create job → poll for status → stream updates → yield final result.

 Video generation is an experimental feature and may change.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`VideoAdapter`](../interfaces/VideoAdapter.md)\<`string`, `any`, `any`, `any`, `any`, `any`\>

### TStream

`TStream` *extends* `boolean` = `false`

## Parameters

### options

`VideoCreateOptions`\<`TAdapter`, `TStream`\>

## Returns

`TStream` *extends* `true` ? `AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md), `any`, `any`\> : `Promise`\<[`VideoJobResult`](../interfaces/VideoJobResult.md)\>

## Examples

**Create a video generation job**

```ts
import { generateVideo, getVideoJobStatus } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

// Start a video generation job
const { jobId } = await generateVideo({
  adapter: openaiVideo('sora-2'),
  prompt: 'A cat chasing a dog in a sunny park'
})

console.log('Job started:', jobId)

// The submission only OPENS the run; the poll that sees a terminal state is
// what completes it. The `jobId` is the whole correlation — pass the same
// `middleware` and `threadId` when you use them.
const status = await getVideoJobStatus({
  adapter: openaiVideo('sora-2'),
  jobId,
})
```

**Stream the full video generation lifecycle**

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
