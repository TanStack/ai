---
title: Video Generation
id: video-generation
order: 6
description: "Make a video from a text prompt or a start image with OpenAI Sora, Google Veo, Gemini Omni Flash, xAI Grok Imagine, BytePlus Seedance, OpenRouter, or fal.ai. Show live progress while the job runs."
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
  - openrouter
  - fal
  - generateVideo
  - jobs api
  - experimental
  - text-to-video
  - image-to-video
---

You want a short video clip from a prompt. A video takes minutes to make. One plain request times out, and your users see a frozen button. `generateVideo()` starts a video job, watches it for you, and streams the progress to the browser.

> [!WARNING]
> Video generation is experimental. The API can change in a future version. Provider access, pricing, rate limits, and quotas also change. For example, the OpenAI Sora API can need organization verification.

## Generate your first video

You need a React app with a server route, and an OpenAI API key with Sora access. The setup takes about 5 minutes. The video itself takes a few minutes.

1. Install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openai

<!-- ::end:tabs -->

2. Put your key in `.env`:

```bash
OPENAI_API_KEY=sk-...
```

3. Add a `POST` route at `/api/generate/video`:

```typescript
import {
  generateVideo,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { input } = await generationParamsFromRequest('video', request)
  if (typeof input.prompt !== 'string') {
    return new Response('Send a text prompt.', { status: 400 })
  }

  const stream = generateVideo({
    adapter: openaiVideo('sora-2'),
    prompt: input.prompt,
    stream: true,
  })
  return toServerSentEventsResponse(stream)
}
```

4. Call the route from a component, and show the progress:

```tsx
import { fetchServerSentEvents, useGenerateVideo } from '@tanstack/ai-react'

export function VideoGenerator() {
  const { generate, result, videoStatus, isLoading, error, stop } =
    useGenerateVideo({
      connection: fetchServerSentEvents('/api/generate/video'),
    })

  return (
    <div>
      <button
        onClick={() =>
          generate({ prompt: 'A golden retriever playing in sunflowers' })
        }
        disabled={isLoading}
      >
        {isLoading ? 'Generating...' : 'Generate video'}
      </button>

      {isLoading && (
        <div>
          <p>Status: {videoStatus?.status ?? 'starting...'}</p>
          {videoStatus?.progress != null && (
            <progress value={videoStatus.progress} max={100} />
          )}
          <button onClick={stop}>Cancel</button>
        </div>
      )}

      {error && <p role="alert">Error: {error.message}</p>}

      {result && <video src={result.url} controls width={640} />}
    </div>
  )
}
```

Click **Generate video**. The status changes from `pending` to `processing`, then the video player shows the finished clip.

## How it works

Most video providers work with jobs:

1. **Create a job.** The provider takes the prompt and returns a job id.
2. **Poll the job.** The server asks the provider for the job status until the job is done or fails.
3. **Get the video.** When the job is done, the provider gives a URL for the video.

With `stream: true`, `generateVideo()` does all three steps on the server. It sends an event for each step:

- `video:job:created` when the provider accepts the job. The hook sets `jobId`.
- `video:status` after each poll. The hook sets `videoStatus`.
- `generation:result` when the video is ready. The hook sets `result`.

By default, the server polls every 2 seconds and stops after 10 minutes. Set `pollingInterval` and `maxDuration` (both in milliseconds) to change this:

```typescript
import { generateVideo } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

const stream = generateVideo({
  adapter: openaiVideo('sora-2'),
  prompt: 'A cat playing piano in a jazz bar',
  stream: true,
  pollingInterval: 3000,
  maxDuration: 900_000,
})
```

`stop()` on the hook only closes the stream in the browser. The provider job can continue to run.

The `jobId`, `videoStatus`, `onJobCreated`, and `onStatusUpdate` hook values are listed in [Generation Hooks](./generation-hooks#usegeneratevideo). The other transports (a server function that returns JSON, or one that returns an SSE `Response`) are in [Generations](./generations#transports-in-full).

For a stream that plays while it generates, and that you can steer with a new prompt, use [Live Generation](./live-generation) or [World Generation](./world-generation). `generateVideo()` always makes a finished file.

## Pick a provider

Swap the adapter in step 3 to use another provider. Each adapter reads its key from the environment.

| Provider | Adapter | Newest models | Key |
| --- | --- | --- | --- |
| OpenAI | `openaiVideo` from `@tanstack/ai-openai` | `sora-2`, `sora-2-pro` | `OPENAI_API_KEY` |
| Google Gemini | `geminiVideo` from `@tanstack/ai-gemini` | `veo-3.1-generate-preview`, `gemini-omni-1.1-flash` | `GOOGLE_API_KEY` or `GEMINI_API_KEY` |
| xAI Grok | `grokVideo` from `@tanstack/ai-grok` | `grok-imagine-video-1.5`, `grok-imagine-video` | `XAI_API_KEY` |
| BytePlus | `byteplusVideo` from `@tanstack/ai-byteplus` | `dreamina-seedance-2-5-260628` | `ARK_API_KEY` or `BYTEPLUS_API_KEY` |
| OpenRouter | `openRouterVideo` from `@tanstack/ai-openrouter` | `bytedance/seedance-2.5`, `google/veo-3.1`, and more | `OPENROUTER_API_KEY` |
| fal.ai | `falVideo` from `@tanstack/ai-fal` | Kling, Veo, Luma, MiniMax, Hunyuan, WAN, and more | `FAL_KEY` |

What each provider adds:

- **Veo** has typed durations and a 1080p or 4k `resolution`. **Gemini Omni Flash** can edit a video it made before.
- **Grok Imagine** takes reference images, and `grok-imagine-video` can edit or extend a clip.
- **Seedance** takes start and end frames, plus reference images, video, and audio.

The options for each provider, with full samples, are in [Video Generation: Advanced](./video-generation-advanced#provider-options).

## Options

| Option | Type | Description |
| --- | --- | --- |
| `adapter` | `VideoAdapter` | The video adapter and model (required) |
| `prompt` | `string \| MediaPromptPart[]` | What the video shows (required). An array of text and media parts works on models that take a start frame or references. See [Start from an image](#start-from-an-image). |
| `size` | `string` | The video size. The format depends on the provider, for example `"1280x720"` or `"16:9_720p"`. |
| `duration` | `number` or a provider string | The length. Each model accepts its own values. |
| `modelOptions` | `object` | Options for this model only |
| `stream` | `boolean` | `true` runs the full job on the server and returns events |
| `pollingInterval` | `number` | Milliseconds between polls. Default `2000`. Only with `stream: true`. |
| `maxDuration` | `number` | Milliseconds before the run times out. Default `600000`. Only with `stream: true`. |

If you have raw seconds, for example from a slider, `adapter.snapDuration(seconds)` gives the closest value that the model accepts:

```typescript
import { generateVideo } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

const adapter = openaiVideo('sora-2')
const duration = adapter.snapDuration('6s') // "4"

if (duration !== undefined) {
  await generateVideo({
    adapter,
    prompt: 'A cat walking through fog',
    duration,
  })
}
```

Sora takes 4, 8, or 12 seconds. The size and duration values for every provider are in [Sizes and durations](./video-generation-advanced#sizes-and-durations).

## Start from an image

To animate a still, or to give the model a start frame, an end frame, or a reference, send the `prompt` as an array of parts:

```typescript
import { generateVideo } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'
import { base64Image } from './assets'

const { jobId } = await generateVideo({
  adapter: openaiVideo('sora-2'),
  prompt: [
    {
      type: 'text',
      content: 'Animate this still into a slow cinematic push-in with subtle motion',
    },
    {
      type: 'image',
      source: { type: 'data', value: base64Image, mimeType: 'image/png' },
    },
  ],
})
```

The accepted part types are narrowed per model at compile time. For example, a fal endpoint only accepts the image, video, or audio parts that its input type declares.

The SDK sends your prompt text exactly as you write it. Some endpoints have their own syntax to point at an input, for example `@Image1` on fal Seedance. See [Referencing images from your prompt](./image-generation.md#referencing-images-from-your-prompt) for the table per provider.

### Role hints

Set `metadata.role` on an image part to tell the adapter what the image is for. Parts without a role use their position: the first image is the start frame.

| Role | Maps to |
| --- | --- |
| `'start_frame'` | fal `start_image_url`, Veo input `image`, Seedance `first_frame`, OpenRouter `frame_images[]` with `frame_type: 'first_frame'` |
| `'end_frame'` | fal `end_image_url`, Veo `lastFrame`, Seedance `last_frame`, OpenRouter `frame_images[]` with `frame_type: 'last_frame'` |
| `'reference'` | fal `reference_image_urls`, Veo `referenceImages`, Seedance `reference_image`, OpenRouter `input_references[]` |
| `'character'` | Same as `'reference'`. Use it for images that keep a character the same. |

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

What each provider does with image inputs, and its limits, is in [Image-to-video support](./video-generation-advanced#image-to-video-support). An adapter whose API cannot take image inputs throws an error.

## Videos with no public URL

Some providers have no public URL for the finished video. The adapter then returns the video as a stream. The browser cannot play a stream, so your server must turn it into a URL.

This happens with these providers:

- **OpenRouter**: always. Its download URLs need your API key.
- **Lovable**: when the finished job has no URL.
- **OpenAI Sora**: when the finished job has no URL.

Without storage, TanStack AI keeps the full video in memory and sets `url` to a base64 `data:` URL. This works for short clips. A large video can use all the memory of a serverless runtime. A video of more than 10 MiB logs a warning.

To keep memory flat, add `withGenerationPersistence` with an `artifactUrl`. It pipes the stream into your blob store and sets `url` on the result. The server never holds the full video in memory:

```typescript
import {
  generateVideo,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openRouterVideo } from '@tanstack/ai-openrouter'
import { withGenerationPersistence } from '@tanstack/ai-persistence'
import { persistence } from './persistence'

export async function POST(request: Request) {
  const { input } = await generationParamsFromRequest('video', request)
  if (typeof input.prompt !== 'string') {
    return new Response('Send a text prompt.', { status: 400 })
  }

  const stream = generateVideo({
    adapter: openRouterVideo('google/veo-3.1'),
    prompt: input.prompt,
    stream: true,
    threadId: 'videos',
    middleware: [
      withGenerationPersistence(persistence, {
        // The URL of your route that serves the stored bytes.
        artifactUrl: (ref) => `/api/artifacts/${ref.artifactId}`,
      }),
    ],
  })

  return toServerSentEventsResponse(stream)
}
```

`./persistence` is your persistence object. It needs the `generationRuns`, `artifacts`, and `blobs` stores. [Keep generated files](../persistence/keep-generated-files) shows how to build it, and how to write the route that serves the bytes.

The hook needs no change. `result.url` is now a URL on your own origin, so `<video src={result.url} />` plays it.

Providers that return a public URL need no storage to play the video. Persistence still copies those videos into your store, so you keep them after the provider URL expires.

## Keep videos after a reload

A video run takes minutes, so a page reload in the middle is likely. [Generation Persistence](../persistence/generation-persistence) keeps a record of each run:

- After a reload, the hook shows the last known status and result of the run, not an empty form.
- If the run still streams from a durable stream on the server, the hook attaches to it again and finishes it.
- Otherwise the hook restores the record. The provider work does not restart.

Provider video URLs expire. To keep the finished clip, [save its bytes to your own storage](../persistence/keep-generated-files).

## Advanced

Run the job without streaming, the options for each provider, the result types, and error handling are in [Video Generation: Advanced](./video-generation-advanced).
