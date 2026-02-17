---
id: getVideoJobStatus
title: getVideoJobStatus
---

# Function: getVideoJobStatus()

```ts
function getVideoJobStatus<TAdapter>(options): Promise<{
  error?: string;
  progress?: number;
  status: "pending" | "processing" | "completed" | "failed";
  url?: string;
}>;
```

Defined in: [activities/generateVideo/index.ts:203](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateVideo/index.ts#L203)

**`Experimental`**

Get video job status - returns the current status, progress, and URL if available.

This function combines status checking and URL retrieval. If the job is completed,
it will automatically fetch and include the video URL.

 Video generation is an experimental feature and may change.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`VideoAdapter`](../interfaces/VideoAdapter.md)\<`string`, `object`\>

## Parameters

### options

#### adapter

`TAdapter` & `object`

#### jobId

`string`

## Returns

`Promise`\<\{
  `error?`: `string`;
  `progress?`: `number`;
  `status`: `"pending"` \| `"processing"` \| `"completed"` \| `"failed"`;
  `url?`: `string`;
\}\>

## Example

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
