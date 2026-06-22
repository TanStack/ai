---
title: Video Generation
id: video-generation
order: 6
description: "Generate video from text prompts with OpenAI Sora or Google Veo using TanStack AI's experimental generateVideo() jobs/polling API."
keywords:
  - tanstack ai
  - video generation
  - sora
  - veo
  - gemini
  - generateVideo
  - jobs api
  - experimental
  - text-to-video
---

# Video Generation (Experimental)

> **⚠️ EXPERIMENTAL FEATURE WARNING**
>
> Video generation is an **experimental feature** that is subject to significant changes. Please read the caveats below carefully before using this feature.
>
> **Key Caveats:**
> - The API may change without notice in future versions
> - OpenAI's Sora API is in limited availability and may require organization verification
> - Video generation uses a jobs/polling architecture, which differs from other synchronous activities
> - Pricing, rate limits, and quotas may vary and are subject to change
> - Not all features described here may be available in your OpenAI account

## Overview

TanStack AI provides experimental support for video generation through dedicated video adapters. Unlike image generation, video generation is an **asynchronous operation** that uses a jobs/polling pattern:

1. **Create a job** - Submit a prompt and receive a job ID
2. **Poll for status** - Check the job status until it's complete
3. **Retrieve the video** - Get the URL to download/view the generated video

Currently supported:
- **OpenAI**: Sora-2 and Sora-2-Pro models (when available)
- **Google Gemini**: Veo 3.1, Veo 3, and Veo 2 models (via the long-running operations API)

## Basic Usage

### Creating a Video Job

```typescript group=video-generation
import { generateVideo } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

// Start a video generation job (the adapter uses OPENAI_API_KEY from environment)
const { jobId, model } = await generateVideo({
  adapter: openaiVideo('sora-2'),
  prompt: 'A golden retriever puppy playing in a field of sunflowers',
})

console.log('Job started:', jobId)
```

### Polling for Status

```typescript group=video-generation
import { getVideoJobStatus } from '@tanstack/ai'

// Check the status of the job
const status = await getVideoJobStatus({
  adapter: openaiVideo('sora-2'),
  jobId,
})

console.log('Status:', status.status) // 'pending' | 'processing' | 'completed' | 'failed'
console.log('Progress:', status.progress) // 0-100 (if available)

if (status.status === 'failed') {
  console.error('Error:', status.error)
}
```

### Getting the Video URL

```typescript
import { getVideoJobStatus } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'
import { jobId } from './job'

// Only call this after status is 'completed'
const result = await getVideoJobStatus({
  adapter: openaiVideo('sora-2'),
  jobId,
})

if (result.status === 'completed' && result.url) {
  console.log('Video URL:', result.url)
}
```

### Complete Example with Polling Loop

```typescript
import { generateVideo, getVideoJobStatus } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

async function createAndAwaitVideo(prompt: string) {
  // 1. Create the job
  const { jobId } = await generateVideo({
    adapter: openaiVideo('sora-2'),
    prompt,
    size: '1280x720',
    duration: 8, // 4, 8, or 12 seconds
  })

  console.log('Job created:', jobId)

  // 2. Poll for completion
  let status = 'pending'
  while (status !== 'completed' && status !== 'failed') {
    // Wait 5 seconds between polls
    await new Promise((resolve) => setTimeout(resolve, 5000))

    const result = await getVideoJobStatus({
      adapter: openaiVideo('sora-2'),
      jobId,
    })

    status = result.status
    console.log(`Status: ${status}${result.progress ? ` (${result.progress}%)` : ''}`)

    if (result.status === 'failed') {
      throw new Error(result.error || 'Video generation failed')
    }
  }

  // 3. Get the video URL
  const result = await getVideoJobStatus({
    adapter: openaiVideo('sora-2'),
    jobId,
  })

  if (result.status === 'completed' && result.url) {
    return result.url
  }

  throw new Error('Video generation failed or URL not available')
}

// Usage
const videoUrl = await createAndAwaitVideo('A cat playing piano in a jazz bar')
console.log('Video ready:', videoUrl)
```

## Full-Stack Usage

TanStack AI's `generateVideo` function supports a `stream: true` flag that handles the job creation and polling loop server-side, streaming status updates to the client in real-time.

### Streaming Mode (Server Route + Client Hook)

**Server** — The server handles the entire polling lifecycle and streams events to the client:

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
          pollingInterval: 3000, // Check status every 3 seconds
          maxDuration: 600_000, // Timeout after 10 minutes
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
```

**Client** — Use the `useGenerateVideo` hook which tracks job status automatically:

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

### Direct Mode (Server Function + Fetcher)

For cases where the server handles the full polling loop and returns a completed result:

```typescript ignore
// lib/server-functions.ts
import { createServerFn } from '@tanstack/react-start'
import { generateVideo, getVideoJobStatus } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

export const generateVideoFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { prompt: string }) => data)
  .handler(async ({ data }) => {
    const adapter = openaiVideo('sora-2')

    // Create the job
    const { jobId } = await generateVideo({
      adapter,
      prompt: data.prompt,
    })

    // Poll until complete
    let status = await getVideoJobStatus({ adapter, jobId })
    while (status.status !== 'completed' && status.status !== 'failed') {
      await new Promise((r) => setTimeout(r, 5000))
      status = await getVideoJobStatus({ adapter, jobId })
    }

    if (status.status === 'failed') {
      throw new Error(status.error || 'Video generation failed')
    }

    return {
      jobId,
      status: 'completed' as const,
      url: status.url!,
    }
  })
```

```tsx
import { useGenerateVideo } from '@tanstack/ai-react'
import { generateVideoFn } from '../lib/server-functions'

function VideoGenerator() {
  const { generate, result, isLoading } = useGenerateVideo({
    fetcher: (input) => generateVideoFn({ data: input }),
  })
  // ... same UI as above (note: jobId and videoStatus won't update in fetcher mode)
}
```

> **Note:** In direct fetcher mode, `jobId` and `videoStatus` won't receive real-time updates since there's no streaming. Use the streaming connection mode or server function streaming for progress tracking.

### Server Function Streaming (Fetcher + Response)

For TanStack Start server functions that stream results. The fetcher receives type-safe input and returns an SSE `Response` — the client parses it automatically. This gives you both type safety and real-time `jobId`/`videoStatus` updates:

```typescript ignore
// lib/server-functions.ts
import { createServerFn } from '@tanstack/react-start'
import { generateVideo, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

export const generateVideoStreamFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { prompt: string; size?: string; duration?: number }) => data)
  .handler(({ data }) => {
    return toServerSentEventsResponse(
      generateVideo({
        adapter: openaiVideo('sora-2'),
        prompt: data.prompt,
        size: data.size as any,
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
  // ... same UI as streaming mode (jobId and videoStatus update in real-time)
}
```

### Hook API

The `useGenerateVideo` hook accepts all common options plus video-specific callbacks:

| Option | Type | Description |
|--------|------|-------------|
| `connection` | `ConnectionAdapter` | Streaming transport (SSE, HTTP stream, custom) |
| `fetcher` | `(input) => Promise<VideoGenerateResult \| Response>` | Direct async function, or server function returning an SSE `Response` |
| `onResult` | `(result) => TOutput \| null \| void` | Callback when video is ready. Optionally return a transformed value to store as `result` |
| `onError` | `(error) => void` | Callback on error |
| `onProgress` | `(progress, message?) => void` | Progress updates (0-100) |
| `onJobCreated` | `(jobId: string) => void` | Callback when the job is created |
| `onStatusUpdate` | `(status: VideoStatusInfo) => void` | Callback on each polling update |

And returns:

| Property | Type | Description |
|----------|------|-------------|
| `generate` | `(input: VideoGenerateInput) => Promise<void>` | Trigger generation |
| `result` | `VideoGenerateResult \| null` | The result with video URL, or null |
| `jobId` | `string \| null` | The current job ID |
| `videoStatus` | `VideoStatusInfo \| null` | Latest polling status (progress, status) |
| `isLoading` | `boolean` | Whether generation is in progress |
| `error` | `Error \| undefined` | Current error, if any |
| `status` | `GenerationClientState` | `'idle'` \| `'generating'` \| `'success'` \| `'error'` |
| `stop` | `() => void` | Abort the current generation |
| `reset` | `() => void` | Clear all state and return to idle |

## Options

### Job Creation Options

| Option | Type | Description |
|--------|------|-------------|
| `adapter` | `VideoAdapter` | Video adapter instance with model (required) |
| `prompt` | `string \| MediaPromptPart[]` | Description of the video to generate (required). A plain string, or — on models that support conditioned generation — an ordered array of content parts interleaving text with image / video / audio inputs. See [Image-to-Video](#image-to-video) below. |
| `size` | `string` | Video resolution in WIDTHxHEIGHT format |
| `duration` | `number` | Video duration in seconds (maps to `seconds` parameter in API) |
| `modelOptions?` | `object` | Model-specific options (renamed from `providerOptions`) |

## Image-to-Video

For starting-frame, ending-frame, and reference-image conditioned video
generation, pass the `prompt` as an array of content parts:

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

The accepted part types are narrowed **per model at compile time** — fal
endpoints, for example, only admit image / video / audio parts that their
SDK input type actually declares fields for.

Prompt text is always sent **verbatim** — the SDK never injects or rewrites
in-prompt referencing markers. Some fal video endpoints have their own
referencing syntax you can write directly in your text (e.g. Kling v3
elements as `@Element1`, Seedance 2.0 reference-to-video as `@Image1` /
`@Video1` / `@Audio1`, 1-indexed by input order); Veo and Sora take
reference images as plain inputs with naturally written prompts. See
[Referencing images from your prompt](./image-generation.md#referencing-images-from-your-prompt)
for the per-provider table.

### Role hints

Each `ImagePart` can carry an optional `metadata.role` hint that the
adapter uses to route the input to the provider-specific field:

| Role            | Maps to                                                       |
| --------------- | ------------------------------------------------------------- |
| `'start_frame'` | fal `start_image_url`, Veo input `image` (positional default for the first input) |
| `'end_frame'`   | fal `end_image_url`, Veo `lastFrame`                          |
| `'reference'`   | fal `reference_image_urls`, Veo `referenceImages`             |
| `'character'`   | Same as `'reference'` — character consistency images                    |

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

### Provider support

| Provider     | Image-to-Video Behavior                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| **OpenAI**   | Sora-2 / Sora-2-Pro → the image part goes to `input_reference`; flattened text is the prompt. Single image only — throws if more than one. |
| **fal.ai**   | Field names resolve per endpoint from a map generated from the fal SDK's endpoint types — e.g. `role: 'start_frame'` lands on `image_url` for Kling/Veo image-to-video, `first_frame_url` for first-last-frame endpoints, and `start_image_url` otherwise. Defaults: single input → `image_url` (start frame); `role: 'end_frame'` → `end_image_url`; `role: 'reference'` / `'character'` → `reference_image_urls`. Override per-endpoint via `modelOptions` — the media-conditioning fields are typed optional there (even when the endpoint requires them) since they usually arrive as prompt parts. |
| **Gemini**   | Veo → the first un-roled / `'start_frame'` image becomes the input image; `'end_frame'` → `lastFrame`; `'reference'` / `'character'` → `referenceImages` (asset references, Veo 3.1). Throws on multiple starting images. |

Adapters whose underlying API can't accept image inputs throw a clear
runtime error so calls fail fast.

### Supported Sizes

Based on [OpenAI API docs](https://platform.openai.com/docs/api-reference/videos/create):

| Size | Description |
|------|-------------|
| `1280x720` | 720p landscape (16:9) - default |
| `720x1280` | 720p portrait (9:16) |
| `1792x1024` | Wide landscape |
| `1024x1792` | Tall portrait |

### Supported Durations

The API uses the `seconds` parameter. Allowed values:

- `4` seconds
- `8` seconds (default)
- `12` seconds

## Model Options

### OpenAI Model Options

Based on the [OpenAI Sora API](https://platform.openai.com/docs/api-reference/videos/create):

```typescript
import { generateVideo } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

const { jobId } = await generateVideo({
  adapter: openaiVideo('sora-2'),
  prompt: 'A beautiful sunset over the ocean',
  size: '1280x720',      // '1280x720', '720x1280', '1792x1024', '1024x1792'
  duration: 8,           // 4, 8, or 12 seconds
  modelOptions: {
    size: '1280x720',    // Alternative way to specify size
    seconds: '8',        // Alternative way to specify duration ('4' | '8' | '12')
  }
})
```

### Google Veo (Gemini) Model Options

Veo runs on Google's long-running operations API. The adapter starts the
operation, and `getVideoJobStatus` polls it until the video is ready:

```typescript ignore
import { generateVideo } from '@tanstack/ai'
import { geminiVideo } from '@tanstack/ai-gemini'

const { jobId } = await generateVideo({
  adapter: geminiVideo('veo-3.1-generate-preview'),
  prompt: 'A close-up of a luthier carving a guitar neck',
  size: '16:9', // aspect ratio: '16:9' or '9:16'
  duration: 8, // typed per model — see below
  modelOptions: {
    resolution: '1080p', // '720p' (default), '1080p', '4k' (Veo 3.1 only)
    negativePrompt: 'cartoon, low quality',
    generateAudio: true, // Veo 3+ generates synchronized audio
  },
})
```

#### Typed durations

Each Veo model accepts a fixed set of durations, enforced at compile time on
the `duration` option:

| Model | `duration` values (seconds) |
|-------|------------------------------|
| `veo-3.1-generate-preview` | `4`, `6`, `8` |
| `veo-3.1-fast-generate-preview` | `4`, `6`, `8` |
| `veo-3.0-generate-001` | `4`, `6`, `8` |
| `veo-3.0-fast-generate-001` | `4`, `6`, `8` |
| `veo-2.0-generate-001` | `5`, `6`, `8` |

If you have raw seconds (for example from a UI slider), coerce them with
`snapDuration`, or inspect the full set with `availableDurations`:

```typescript ignore
import { generateVideo } from '@tanstack/ai'
import { geminiVideo } from '@tanstack/ai-gemini'

const adapter = geminiVideo('veo-3.0-generate-001')

adapter.availableDurations() // { kind: 'discrete', values: [4, 6, 8] }
adapter.snapDuration(7) // 6 — closest valid duration

await generateVideo({
  adapter,
  prompt: 'A timelapse of a city skyline at dusk',
  duration: adapter.snapDuration(7),
})
```

Adapters that haven't declared a per-model duration map keep the plain
`duration?: number` typing, return `{ kind: 'none' }` from
`availableDurations()`, and return `undefined` from `snapDuration()`.

> **Note:** The video URL returned for Veo jobs is served by the Gemini
> Files API and requires your API key to download (send it as an
> `x-goog-api-key` header or `key` query parameter).

## Response Types

> **Note:** The interfaces below are the underlying adapter-level types. The `getVideoJobStatus()` helper returns a single merged object, `{ status, progress?, url?, error?, usage? }` — it does not return `jobId` or `expiresAt`.

### VideoJobResult (from create)

```typescript
interface VideoJobResult {
  jobId: string    // Unique job identifier for polling
  model: string    // Model used for generation
}
```

### VideoStatusResult (from status)

```typescript
interface VideoStatusResult {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number  // 0-100, if available
  error?: string     // Error message if failed
}
```

### VideoUrlResult (from url)

```typescript
import type { TokenUsage } from '@tanstack/ai'

interface VideoUrlResult {
  jobId: string
  url: string        // URL to download/stream the video
  expiresAt?: Date   // When the URL expires
  // Usage for the completed generation, when the adapter reports it. fal
  // populates `usage.unitsBilled` from its `x-fal-billable-units` header.
  usage?: TokenUsage
}
```

> **Cost tracking (fal):** fal bills media generation by usage-based units
> rather than tokens. The fal adapters surface the real billed quantity as
> `usage.unitsBilled` (denominated in the endpoint's priced unit). Combine it
> with the endpoint's unit price from
> `GET https://api.fal.ai/v1/models/pricing?endpoint_id=…` to compute the exact
> cost (`unitsBilled * unitPrice`). The same `usage.unitsBilled` is surfaced
> on image, audio, speech, and transcription results.

## Model Variants

| Model | Description | Use Case |
|-------|-------------|----------|
| `sora-2` | Faster generation, good quality | Rapid iteration, prototyping |
| `sora-2-pro` | Higher quality, slower | Production-quality output |

## Error Handling

Video generation can fail for various reasons. Always implement proper error handling:

```typescript
import { generateVideo, getVideoJobStatus } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

try {
  const { jobId } = await generateVideo({
    adapter: openaiVideo('sora-2'),
    prompt: 'A scene',
  })

  // Poll for status...
  const status = await getVideoJobStatus({
    adapter: openaiVideo('sora-2'),
    jobId,
  })

  if (status.status === 'failed') {
    console.error('Generation failed:', status.error)
    // Handle failure (e.g., retry, notify user)
  }
} catch (error) {
  if (error instanceof Error) {
    if (error.message.includes('Video generation API is not available')) {
      console.error('Sora API access may be required. Check your OpenAI account.')
    } else if (error.message.includes('rate limit')) {
      console.error('Rate limited. Please wait before trying again.')
    } else {
      console.error('Unexpected error:', error)
    }
  }
}
```

## Rate Limits and Quotas

> **⚠️ Note:** Rate limits and quotas for video generation are subject to change and may vary by account tier.

Typical considerations:
- Video generation is computationally expensive
- Concurrent job limits may apply
- Monthly generation quotas may exist
- Longer/higher-quality videos consume more quota

Check the [OpenAI documentation](https://platform.openai.com/docs) for current limits.

## Environment Variables

The video adapters use the same environment variables as the other adapters
for their provider:

- `OPENAI_API_KEY`: Your OpenAI API key (Sora)
- `GOOGLE_API_KEY` or `GEMINI_API_KEY`: Your Google API key (Veo)

## Explicit API Keys

For production use or when you need explicit control:

```typescript
import { createOpenaiVideo } from '@tanstack/ai-openai'

const adapter = createOpenaiVideo('sora-2', 'your-openai-api-key')
```

## Differences from Image Generation

| Aspect | Image Generation | Video Generation |
|--------|-----------------|------------------|
| API Type | Synchronous | Jobs/Polling |
| Return Type | `ImageGenerationResult` | `VideoJobResult` → `VideoStatusResult` → `VideoUrlResult` |
| Wait Time | Seconds | Minutes |
| Multiple Outputs | `numberOfImages` option | Not supported |
| Options Field | `prompt`, `size`, `numberOfImages` | `prompt`, `size`, `duration` |

## Known Limitations

> **⚠️ These limitations are subject to change as the feature evolves.**

1. **API Availability**: The Sora API may not be available in all OpenAI accounts
2. **Generation Time**: Video generation can take several minutes
3. **URL Expiration**: Generated video URLs may expire after a certain period
4. **No Real-time Progress**: Progress updates may be limited or delayed
5. **Audio Limitations**: Audio generation support may be limited
6. **Prompt Length**: Long prompts may be truncated

## Best Practices

1. **Implement Timeouts**: Set reasonable timeouts for the polling loop
2. **Handle Failures Gracefully**: Have fallback behavior for failed generations
3. **Cache URLs**: Store video URLs and check expiration before re-fetching
4. **User Feedback**: Show clear progress indicators during generation
5. **Validate Prompts**: Check prompt length and content before submission
6. **Monitor Usage**: Track generation usage to avoid hitting quotas

## Future Considerations

This feature is experimental. Future versions may include:

- Additional video models and providers
- Streaming progress updates
- Video editing and manipulation
- Audio track generation
- Batch video generation
- Custom style/aesthetic controls

Stay tuned to the [TanStack AI changelog](https://github.com/TanStack/ai/blob/main/CHANGELOG.md) for updates.

