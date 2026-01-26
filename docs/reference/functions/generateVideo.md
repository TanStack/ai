---
id: generateVideo
title: generateVideo
---

# Function: generateVideo()

```ts
function generateVideo<TAdapter>(options): Promise<VideoJobResult>;
```

Defined in: [activities/generateVideo/index.ts:163](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateVideo/index.ts#L163)

**`Experimental`**

Generate video - creates a video generation job from a text prompt.

Uses AI video generation models to create videos based on natural language descriptions.
Unlike image generation, video generation is asynchronous and requires polling for completion.

 Video generation is an experimental feature and may change.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`VideoAdapter`](../interfaces/VideoAdapter.md)\<`string`, `object`\>

## Parameters

### options

`VideoCreateOptions`\<`TAdapter`\>

## Returns

`Promise`\<[`VideoJobResult`](../interfaces/VideoJobResult.md)\>

## Example

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
