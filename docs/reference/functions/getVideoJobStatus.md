---
id: getVideoJobStatus
title: getVideoJobStatus
---

# Function: getVideoJobStatus()

```ts
function getVideoJobStatus<TAdapter>(options): Promise<VideoJobStatusResult>;
```

Defined in: [packages/ai/src/activities/generateVideo/index.ts:911](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVideo/index.ts#L911)

**`Experimental`**

Get video job status - returns the current status, progress, and URL if available.

This function combines status checking and URL retrieval. If the job is completed,
it will automatically fetch and include the video URL.

It is also where a non-streaming `generateVideo()` run ENDS: pass the same
`middleware` and `threadId`, and the poll that first sees a terminal job state
finishes the run (recording the result and its artifacts) or fails it. The run
is identified by `adapter` + `jobId`, exactly what the submission derived it
from, so there is nothing else to carry between the two calls.

 Video generation is an experimental feature and may change.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`VideoAdapter`](../interfaces/VideoAdapter.md)\<`string`, `any`, `any`, `any`, `any`, `any`\>

## Parameters

### options

`VideoJobStatusOptions`\<`TAdapter`\>

## Returns

`Promise`\<`VideoJobStatusResult`\>

## Examples

**Check job status**

```ts
import { getVideoJobStatus } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

const result = await getVideoJobStatus({
  adapter: openaiVideo('sora-2'),
  jobId: 'job-123'
})

console.log('Status:', result.status)
console.log('Progress:', result.progress)
if (result.url) {
  console.log('Video URL:', result.url)
}
```

**Submit and poll one persisted run**

```ts
import { generateVideo, getVideoJobStatus } from '@tanstack/ai'
import { withGenerationPersistence } from '@tanstack/ai-persistence'
import { openaiVideo } from '@tanstack/ai-openai'

const adapter = openaiVideo('sora-2')
const middleware = [withGenerationPersistence(persistence)]

// Opens the run (status `running`, jobId recorded). Its run id is derived
// from the provider job, so nothing has to be stored to resume it.
const { jobId } = await generateVideo({
  adapter,
  prompt: 'A cat chasing a dog in a sunny park',
  threadId,
  middleware,
})

// Completes the SAME run once the job settles — this is what writes the
// video, its artifacts, and the terminal status. Works from a different
// request or process: the jobId is the only correlation.
const status = await getVideoJobStatus({
  adapter,
  jobId,
  threadId,
  middleware,
})
```
