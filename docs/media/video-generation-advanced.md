---
title: "Video Generation: Advanced"
id: video-generation-advanced
order: 6.1
description: "Run a video job without streaming, the size, duration, and model options of every video provider, image-to-video support, result types, and error handling."
keywords:
  - tanstack ai
  - video generation
  - getVideoJobStatus
  - sora
  - veo
  - omni flash
  - grok imagine
  - seedance
  - openrouter
  - fal
  - snapDuration
---

This page is the reference for [Video Generation](./video-generation). Start there for the quick setup. Come here when you need to run the job yourself, or when you need the options of one provider.

## Run the job yourself

With `stream: true`, `generateVideo()` creates the job and polls it for you. Without it, `generateVideo()` only creates the job and returns `{ jobId, model }`. You then poll with `getVideoJobStatus()`.

```typescript
import { generateVideo, getVideoJobStatus } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

async function createAndAwaitVideo(prompt: string) {
  const adapter = openaiVideo('sora-2')

  // 1. Create the job
  const { jobId } = await generateVideo({
    adapter,
    prompt,
    size: '1280x720',
    duration: 8,
  })

  // 2. Poll until the job is done or fails
  let status = await getVideoJobStatus({ adapter, jobId })
  while (status.status !== 'completed' && status.status !== 'failed') {
    await new Promise((resolve) => setTimeout(resolve, 5000))
    status = await getVideoJobStatus({ adapter, jobId })
    console.log(`Status: ${status.status} (${status.progress ?? 0}%)`)
  }

  // 3. Read the URL
  if (status.status === 'failed' || !status.url) {
    throw new Error(status.error || 'Video generation failed')
  }
  return status.url
}

const videoUrl = await createAndAwaitVideo('A cat playing piano in a jazz bar')
console.log('Video ready:', videoUrl)
```

`getVideoJobStatus()` returns one object: `{ status, progress?, url?, error?, usage? }`. `status` is `'pending'`, `'processing'`, `'completed'`, or `'failed'`. `progress` is from 0 to 100, when the provider reports it. `url` is set when the job is complete.

If you use middleware, such as `withGenerationPersistence`, pass the same `middleware` and `threadId` to `generateVideo()` and to `getVideoJobStatus()`. The submit call only opens the run. The poll that sees the finished job closes the run and records the result.

### Server function that polls (fetcher)

A TanStack Start server function can run the full loop and return the finished result as JSON:

```typescript ignore
// lib/server-functions.ts
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

    if (status.status === 'failed' || !status.url) {
      throw new Error(status.error || 'Video generation failed')
    }
    return { jobId, status: 'completed' as const, url: status.url }
  })
```

```tsx
import { useGenerateVideo } from '@tanstack/ai-react'
import { generateVideoFn } from '../lib/server-functions'

export function VideoGenerator() {
  const { generate, result, isLoading } = useGenerateVideo({
    fetcher: (input) => generateVideoFn({ data: input }),
  })
  // Render the same way as in the quick setup.
}
```

> [!NOTE]
> With a fetcher that returns JSON, there is no stream. As a result, `jobId` and `videoStatus` do not update while the job runs. For progress, use a streaming route or a server function that streams.

### Server function that streams (fetcher + Response)

Return an SSE `Response` from the server function. You get typed input, and `jobId` and `videoStatus` update while the job runs:

```typescript ignore
// lib/server-functions.ts
import { createServerFn } from '@tanstack/react-start'
import { generateVideo, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

export const generateVideoStreamFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { prompt: string }) => data)
  .handler(({ data }) => {
    return toServerSentEventsResponse(
      generateVideo({
        adapter: openaiVideo('sora-2'),
        prompt: data.prompt,
        stream: true,
      }),
    )
  })
```

```tsx
import { useGenerateVideo } from '@tanstack/ai-react'
import { generateVideoStreamFn } from '../lib/server-functions'

export function VideoGenerator() {
  const { generate, result, jobId, videoStatus, isLoading } = useGenerateVideo({
    fetcher: (input) => generateVideoStreamFn({ data: input }),
  })
  // Render the same way as in the quick setup.
}
```

## Image-to-video support

What each provider does with image parts in the `prompt`. The roles are in [Role hints](./video-generation#role-hints).

- **OpenAI**: Sora-2 and Sora-2-Pro send the image part to `input_reference`. The text parts become the prompt. Only one image is allowed. More than one throws.
- **fal.ai**: the field names come from a map that is generated from the endpoint types of the fal SDK. For example, `role: 'start_frame'` goes to `image_url` on Kling and Veo image-to-video, to `first_frame_url` on first-last-frame endpoints, and to `start_image_url` on other endpoints.
- **Gemini Veo**: the first image with no role, or with `'start_frame'`, becomes the input image. `'end_frame'` goes to `lastFrame`. `'reference'` and `'character'` go to `referenceImages` (asset references, Veo 3.1). More than one start image throws.
- **BytePlus Seedance**: see the list below.
- **OpenRouter**: see the list below.

The fal defaults, when the map has no entry for the endpoint:

- One input goes to `image_url`, as the start frame.
- `role: 'end_frame'` goes to `end_image_url`.
- `role: 'reference'` and `'character'` go to `reference_image_urls`.
- To set a field for one endpoint, use `modelOptions`. The media fields there are typed optional, even when the endpoint requires them, because they usually come from prompt parts.

BytePlus Seedance:

- One image with no role, or with `'start_frame'`, becomes `first_frame`.
- `'end_frame'` goes to `last_frame`. It needs a first frame next to it. `seedance-1-0-pro-fast-251015` rejects it.
- `'reference'` and `'character'` go to `reference_image`. Video parts go to `reference_video`, and audio parts go to `reference_audio`. This works on Seedance 2.5 and the 2.0 family. Seedance 2.5 also accepts a reference that is only audio.
- Frame roles and reference roles are two separate modes. A request that mixes them throws.

OpenRouter:

- `role: 'start_frame'` and `'end_frame'` go to `frame_images[]` with `frame_type: 'first_frame'` or `'last_frame'`. An image with no role is the start frame.
- `role: 'reference'` and `'character'` go to `input_references[]`.
- You can send at most one start frame and one end frame. The adapter checks the frame roles against the `supported_frame_images` metadata of the model. For example, Hailuo only takes a first frame.
- If you send frame images and references together, OpenRouter treats the request as image-to-video. The references then have a lower priority.
- `url` sources pass through as they are. `data` sources become data URIs. OpenRouter does not follow redirects or pass bot checks, so use URLs that it can get directly.

## Sizes and durations

### OpenAI Sora

Sizes, from the [OpenAI API docs](https://platform.openai.com/docs/api-reference/videos/create):

| Size | Description |
| --- | --- |
| `1280x720` | 720p landscape (16:9). The default. |
| `720x1280` | 720p portrait (9:16) |
| `1792x1024` | Wide landscape |
| `1024x1792` | Tall portrait |

Durations are 4, 8, or 12 seconds. You can write each one as a number, a numeric string, or a seconds template:

- `4`, `"4"`, or `"4s"` (the default)
- `8`, `"8"`, or `"8s"`
- `12`, `"12"`, or `"12s"`

The adapter sends `"4"`, `"8"`, or `"12"` to the API.

`snapDuration()` rules for Sora:

- When two values are at the same distance, the lower value wins. `6` and `"6s"` snap to `"4"`. `7` snaps to `"8"`.
- `"auto"` returns `undefined`, because Sora does not list `"auto"`.

### Typed durations on other adapters

Adapters that declare durations for each model narrow `duration` at compile time. They also have two helpers:

- `availableDurations()` returns the set, for example `{ kind: 'discrete', values: [4, 6, 8] }` or `{ kind: 'range', min: 3, max: 10, unit: 'seconds' }`.
- `snapDuration(value)` returns the closest valid value.

An adapter with no duration map keeps `duration?: number`. Its `availableDurations()` returns `{ kind: 'none' }`, and its `snapDuration()` returns `undefined`. fal is different: its `duration` is typed from the `EndpointTypeMap` of `@fal-ai/client`, even when the runtime map has no entry.

## Provider options

### OpenAI (Sora)

From the [OpenAI Sora API](https://platform.openai.com/docs/api-reference/videos/create):

```typescript
import { generateVideo } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

const { jobId } = await generateVideo({
  adapter: openaiVideo('sora-2'),
  prompt: 'A beautiful sunset over the ocean',
  size: '1280x720', // '1280x720', '720x1280', '1792x1024', '1024x1792'
  duration: '8s', // 4, "4", or "4s" (same forms for 8 and 12)
  modelOptions: {
    size: '1280x720', // another way to set the size
    seconds: '8', // API value: "4" | "8" | "12"
  },
})
```

| Model | Description | Use it for |
| --- | --- | --- |
| `sora-2` | Faster, good quality | Fast iteration and prototypes |
| `sora-2-pro` | Higher quality, slower | Production output |

### Google Veo (Gemini)

Veo runs on the long-running operations API of Google. The adapter starts the operation, and `getVideoJobStatus` polls it until the video is ready:

```typescript ignore
import { generateVideo } from '@tanstack/ai'
import { geminiVideo } from '@tanstack/ai-gemini'

const { jobId } = await generateVideo({
  adapter: geminiVideo('veo-3.1-generate-preview'),
  prompt: 'A close-up of a luthier carving a guitar neck',
  size: '16:9', // aspect ratio: '16:9' or '9:16'
  duration: 8, // typed per model, see below
  modelOptions: {
    resolution: '1080p', // '720p' (default), '1080p', '4k' (Veo 3.1 only)
    negativePrompt: 'cartoon, low quality',
    generateAudio: true, // Veo 3 and later make synchronized audio
  },
})
```

Each Veo model accepts a fixed set of durations. TypeScript checks them on the `duration` option:

| Model | `duration` values (seconds) |
| --- | --- |
| `veo-3.1-generate-preview` | `4`, `6`, `8` |
| `veo-3.1-fast-generate-preview` | `4`, `6`, `8` |
| `veo-3.1-lite-generate-preview` | `4`, `6`, `8` |

```typescript ignore
import { generateVideo } from '@tanstack/ai'
import { geminiVideo } from '@tanstack/ai-gemini'

const adapter = geminiVideo('veo-3.1-lite-generate-preview')

adapter.availableDurations() // { kind: 'discrete', values: [4, 6, 8] }
adapter.snapDuration(7) // 6, the closest valid duration

await generateVideo({
  adapter,
  prompt: 'A timelapse of a city skyline at dusk',
  duration: adapter.snapDuration(7),
})
```

> [!NOTE]
> The Gemini Files API serves the video URL of a Veo job. To download it, send your API key as an `x-goog-api-key` header or as a `key` query parameter.

### Gemini Omni Flash (Interactions API)

Gemini Omni Flash (`gemini-omni-1.1-flash`) is a multimodal video model from Google that can edit by conversation. It only runs on the [Interactions API](https://ai.google.dev/gemini-api/docs/omni). The same `geminiVideo()` adapter routes it automatically:

- `generateVideo` creates a background interaction.
- `getVideoJobStatus` polls it by id.
- The finished clip comes back inline as a `data:video/mp4;base64,...` URL. When Google sends a reference instead, the Files API URI passes through. Like Veo, it needs your API key to download.

Durations:

- `duration` accepts any value from 3 to 10 seconds, fractions included. The default is 10 seconds.
- `availableDurations()` returns `{ kind: 'range', min: 3, max: 10, unit: 'seconds' }`.
- A `duration` out of range is rejected when the job is created.
- `snapDuration(n)` clamps raw seconds into the range and rounds to whole seconds.

`size` is an `aspectRatio_resolution` template, the same shape as Grok and BytePlus. Bare `'16:9'` or `'9:16'` uses the 720p default. Add a suffix for the other tiers: `'360p'`, `'1080p'`, or `'4k'`.

```typescript ignore
import { generateVideo, getVideoJobStatus } from '@tanstack/ai'
import { geminiVideo } from '@tanstack/ai-gemini'

const adapter = geminiVideo('gemini-omni-1.1-flash')

const { jobId } = await generateVideo({
  adapter,
  prompt: 'A woman playing violin outdoors at golden hour',
  size: '9:16_1080p', // '16:9' | '9:16', optional _360p/_720p/_1080p/_4k
  duration: 6, // 3-10 seconds. Leave it out for the 10s default.
})

const status = await getVideoJobStatus({ adapter, jobId })
// status.url is 'data:video/mp4;base64,...' when the job is complete
```

Omni sends image and video prompt parts as content blocks: images first, then videos, then the text prompt. It does not use the `metadata.role` routing of Veo. You can give it stills or short reference clips:

- `data` sources go inline as base64.
- `url` sources pass through as they are. The adapter never downloads them, so use Gemini Files API URIs. Upload large media through the Files API first.

To edit a video, pass the interaction id of an earlier generation (its `jobId`) as `modelOptions.previous_interaction_id`. Then describe the change. The model keeps everything you do not mention:

```typescript ignore
import { generateVideo } from '@tanstack/ai'
import { geminiVideo } from '@tanstack/ai-gemini'

const adapter = geminiVideo('gemini-omni-1.1-flash')

// Turn 1: generate
const first = await generateVideo({
  adapter,
  prompt: 'A woman playing violin outdoors at golden hour',
})

// Poll first.jobId until it is complete, then:

// Turn 2: edit the result
const second = await generateVideo({
  adapter,
  prompt: 'Make the violin invisible',
  modelOptions: { previous_interaction_id: first.jobId },
})
```

`modelOptions` also passes through the request fields of the Interactions API. For example, `generation_config.video_config.task` sets the task mode to `'text_to_video'`, `'image_to_video'`, `'reference_to_video'`, or `'edit'`. Without it, the model picks the mode.

### Grok (xAI Imagine)

From the [xAI video generation API](https://docs.x.ai/developers/model-capabilities/video/generation). There are two models:

- `grok-imagine-video-1.5`: the default that xAI recommends. It makes native 1080p from text. It also takes reference images. It has no video input.
- `grok-imagine-video` (v1.0): the only model that can edit or extend a clip.

Both do text-to-video and image-to-video. `size` is an `aspectRatio_resolution` template, like the Grok Imagine image models. Clips are 1 to 15 seconds long.

Text-to-video:

```typescript
import { generateVideo } from '@tanstack/ai'
import { grokVideo } from '@tanstack/ai-grok'

const { jobId } = await generateVideo({
  adapter: grokVideo('grok-imagine-video-1.5'),
  prompt: 'A beautiful sunset over the ocean',
  size: '16:9_720p', // aspect ratio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '3:2' | '2:3'
  // resolution (optional suffix): '480p' | '720p' | '1080p'
  duration: 5, // whole seconds, 1-15
  modelOptions: {
    aspect_ratio: '16:9', // another way to set the aspect ratio
    resolution: '720p', // another way to set the resolution
    duration: 5, // another way to set the duration
  },
})
```

Image-to-video: add an `image` prompt part as the start frame. The servers of xAI download `url` sources, so the URL must be public. For a base64 start frame, use a `data` source:

```typescript
import { generateVideo } from '@tanstack/ai'
import { grokVideo } from '@tanstack/ai-grok'

const { jobId } = await generateVideo({
  adapter: grokVideo('grok-imagine-video-1.5'),
  prompt: [
    { type: 'text', content: 'Slowly pan out as the waves roll in' },
    {
      type: 'image',
      source: { type: 'url', value: 'https://example.com/still.png' },
    },
  ],
  size: '16:9_720p',
  duration: 5,
})
```

Reference-to-video works on `grok-imagine-video-1.5` only. The output is at most 720p.

- Image parts with `metadata.role: 'reference'` or `'character'` become `reference_images`. Point at them in the prompt as `<IMAGE_0>`, `<IMAGE_1>`, and so on.
- `modelOptions.reference_audios` takes up to 3 preset TTS voices. Point at them as `<AUDIO_0>`, and so on.

```typescript
import { generateVideo } from '@tanstack/ai'
import { grokVideo } from '@tanstack/ai-grok'

const { jobId } = await generateVideo({
  adapter: grokVideo('grok-imagine-video-1.5'),
  prompt: [
    { type: 'text', content: '<IMAGE_0> waves at the camera while <AUDIO_0> says hello' },
    {
      type: 'image',
      source: { type: 'url', value: 'https://example.com/character.png' },
      metadata: { role: 'reference' },
    },
  ],
  size: '16:9_720p',
  modelOptions: { reference_audios: [{ voice_id: 'eve' }] },
})
```

Edit and extend work on `grok-imagine-video` only. Send the source clip as a `video` prompt part, and set `modelOptions.mode`:

- `'edit'` (`/v1/videos/edits`) changes only what the prompt asks for. The output keeps the duration, aspect ratio, and resolution of the source, up to 720p.
- `'extend'` (`/v1/videos/extensions`) continues the clip. Here `duration` is the length of the added part, not the total length.
- In both modes, the output keeps the properties of the source clip. As a result, the adapter rejects `size`, `aspect_ratio`, and `resolution`. In edit mode it also rejects `duration`.
- On `grok-imagine-video-1.5`, the adapter rejects a source video part and `mode`.

```typescript
import { generateVideo } from '@tanstack/ai'
import { grokVideo } from '@tanstack/ai-grok'

const { jobId } = await generateVideo({
  adapter: grokVideo('grok-imagine-video'),
  prompt: [
    { type: 'text', content: 'The camera keeps panning right across the bay' },
    {
      type: 'video',
      source: { type: 'url', value: 'https://example.com/clip.mp4' },
    },
  ],
  duration: 5, // 'extend' mode: seconds added to the clip, not the total
  modelOptions: { mode: 'extend' },
})
```

Both models accept any whole second from 1 to 15. The adapter does not reject a raw `duration`. It clamps the value to `[1, 15]` and rounds it to the nearest second:

```typescript
import { grokVideo } from '@tanstack/ai-grok'

const adapter = grokVideo('grok-imagine-video-1.5')

adapter.availableDurations() // { kind: 'range', min: 1, max: 15, step: 1, unit: 'seconds' }
adapter.snapDuration(2.5) // 3
adapter.snapDuration(99) // 15
```

Generated clips have an audio track. When the job is complete, the result has two usage fields:

- `usage.billed`: `{ quantity, unit: 'seconds' }`, the billed seconds of video.
- `usage.cost`: the exact cost in USD, as the API returns it.

### BytePlus (Seedance)

Seedance uses aspect-ratio sizes, like Grok Imagine. `size` takes a `ratio` or a `ratio_resolution` template:

- Ratios: `16:9`, `9:16`, `4:3`, `3:4`, `1:1`, `21:9`, and `adaptive`.
- Resolutions: `480p`, `720p`, and `1080p`. `dreamina-seedance-2-0-260128` also takes `4k`.
- Seedance 2.5 (`dreamina-seedance-2-5-260628`) takes 480p, 720p, and 1080p, and runs up to 30 seconds.
- No Seedance model has a 2K tier.

```typescript
import { generateVideo } from '@tanstack/ai'
import { byteplusVideo } from '@tanstack/ai-byteplus'

const { jobId } = await generateVideo({
  adapter: byteplusVideo('dreamina-seedance-2-5-260628'),
  prompt: 'A beautiful sunset over the ocean',
  size: '16:9_720p',
  duration: 5,
  modelOptions: {
    seed: 42,
    generate_audio: true,
    priority: 5, // Seedance 2.5 and the 2.0 family: queue priority, 0-9
  },
})
```

Options depend on the model, and Ark checks them on the server. Ark rejects a field that does not apply with a `400`. It does not ignore the field.

| Option | Models |
| --- | --- |
| `service_tier`, `camera_fixed` | Seedance 1.x only |
| `frames` | The 1.0-pro models |
| `draft` | 1.5-pro |
| `priority` | Seedance 2.5 and the 2.0 family |
| `duration: -1` (the model picks) | 2.5, 2.0, and 1.5-pro |

| Model | Durations |
| --- | --- |
| Seedance 2.5 | 4 to 30 seconds |
| 2.0 family | 4 to 15 seconds |
| 1.5-pro | 4 to 12 seconds |
| 1.0-pro models | 2 to 12 seconds |

Seedance video URLs expire 24 hours after the task is complete. BytePlus keeps the task record for seven days. Store the bytes, not the link. Completed jobs report `usage.billed` as `{ quantity, unit: 'tokens' }`, because Seedance bills output tokens only. The full option table is in the [BytePlus adapter](../adapters/byteplus#video-generation-seedance).

#### Move a Seedance call between providers

You can reach Seedance through this adapter (direct to BytePlus) or through the [fal adapter](../adapters/fal). The `metadata.role` values are the same in both. The `size` shape is different:

| Adapter | `size` shape | Example |
| --- | --- | --- |
| `@tanstack/ai-byteplus` | `ratio` or `ratio_resolution` (the ratio is required) | `'16:9_720p'`, `'16:9'` |
| `@tanstack/ai-fal` | `ratio_resolution`, `ratio`, or a bare resolution | `'16:9_720p'`, `'16:9'`, `'720p'` |

A bare `size: '720p'` works on fal and throws on BytePlus. BytePlus follows the [Grok Imagine](#grok-xai-imagine) template and always needs the ratio. Write the ratio (`'16:9_720p'`), and the same string works on both.

The mode also differs. fal puts the mode in the endpoint id, for example `fal-ai/bytedance/seedance/v1/pro/image-to-video` or `.../reference-to-video`. BytePlus takes one model id and reads the mode from the prompt parts. You cannot change this. It follows the API of each provider.

### OpenRouter

The [video generation API](https://openrouter.ai/docs/guides/overview/multimodal/video-generation) of OpenRouter runs Seedance, Veo, Wan, Kling, Sora 2 Pro, and more behind one async jobs API. `size`, `duration`, and the options below are typed and checked for each model, from the model data that OpenRouter publishes. A size or duration that the model does not support throws before the request goes out.

```typescript
import { generateVideo } from '@tanstack/ai'
import { openRouterVideo } from '@tanstack/ai-openrouter'

const { jobId } = await generateVideo({
  adapter: openRouterVideo('bytedance/seedance-2.5'),
  prompt: 'A beautiful sunset over the ocean',
  size: '1280x720', // a union for each model, from the OpenRouter model data
  duration: 8, // checked against the durations of the model
  modelOptions: {
    resolution: '720p', // another way to set the size: resolution + aspectRatio
    aspectRatio: '16:9',
    generateAudio: true, // not in the type for models that cannot
    seed: 42, // not in the type for models that cannot
    callbackUrl: 'https://your-app.com/webhooks/openrouter-video',
    provider: { options: { byteplus: { watermark: false } } }, // passthrough
  },
})
```

Like Veo, `duration` is typed for each model. It is the union of whole seconds in the model data. The adapter has the same `availableDurations()` and `snapDuration()` helpers:

```typescript
import { generateVideo } from '@tanstack/ai'
import { openRouterVideo } from '@tanstack/ai-openrouter'

const adapter = openRouterVideo('bytedance/seedance-2.5')

adapter.availableDurations()
// { kind: 'discrete', values: [4, 5, 6, ..., 30] }
adapter.snapDuration(7.4) // 7

const sliderSeconds = 7 // raw seconds from a UI control
await generateVideo({
  adapter,
  prompt: 'A timelapse of clouds',
  duration: adapter.snapDuration(sliderSeconds),
})
```

Two OpenRouter behaviors:

- **The finished video comes as a stream.** OpenRouter download URLs need your API key in an `Authorization` header, so a browser cannot load them. The adapter returns the download stream. With `withGenerationPersistence`, your blob store hosts it. Without it, `url` is a base64 `data:` URL. See [Videos with no public URL](./video-generation#videos-with-no-public-url).
- **The cost comes on completion.** The gateway reports the real billed cost of the job as `usage.cost` on the result.

### fal.ai

`duration` is typed for each endpoint from `@fal-ai/client`. Popular models also have `availableDurations()` and `snapDuration()`:

| Model | Durations |
| --- | --- |
| Kling 2.6, Pika | `'5'`, `'10'` |
| Kling 3 | `'3'` to `'15'` |
| Luma | `'5s'`, `'9s'` |
| Veo 3.1 | `'4s'`, `'6s'`, `'8s'` |
| WAN | `'2'` to `'15'` |

Models with no duration field (MiniMax, Hunyuan) type `duration` as `undefined`, so a `duration` there is a compile error. The full table is in the [fal adapter](../adapters/fal).

```typescript ignore
import { generateVideo } from '@tanstack/ai'
import { falVideo } from '@tanstack/ai-fal'

const adapter = falVideo('fal-ai/veo3.1')
adapter.availableDurations() // { kind: 'discrete', values: ['4s', '6s', '8s'] }

await generateVideo({
  adapter,
  prompt: 'A timelapse of a city skyline at dusk',
  duration: adapter.snapDuration(7), // '6s'
})
```

## Result types

These are the adapter-level types. `getVideoJobStatus()` merges them into one object, `{ status, progress?, url?, error?, usage? }`. That object has no `jobId` and no `expiresAt`.

```typescript
import type { TokenUsage } from '@tanstack/ai'
import type { PersistedArtifactRef } from '@tanstack/ai/client'

// From create
interface VideoJobResult {
  jobId: string // the job id to poll with
  model: string // the model of the job
  artifacts?: Array<PersistedArtifactRef>
}

// From status
interface VideoStatusResult {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number // 0-100, if available
  error?: string // the error message, if failed
}

// From url
interface VideoUrlResult {
  jobId: string
  url: string // the URL to download or stream the video
  expiresAt?: Date // when the URL expires
  // Usage for the finished job, when the adapter reports it.
  // fal reports usage.billed = { quantity, unit: 'units' } (from its
  // x-fal-billable-units header). Grok Imagine reports { quantity, unit: 'seconds' }.
  usage?: TokenUsage
}
```

> [!NOTE]
> fal bills media by usage units, not tokens. The fal adapters put the real billed quantity on `usage.billed` as `{ quantity, unit: 'units' }`. To get the exact cost, multiply `quantity` by the unit price of the endpoint from `GET https://api.fal.ai/v1/models/pricing?endpoint_id=...`. Image, audio, speech, and transcription results have the same `usage.billed`.

How a video run differs from an image run:

| | Image generation | Video generation |
| --- | --- | --- |
| API type | One request | A job, then polls |
| Result type | `ImageGenerationResult` | `VideoJobResult`, then `VideoStatusResult`, then `VideoUrlResult` |
| Wait time | Seconds | Minutes |
| More than one output | `numberOfImages` | Not supported |
| Main options | `prompt`, `size`, `numberOfImages` | `prompt`, `size`, `duration` |

## Errors

A job can fail at creation or while it runs. Catch errors from the create call, and read `status.error` when the poll returns `'failed'`:

```typescript
import { generateVideo, getVideoJobStatus } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

try {
  const adapter = openaiVideo('sora-2')
  const { jobId } = await generateVideo({ adapter, prompt: 'A scene' })

  const status = await getVideoJobStatus({ adapter, jobId })
  if (status.status === 'failed') {
    console.error('Generation failed:', status.error)
  }
} catch (error) {
  if (error instanceof Error) {
    if (error.message.includes('Video generation API is not available')) {
      console.error('Sora API access can be necessary. Look at your OpenAI account.')
    } else if (error.message.includes('rate limit')) {
      console.error('Rate limited. Wait, then try again.')
    } else {
      console.error('Unexpected error:', error)
    }
  }
}
```

With `stream: true`, these cases send `RUN_ERROR` to the hook:

- The provider reports `'failed'`. The error message is the provider error, or `"Video generation failed"`.
- The job runs longer than `maxDuration`. The error message is `"Video generation timed out"`.

### Limits and quotas

Rate limits and quotas change, and can differ by account tier:

- Video generation costs a lot of compute.
- Providers can limit how many jobs run at the same time.
- Providers can set a monthly quota.
- Longer videos and higher quality use more of the quota.

For the current limits, see the [OpenAI documentation](https://platform.openai.com/docs).

Other limits to plan for:

- The Sora API is not available in all OpenAI accounts.
- A video can take several minutes.
- Video URLs can expire.
- Progress updates can be limited or late.
- Audio support can be limited.
- The provider can cut a long prompt.

Good habits:

- Set a timeout for your polling loop.
- Show clear progress while the job runs.
- Store video URLs, and look at their expiry before you use them again.
- Check the length and content of a prompt before you send it.
- Track your usage so you do not reach your quota.

## API keys

Each video adapter reads the same environment variable as the other adapters of its provider:

- `OPENAI_API_KEY`: OpenAI (Sora)
- `GOOGLE_API_KEY` or `GEMINI_API_KEY`: Google (Veo, Omni)
- `ARK_API_KEY` or `BYTEPLUS_API_KEY`: BytePlus ModelArk (Seedance)
- `OPENROUTER_API_KEY`: OpenRouter (`openRouterVideo`)
- `FAL_KEY`: fal.ai (`falVideo`)
- `XAI_API_KEY`: xAI (`grokVideo`)

To pass a key yourself, use the `create*` factory:

```typescript
import { createOpenaiVideo } from '@tanstack/ai-openai'

const adapter = createOpenaiVideo('sora-2', 'your-openai-api-key')
```

### Download image inputs on the server

Two paths cannot pass an image URL to the provider. They must upload the bytes:

- OpenAI Sora `input_reference`.
- Gemini Veo. Its predict API accepts only inline bytes or a `gs://` reference.

To download an HTTP(S) URL, the server must keep the full file in memory. This can use all the memory of a small runtime, such as Cloudflare Workers. As a result, these adapters throw on an HTTP(S) image URL by default. You have two options:

- Send a `data:` URI, or a `gs://` reference for Veo.
- Pass `allowUrlFetch: true` to `createOpenaiVideo` or `createGeminiVideo`. The adapter then downloads the URL.

[Image Generation](./image-generation) has the same option for images.
