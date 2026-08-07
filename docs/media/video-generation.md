---
title: Video Generation
id: video-generation
order: 6
description: "Experimental generateVideo() jobs API — Sora, Veo, Omni Flash, Grok Imagine, Seedance, fal.ai."
keywords:
  - tanstack ai
  - video generation
  - sora
  - veo
  - omni flash
  - interactions api
  - gemini
  - grok imagine
  - seedance
  - byteplus
  - fal
  - generateVideo
  - jobs api
  - experimental
  - text-to-video
---

# Video Generation (Experimental)

> **Experimental.** API may change. Sora may need org verification. Jobs/polling (not sync). Quotas/pricing vary.

If you need video from a prompt → `generateVideo()` + `getVideoJobStatus()` (or `stream: true` + `useGenerateVideo`).

**Providers:** OpenAI Sora · Gemini Veo / Omni Flash · Grok Imagine · BytePlus Seedance · fal.ai

Long runs: [Generation Persistence](../persistence/generation-persistence). URLs expire — [keep the clip](../persistence/keep-generated-files).

## Jobs flow

1. Create job → `jobId`
2. Poll status until `completed` / `failed`
3. Read `url` when complete

### Create

```typescript
import { generateVideo } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

const { jobId, model } = await generateVideo({
  adapter: openaiVideo('sora-2'),
  prompt: 'A golden retriever puppy playing in a field of sunflowers',
})
```

### Poll

```typescript
import { generateVideo, getVideoJobStatus } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

const { jobId } = await generateVideo({
  adapter: openaiVideo('sora-2'),
  prompt: 'A golden retriever puppy playing in a field of sunflowers',
})

const status = await getVideoJobStatus({
  adapter: openaiVideo('sora-2'),
  jobId,
})

// status.status: 'pending' | 'processing' | 'completed' | 'failed'
// status.progress?: 0-100
```

### Full loop

```typescript
import { generateVideo, getVideoJobStatus } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

async function createAndAwaitVideo(prompt: string) {
  const { jobId } = await generateVideo({
    adapter: openaiVideo('sora-2'),
    prompt,
    size: '1280x720',
    duration: 8, // 4, 8, or 12
  })

  let status = 'pending'
  while (status !== 'completed' && status !== 'failed') {
    await new Promise((resolve) => setTimeout(resolve, 5000))
    const result = await getVideoJobStatus({
      adapter: openaiVideo('sora-2'),
      jobId,
    })
    status = result.status
    if (result.status === 'failed') {
      throw new Error(result.error || 'Video generation failed')
    }
  }

  const result = await getVideoJobStatus({
    adapter: openaiVideo('sora-2'),
    jobId,
  })
  if (result.status === 'completed' && result.url) return result.url
  throw new Error('Video generation failed or URL not available')
}
```

## Full-stack (stream polling server-side)

### 1. Server

```typescript ignore
// routes/api/generate/video.ts
import { generateVideo, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/generate/video')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { prompt, size, duration, model } = body.data

        const stream = generateVideo({
          adapter: openaiVideo(model ?? 'sora-2'),
          prompt,
          size,
          duration,
          stream: true,
          pollingInterval: 3000,
          maxDuration: 600_000,
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
```

### 2. Client

```tsx
import { useGenerateVideo, fetchServerSentEvents } from '@tanstack/ai-react'

function VideoGenerator() {
  const {
    generate,
    result,
    jobId,
    videoStatus,
    isLoading,
    error,
    stop,
    reset,
  } = useGenerateVideo({
    connection: fetchServerSentEvents('/api/generate/video'),
    onJobCreated: (id) => console.log('Job created:', id),
    onStatusUpdate: (status) => console.log('Status:', status.status),
  })

  return (
    <div>
      <button
        onClick={() =>
          generate({ prompt: 'A golden retriever playing in sunflowers' })
        }
        disabled={isLoading}
      >
        {isLoading ? 'Generating...' : 'Generate Video'}
      </button>
      {isLoading && (
        <div>
          {jobId && <p>Job: {jobId}</p>}
          {videoStatus?.progress != null && (
            <progress value={videoStatus.progress} max={100} />
          )}
          <p>Status: {videoStatus?.status ?? 'starting...'}</p>
          <button onClick={stop}>Cancel</button>
        </div>
      )}
      {error && <p>Error: {error.message}</p>}
      {result && (
        <div>
          <video src={result.url} controls width={640} />
          <button onClick={reset}>Clear</button>
        </div>
      )}
    </div>
  )
}
```

Other transports: [Generations](./generations#transports-in-full).

### Hook extras

| Option | Description |
|--------|-------------|
| `onJobCreated` | `(jobId) => void` |
| `onStatusUpdate` | `(status: VideoStatusInfo) => void` |

| Return | Description |
|--------|-------------|
| `jobId` | Current job |
| `videoStatus` | Latest poll (`status`, `progress`) |

## Job options

| Option | Type | Description |
|--------|------|-------------|
| `adapter` | `VideoAdapter` | Required |
| `prompt` | `string \| MediaPromptPart[]` | Required. Multimodal for image-to-video |
| `size` | `string` | Resolution / aspect template |
| `duration` | `number` | Seconds (model-dependent) |
| `modelOptions?` | `object` | Provider-specific |

## Image-to-video

```typescript
import { generateVideo } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'
import { base64Image } from './assets'

const { jobId } = await generateVideo({
  adapter: openaiVideo('sora-2'),
  prompt: [
    {
      type: 'text',
      content:
        'Animate this still into a slow cinematic push-in with subtle motion',
    },
    {
      type: 'image',
      source: {
        type: 'data',
        value: base64Image,
        mimeType: 'image/png',
      },
    },
  ],
})
```

Prompt text is sent **verbatim**. Referencing markers: [Image Generation](./image-generation.md#referencing-images-from-your-prompt).

### Roles

| Role | Maps to |
| ---- | ------- |
| `'start_frame'` | fal start / Veo image / Seedance `first_frame` |
| `'end_frame'` | fal end / Veo `lastFrame` / Seedance `last_frame` |
| `'reference'` / `'character'` | reference image lists |

```typescript
import { generateVideo } from '@tanstack/ai'
import { falVideo } from '@tanstack/ai-fal'
import { firstFrameUrl, lastFrameUrl } from './assets'

await generateVideo({
  adapter: falVideo('fal-ai/kling-video/v3/pro/image-to-video'),
  prompt: [
    { type: 'image', source: { type: 'url', value: firstFrameUrl } },
    { type: 'text', content: 'Slow cinematic push-in then a hard cut' },
    {
      type: 'image',
      source: { type: 'url', value: lastFrameUrl },
      metadata: { role: 'end_frame' },
    },
  ],
})
```

| Provider | Behavior |
| -------- | -------- |
| OpenAI | Single image → `input_reference` |
| fal.ai | Per-endpoint field map from SDK types |
| Gemini Veo | First start image + end/reference slots |
| BytePlus | Frames vs reference modes (mutually exclusive) |

### Sora sizes / durations

Sizes: `1280x720` (default), `720x1280`, `1792x1024`, `1024x1792`. Duration: `4` · `8` (default) · `12` seconds.

## Advanced

### Other transports

#### Direct (server polls to completion)

```typescript ignore
import { createServerFn } from '@tanstack/react-start'
import { generateVideo, getVideoJobStatus } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

export const generateVideoFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { prompt: string }) => data)
  .handler(async ({ data }) => {
    const adapter = openaiVideo('sora-2')
    const { jobId } = await generateVideo({ adapter, prompt: data.prompt })

    let status = await getVideoJobStatus({ adapter, jobId })
    while (status.status !== 'completed' && status.status !== 'failed') {
      await new Promise((r) => setTimeout(r, 5000))
      status = await getVideoJobStatus({ adapter, jobId })
    }
    if (status.status === 'failed') {
      throw new Error(status.error || 'Video generation failed')
    }
    return { jobId, status: 'completed' as const, url: status.url! }
  })
```

In direct fetcher mode, `jobId` / `videoStatus` won't stream live.

#### Server function + SSE

```typescript ignore
import { createServerFn } from '@tanstack/react-start'
import { generateVideo, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

export const generateVideoStreamFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { prompt: string; size?: string; duration?: number }) => data,
  )
  .handler(({ data }) => {
    return toServerSentEventsResponse(
      generateVideo({
        adapter: openaiVideo('sora-2'),
        prompt: data.prompt,
        size: data.size,
        duration: data.duration,
        stream: true,
      }),
    )
  })
```

```tsx
import { useGenerateVideo } from '@tanstack/ai-react'
import { generateVideoStreamFn } from '../lib/server-functions'

function VideoGenerator() {
  const { generate, result, jobId, videoStatus, isLoading } = useGenerateVideo({
    fetcher: (input) => generateVideoStreamFn({ data: input }),
  })
}
```

### Model options

**OpenAI Sora**

```typescript
import { generateVideo } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

const { jobId } = await generateVideo({
  adapter: openaiVideo('sora-2'),
  prompt: 'A beautiful sunset over the ocean',
  size: '1280x720',
  duration: 8,
  modelOptions: {
    size: '1280x720',
    seconds: '8',
  },
})
```

**Veo** — durations typed per model (`4`/`6`/`8` for 3.1). Use `snapDuration` for raw UI values. Download URLs need API key (`x-goog-api-key` or `key`).

```typescript ignore
import { generateVideo } from '@tanstack/ai'
import { geminiVideo } from '@tanstack/ai-gemini'

const adapter = geminiVideo('veo-3.1-generate-preview')

const { jobId } = await generateVideo({
  adapter,
  prompt: 'A close-up of a luthier carving a guitar neck',
  size: '16:9',
  duration: adapter.snapDuration(7),
  modelOptions: {
    resolution: '1080p',
    negativePrompt: 'cartoon, low quality',
    generateAudio: true,
  },
})
```

**Omni Flash** (`gemini-omni-flash-preview`) — Interactions API; 720p/24fps; duration 3–10s. Result may be `data:video/mp4;base64,…`. Edit with `modelOptions.previous_interaction_id`.

```typescript ignore
import { generateVideo } from '@tanstack/ai'
import { geminiVideo } from '@tanstack/ai-gemini'

const adapter = geminiVideo('gemini-omni-flash-preview')

const first = await generateVideo({
  adapter,
  prompt: 'A woman playing violin outdoors at golden hour',
  size: '9:16',
  duration: 6,
})

// after first.jobId completes:
const second = await generateVideo({
  adapter,
  prompt: 'Make the violin invisible',
  modelOptions: { previous_interaction_id: first.jobId },
})
```

**Grok** — `grok-imagine-video` (text+image); `grok-imagine-video-1.5` (image-only). Size: `aspectRatio_resolution` (e.g. `16:9_720p`). Duration 1–15s (clamped).

```typescript
import { generateVideo } from '@tanstack/ai'
import { grokVideo } from '@tanstack/ai-grok'

const { jobId } = await generateVideo({
  adapter: grokVideo('grok-imagine-video'),
  prompt: 'A beautiful sunset over the ocean',
  size: '16:9_720p',
  duration: 5,
})
```

**Seedance** — size `ratio` or `ratio_resolution` (e.g. `16:9_720p`). Bare `'720p'` throws on BytePlus (valid on fal). URLs expire in **24h**. See [BytePlus adapter](../adapters/byteplus#video-generation-seedance).

```typescript
import { generateVideo } from '@tanstack/ai'
import { byteplusVideo } from '@tanstack/ai-byteplus'

const { jobId } = await generateVideo({
  adapter: byteplusVideo('dreamina-seedance-2-0-260128'),
  prompt: 'A beautiful sunset over the ocean',
  size: '16:9_720p',
  duration: 5,
  modelOptions: {
    seed: 42,
    generate_audio: true,
    priority: 5, // Seedance 2.0 family
  },
})
```

Porting Seedance to fal: keep `16:9_720p`; mode is in fal endpoint id vs prompt parts on BytePlus.

### Response types

`getVideoJobStatus()` merges to `{ status, progress?, url?, error?, usage? }` (no `jobId`/`expiresAt` on the helper return).

```typescript
interface VideoJobResult {
  jobId: string
  model: string
}

// fal: usage.unitsBilled from x-fal-billable-units
```

Models: `sora-2` (faster) · `sora-2-pro` (higher quality).

### Errors / limits / keys

Handle `failed` status and API access errors. Video is slow and quota-heavy.

Env: `OPENAI_API_KEY` · `GOOGLE_API_KEY` / `GEMINI_API_KEY` · `ARK_API_KEY` / `BYTEPLUS_API_KEY`

```typescript
import { createOpenaiVideo } from '@tanstack/ai-openai'

const adapter = createOpenaiVideo('sora-2', 'your-openai-api-key')
```

### vs image generation

| | Image | Video |
|--|-------|-------|
| API | Synchronous | Jobs / polling |
| Wait | Seconds | Minutes |
| Key options | `prompt`, `size`, `numberOfImages` | `prompt`, `size`, `duration` |

1. Timeout polling loops.
2. Show progress UI.
3. Persist bytes, not only URLs.
4. Validate prompt length before submit.
