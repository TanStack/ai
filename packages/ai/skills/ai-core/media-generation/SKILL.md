---
name: ai-core/media-generation
description: >
  Image, audio, video, speech (TTS), and transcription generation using
  activity-specific adapters: generateImage() with openaiImage/geminiImage,
  generateAudio() with geminiAudio/falAudio, generateVideo() with async
  polling (openaiVideo/geminiVideo/grokVideo/falVideo, per-model typed
  durations), generateSpeech() with openaiSpeech, generateTranscription()
  with openaiTranscription. React hooks: useGenerateImage, useGenerateAudio,
  useGenerateSpeech, useTranscription, useGenerateVideo.
  TanStack Start server function integration with toServerSentEventsResponse.
type: sub-skill
library: tanstack-ai
library_version: '0.10.0'
sources:
  - 'TanStack/ai:docs/media/generations.md'
  - 'TanStack/ai:docs/media/generation-hooks.md'
  - 'TanStack/ai:docs/media/image-generation.md'
  - 'TanStack/ai:docs/media/audio-generation.md'
  - 'TanStack/ai:docs/media/video-generation.md'
  - 'TanStack/ai:docs/media/text-to-speech.md'
  - 'TanStack/ai:docs/media/transcription.md'
  - 'TanStack/ai:docs/advanced/debug-logging.md'
---

# Media Generation

> **Dependency note:** This skill builds on ai-core. Read it first for critical rules.

All media activities (image, speech, transcription, video) follow the same
server/client architecture: a `generate*()` function on the server, an SSE
transport via `toServerSentEventsResponse()`, and a framework hook on the
client.

## Setup -- Image Generation End-to-End

### Server (API route or TanStack Start server function)

```typescript
// routes/api/generate/image.ts
import { generateImage, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

export async function POST(req: Request) {
  const { prompt, size, numberOfImages } = await req.json()

  const stream = generateImage({
    adapter: openaiImage('gpt-image-1'),
    prompt,
    size,
    numberOfImages,
    stream: true,
  })

  return toServerSentEventsResponse(stream)
}
```

### Client (React)

```tsx
import { useGenerateImage, fetchServerSentEvents } from '@tanstack/ai-react'
import { useState } from 'react'

function ImageGenerator() {
  const [prompt, setPrompt] = useState('')
  const { generate, result, isLoading, error, reset } = useGenerateImage({
    connection: fetchServerSentEvents('/api/generate/image'),
  })

  return (
    <div>
      <input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe an image..."
      />
      <button
        onClick={() => generate({ prompt })}
        disabled={isLoading || !prompt.trim()}
      >
        {isLoading ? 'Generating...' : 'Generate'}
      </button>

      {error && <p>Error: {error.message}</p>}

      {result?.images.map((img, i) => (
        <img
          key={i}
          src={img.url || `data:image/png;base64,${img.b64Json}`}
          alt={img.revisedPrompt || 'Generated image'}
        />
      ))}

      {result && <button onClick={reset}>Clear</button>}
    </div>
  )
}
```

### TanStack Start: Server Function Streaming (recommended)

When using TanStack Start, return `toServerSentEventsResponse()` from a
server function. The client fetcher receives a `Response` and the hook
parses it as SSE automatically:

```typescript
// lib/server-functions.ts
import { createServerFn } from '@tanstack/react-start'
import { generateImage, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

export const generateImageStreamFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { prompt: string; model?: string }) => data)
  .handler(({ data }) => {
    return toServerSentEventsResponse(
      generateImage({
        adapter: openaiImage(data.model ?? 'gpt-image-1'),
        prompt: data.prompt,
        stream: true,
      }),
    )
  })
```

```tsx
import { useGenerateImage } from '@tanstack/ai-react'
import { generateImageStreamFn } from '../lib/server-functions'

function ImageGenerator() {
  const { generate, result, isLoading } = useGenerateImage({
    fetcher: (input) => generateImageStreamFn({ data: input }),
  })

  return (
    <button
      onClick={() => generate({ prompt: 'A sunset over mountains' })}
      disabled={isLoading}
    >
      {isLoading ? 'Generating...' : 'Generate'}
    </button>
  )
}
```

---

## Core Patterns

### 1. Image Generation

Supported adapters: `openaiImage` (dall-e-2, dall-e-3, gpt-image-1,
gpt-image-1-mini, gpt-image-2) and `geminiImage` (gemini-3.1-flash-image-preview,
gemini-3.1-flash-lite-image, imagen-4.0-generate-001, etc.).

```typescript
import { generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'
import { geminiImage } from '@tanstack/ai-gemini'

// OpenAI with quality/background options
const openaiResult = await generateImage({
  adapter: openaiImage('gpt-image-1'),
  prompt: 'A cat wearing a hat',
  size: '1024x1024',
  numberOfImages: 2,
  modelOptions: {
    quality: 'high',
    background: 'transparent',
    outputFormat: 'png',
  },
})

// Gemini native model with aspect-ratio sizes
const geminiResult = await generateImage({
  adapter: geminiImage('gemini-3.1-flash-image-preview'),
  prompt: 'A futuristic cityscape at night',
  size: '16:9_4K',
})

// Gemini Imagen model
const imagenResult = await generateImage({
  adapter: geminiImage('imagen-4.0-generate-001'),
  prompt: 'A landscape photo',
  modelOptions: { aspectRatio: '16:9' },
})
```

Result shape: `ImageGenerationResult` with `images` array where each entry
has `b64Json?`, `url?`, and `revisedPrompt?`. OpenAI image URLs expire
after 1 hour -- download or display immediately.

#### Image-conditioned generation: multimodal `prompt` parts

Both `generateImage()` and `generateVideo()` accept the `prompt` either as
a plain string or as an ordered array of content parts (`TextPart` /
`ImagePart` / `VideoPart` / `AudioPart` — the same shapes used elsewhere in
TanStack AI). Part order is meaningful: natively multimodal providers
(Gemini, OpenRouter) receive parts in order; named-field providers (OpenAI,
fal, xAI) extract media parts and flatten the text. Prompt text is always
sent verbatim — to reference inputs from the prompt, write the provider's
own syntax (fal `@Image1`, OpenAI "image 1" prose); the SDK never injects
or rewrites markers. Each media part may carry an optional
`metadata.role` hint that adapters use to route the part to the
provider-specific field. The accepted part types are narrowed per model at
compile time via the adapter's input-modality map.

```typescript
import { generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

// Image-to-image (OpenAI gpt-image-2 / gpt-image-1, dall-e-2)
await generateImage({
  adapter: openaiImage('gpt-image-2'),
  prompt: [
    { type: 'text', content: 'Turn this into a cinematic product photo' },
    { type: 'image', source: { type: 'url', value: 'https://…/product.png' } },
  ],
})

// Multi-reference (up to 16 for gpt-image models; up to ~14 for Gemini native
// — a provider limit, not enforced by the SDK)
await generateImage({
  adapter: openaiImage('gpt-image-2'),
  prompt: [
    { type: 'text', content: 'Apply the second image as style to the first' },
    { type: 'image', source: { type: 'url', value: 'https://…/product.png' } },
    { type: 'image', source: { type: 'url', value: 'https://…/style.png' } },
  ],
})

// Inpaint via metadata.role === 'mask' (OpenAI gpt-image models, dall-e-2; fal mask_url)
await generateImage({
  adapter: openaiImage('gpt-image-2'),
  prompt: [
    { type: 'text', content: 'Replace the masked region with a tree' },
    { type: 'image', source: { type: 'url', value: photoUrl } },
    {
      type: 'image',
      source: { type: 'url', value: maskUrl },
      metadata: { role: 'mask' },
    },
  ],
})

// Image-to-video (OpenAI Sora: single input_reference; fal: image_url + optional end_image_url)
import { generateVideo } from '@tanstack/ai'
import { falVideo } from '@tanstack/ai-fal'

await generateVideo({
  adapter: falVideo('fal-ai/kling-video/v3/pro/image-to-video'),
  prompt: [
    { type: 'image', source: { type: 'url', value: firstFrameUrl } },
    { type: 'text', content: 'Slow cinematic push-in' },
    {
      type: 'image',
      source: { type: 'url', value: lastFrameUrl },
      metadata: { role: 'end_frame' },
    },
  ],
})
```

**Role hints** (`metadata.role`):

| Role            | Maps to                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| `'reference'`   | fal `reference_image_urls`; Gemini multimodal part; positional otherwise                              |
| `'character'`   | Same as `'reference'`; Veo `referenceImages` slot (planned — no Veo adapter yet)                      |
| `'mask'`        | OpenAI `mask` (gpt-image-2, gpt-image-1, dall-e-2); fal `mask_url`                                    |
| `'control'`     | fal `control_image_url` (ControlNet / depth / pose)                                                   |
| `'start_frame'` | fal `start_image_url` (or the endpoint's field, e.g. `image_url` on Kling i2v); Veo `image` (planned) |
| `'end_frame'`   | fal `end_image_url` (or e.g. `tail_image_url` / `last_frame_url`); Veo `lastFrame` (planned)          |

**Provider support matrix:**

| Provider   | `generateImage` image parts                                                                                                                                                                              | `generateVideo` image parts                                                                                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI     | gpt-image-2 / gpt-image-1 / -mini → `images.edit()` (up to 16). dall-e-2 → edit (1). dall-e-3 throws.                                                                                                    | Sora-2 / -pro → `input_reference` (single). Throws if >1.                                                                                                                                          |
| Gemini     | Native (gemini-\*-flash-image, "nano-banana") → multimodal `contents`. Imagen throws.                                                                                                                    | No native Veo adapter yet — deferred to a follow-up.                                                                                                                                               |
| fal        | Per-endpoint field names from a generated map (`pnpm generate:fal-image-fields`). Defaults: 1 input → `image_url`; >1 → `image_urls`; roles → `mask_url` / `control_image_url` / `reference_image_urls`. | Per-endpoint map (e.g. Kling i2v start frame → `image_url`). Defaults: 1 input → `image_url`; `start_frame`/`end_frame` → `start_image_url`/`end_image_url`; `reference` → `reference_image_urls`. |
| Grok       | grok-imagine models → `/v1/images/edits` JSON endpoint (≤3 sources, addressed by xAI in request order; prompt sent verbatim; mask/control throw). grok-2-image-1212 throws.                              | n/a                                                                                                                                                                                                |
| OpenRouter | Prompt parts map 1:1 onto multimodal `text` / `image_url` content parts, preserving interleaved order.                                                                                                   | n/a                                                                                                                                                                                                |
| Anthropic  | n/a (no image generation API).                                                                                                                                                                           | n/a                                                                                                                                                                                                |

Video and audio prompt parts follow the same `metadata.role` convention
for video-to-video and lipsync flows on fal; other providers throw when
they're passed.

### 2. Audio Generation (Music, Sound Effects)

Distinct from TTS — `generateAudio()` produces non-speech audio content.
Supported adapters: `geminiAudio` (Lyria 3 Pro / Lyria 3 Clip) and
`falAudio` (MiniMax Music, DiffRhythm, Stable Audio, ElevenLabs SFX, etc.).

```typescript
import { generateAudio } from '@tanstack/ai'
import { falAudio } from '@tanstack/ai-fal'

const result = await generateAudio({
  adapter: falAudio('fal-ai/diffrhythm'),
  prompt: 'An upbeat electronic track with synths',
  duration: 10,
})

// result.audio.url or result.audio.b64Json (provider-dependent)
// result.audio.contentType e.g. "audio/mpeg"
```

Client hook:

```tsx
import { useGenerateAudio, fetchServerSentEvents } from '@tanstack/ai-react'

const { generate, result, isLoading } = useGenerateAudio({
  connection: fetchServerSentEvents('/api/generate/audio'),
})

// Trigger: generate({ prompt: 'Upbeat synths', duration: 10 })
// Play:    <audio src={result.audio.url} controls />
```

### 3. Text-to-Speech

Adapter: `openaiSpeech` (tts-1, tts-1-hd, gpt-4o-audio-preview).

```typescript
import { generateSpeech } from '@tanstack/ai'
import { openaiSpeech } from '@tanstack/ai-openai'

const result = await generateSpeech({
  adapter: openaiSpeech('tts-1-hd'),
  text: 'Hello, welcome to TanStack AI!',
  voice: 'alloy', // alloy | echo | fable | onyx | nova | shimmer | ash | ballad | coral | sage | verse
  format: 'mp3', // mp3 | opus | aac | flac | wav | pcm
  speed: 1.0, // 0.25 to 4.0
})

// result.audio is base64-encoded audio
// result.format is the output format string
// result.contentType is the MIME type (e.g. "audio/mpeg")
```

Client hook:

```tsx
import { useGenerateSpeech, fetchServerSentEvents } from '@tanstack/ai-react'

const { generate, result, isLoading } = useGenerateSpeech({
  connection: fetchServerSentEvents('/api/generate/speech'),
})

// Trigger: generate({ text: 'Hello!', voice: 'alloy' })
// Play:   <audio src={`data:audio/${result.format};base64,${result.audio}`} controls />
```

### 4. Audio Transcription

Adapter: `openaiTranscription` (whisper-1, gpt-4o-transcribe,
gpt-4o-mini-transcribe, gpt-4o-transcribe-diarize).

> **Capturing audio in the browser:** Use `useAudioRecorder` from `@tanstack/ai-react` to record directly in the browser, then pass the recording as the `audio` input to `generate()`, or use `recording.part` as a prompt part in chat/generation calls. No transcoding or extra dependencies required — the recorder returns the native browser format (`audio/webm` or `audio/mp4`). For transcription, wrap it as a `data:` URL so the provider gets the real content type; passing raw `recording.base64` makes the adapter assume `audio/mpeg` and mislabel the webm/mp4 bytes.
>
> ```typescript
> const { isRecording, start, stop } = useAudioRecorder()
> const { generate } = useTranscription({
>   connection: fetchServerSentEvents('/api/transcribe'),
> })
> // ...
> const recording = await stop()
> const mimeType = recording.mimeType.split(';')[0] // strip ;codecs=...
> await generate({ audio: `data:${mimeType};base64,${recording.base64}` })
> ```

```typescript
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'

const result = await generateTranscription({
  adapter: openaiTranscription('whisper-1'),
  audio: audioFile, // File, Blob, base64 string, or data URL
  language: 'en',
  responseFormat: 'verbose_json',
  modelOptions: {
    timestamp_granularities: ['word', 'segment'],
  },
})

// result.text       -- full transcribed text
// result.language   -- detected/specified language
// result.duration   -- audio duration in seconds
// result.segments   -- timestamped segments (word-level timestamps are in result.words)
```

For speaker diarization, use `openaiTranscription('gpt-4o-transcribe-diarize')`.
When no response format is given it defaults the request to `response_format: 'diarized_json'`
and `chunking_strategy: 'auto'` (a top-level `responseFormat` of `'json'`/`'text'` opts out of
speaker segments); do not pass `prompt`, `include`, or `timestamp_granularities` with this model.

Client hook:

```tsx
import { useTranscription, fetchServerSentEvents } from '@tanstack/ai-react'

const { generate, result, isLoading } = useTranscription({
  connection: fetchServerSentEvents('/api/transcribe'),
})

// Trigger: generate({ audio: dataUrl, language: 'en' })
```

### 5. Video Generation (Experimental -- async polling)

Video generation uses a jobs/polling architecture. The server creates a job,
polls for status, and streams updates to the client.

```typescript
import {
  generateVideo,
  getVideoJobStatus,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

// Non-streaming: manual polling loop
const { jobId } = await generateVideo({
  adapter: openaiVideo('sora-2'),
  prompt: 'A golden retriever playing in sunflowers',
  size: '1280x720',
  duration: 8,
})

let status = await getVideoJobStatus({ adapter: openaiVideo('sora-2'), jobId })
while (status.status !== 'completed' && status.status !== 'failed') {
  await new Promise((r) => setTimeout(r, 5000))
  status = await getVideoJobStatus({ adapter: openaiVideo('sora-2'), jobId })
}

// Streaming: server handles polling, client gets real-time updates
const stream = generateVideo({
  adapter: openaiVideo('sora-2'),
  prompt: 'A flying car over a city',
  stream: true,
  pollingInterval: 3000,
  maxDuration: 600_000,
})
return toServerSentEventsResponse(stream)
```

Google Veo (`@tanstack/ai-gemini`) uses the same jobs/polling flow. Its
`duration` option is typed per model (e.g. `4 | 6 | 8` for Veo 3.x,
`5 | 6 | 8` for Veo 2); use `adapter.snapDuration(seconds)` to coerce raw
seconds and `adapter.availableDurations()` to enumerate the valid set.
Image prompt parts route by `metadata.role`: first un-roled /
`'start_frame'` image → input image, `'end_frame'` → `lastFrame`,
`'reference'` / `'character'` → `referenceImages`:

```typescript
import { geminiVideo } from '@tanstack/ai-gemini'

const adapter = geminiVideo('veo-3.1-generate-preview')
adapter.availableDurations() // { kind: 'discrete', values: [4, 6, 8] }

const { jobId } = await generateVideo({
  adapter,
  prompt: 'A golden retriever playing in sunflowers',
  size: '16:9', // Veo sizes are aspect ratios: '16:9' | '9:16'
  duration: adapter.snapDuration(7), // 6
  modelOptions: { resolution: '1080p', generateAudio: true },
})
// Note: Veo result URLs require the Google API key to download
// (x-goog-api-key header or ?key= query parameter).
```

Other video adapters: `openaiVideo('sora-2')` (pixel sizes like `'1280x720'`,
durations 4/8/12s, single `input_reference` image prompt part), `grokVideo(...)`
(`grok-imagine-video` does text-to-video + image-to-video; `grok-imagine-video-1.5` is
image-to-video only — needs an `image` prompt part as the starting frame, text-only throws;
aspect-ratio size template like `'16:9_720p'`, integer durations 1-15s, reports
`usage.unitsBilled` seconds and exact `usage.cost`), and `falVideo(...)` (hosted models, see cost tracking below).

Client hook with job tracking:

```tsx
import { useGenerateVideo, fetchServerSentEvents } from '@tanstack/ai-react'

const { generate, result, jobId, videoStatus, isLoading } = useGenerateVideo({
  connection: fetchServerSentEvents('/api/generate/video'),
  onJobCreated: (id) => console.log('Job created:', id),
  onStatusUpdate: (status) =>
    console.log(`${status.status} (${status.progress}%)`),
})

// videoStatus: { jobId, status, progress?, url?, error?, usage? }
// result (on completion): { url }
```

### 6. Cost tracking (fal billable units)

fal bills media generation by usage-based units, not tokens. Every fal media
adapter (`falImage`, `falAudio`, `falSpeech`, `falTranscription`, `falVideo`)
surfaces the real billed quantity on the result as `usage.unitsBilled`, read
from fal's `x-fal-billable-units` response header — no `fetch` interceptor
needed. It rides on the canonical `TokenUsage` shape (token fields are `0` for
media), mirroring how duration-billed transcription surfaces `durationSeconds`.

```typescript
import { generateImage } from '@tanstack/ai'
import { falImage } from '@tanstack/ai-fal'

const result = await generateImage({
  adapter: falImage('fal-ai/flux/dev'),
  prompt: 'a serene mountain lake',
})

// usage.unitsBilled is the priced quantity. Multiply by the endpoint unit
// price (GET https://api.fal.ai/v1/models/pricing?endpoint_id=…) for exact cost.
if (result.usage?.unitsBilled != null) {
  const cost = result.usage.unitsBilled * unitPrice
}
```

For video, the units arrive with the completed result: `getVideoJobStatus()`
returns `usage` and emits a `video:usage` devtools event when fal reports it.

---

## Common Hook API

All generation hooks return the same shape:

| Property    | Type                       | Description                                      |
| ----------- | -------------------------- | ------------------------------------------------ |
| `generate`  | `(input) => Promise<void>` | Trigger generation                               |
| `result`    | `T \| null`                | Result (optionally transformed via `onResult`)   |
| `isLoading` | `boolean`                  | Whether generation is in progress                |
| `error`     | `Error \| undefined`       | Current error                                    |
| `status`    | `GenerationClientState`    | `'idle' \| 'generating' \| 'success' \| 'error'` |
| `stop`      | `() => void`               | Abort current generation                         |
| `reset`     | `() => void`               | Clear state, return to idle                      |

Provide either `connection` (streaming SSE transport) or `fetcher`
(direct async call / server function returning `Response`). Use `onResult`
to transform what is stored:

```tsx
const { result } = useGenerateSpeech({
  connection: fetchServerSentEvents('/api/generate/speech'),
  onResult: (raw) => ({
    audioUrl: `data:${raw.contentType};base64,${raw.audio}`,
    duration: raw.duration,
  }),
})
// result is typed as { audioUrl: string; duration?: number } | null
```

---

## Common Mistakes

### a. HIGH: Using the removed `embedding()` function

The `embedding()` function and `openaiEmbed` adapter were removed in v0.5.0.
Agents trained on older code may still generate this pattern.

**Wrong:**

```typescript
import { embedding } from '@tanstack/ai'
import { openaiEmbed } from '@tanstack/ai-openai'

const result = await embedding({
  adapter: openaiEmbed(),
  model: 'text-embedding-3-small',
  input: 'Hello, world!',
})
```

**Correct -- use the provider SDK directly:**

```typescript
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const result = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: 'Hello, world!',
})
```

> Source: docs/migration/migration.md. Note: Fixed in v0.5.0 but agents
> trained on older code may still generate this pattern.

### b. HIGH: Forgetting `toServerSentEventsResponse` with TanStack Start server functions

When using TanStack Start server functions with `stream: true`, you MUST
wrap the stream with `toServerSentEventsResponse()`. Returning the raw
stream from a server function will not work.

**Wrong:**

```typescript
export const generateImageStreamFn = createServerFn({ method: 'POST' }).handler(
  ({ data }) => {
    // BUG: returning raw stream -- client cannot parse this
    return generateImage({
      adapter: openaiImage('gpt-image-1'),
      prompt: data.prompt,
      stream: true,
    })
  },
)
```

**Correct:**

```typescript
import { generateImage, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

export const generateImageStreamFn = createServerFn({ method: 'POST' }).handler(
  ({ data }) => {
    return toServerSentEventsResponse(
      generateImage({
        adapter: openaiImage('gpt-image-1'),
        prompt: data.prompt,
        stream: true,
      }),
    )
  },
)
```

> Source: maintainer interview.

### c. MEDIUM: Not downloading OpenAI image URLs before they expire

OpenAI image URLs expire after 1 hour. If you store the URL and display it
later, the image will silently break. Always download or display the image
immediately, or convert to base64 for persistence.

```typescript
const result = await generateImage({
  adapter: openaiImage('dall-e-3'),
  prompt: 'A mountain landscape',
})

// GOOD: download immediately
for (const img of result.images) {
  if (img.url) {
    const response = await fetch(img.url)
    const blob = await response.blob()
    // Save blob to storage...
  }
}

// GOOD: use b64Json when available (no expiration)
// gpt-image-1 returns b64Json by default
```

> Source: docs/media/image-generation.md.

### d. MEDIUM: Using `stream: true` for activities that do not support streaming

Not all generation activities support streaming. Passing `stream: true` to
an activity that does not support it may hang or produce unexpected results.
Check the activity documentation before enabling streaming. All built-in
activities (`generateImage`, `generateAudio`, `generateSpeech`,
`generateTranscription`, `generateVideo`, `summarize`) support `stream: true`,
but custom `useGeneration` setups may not.

> Source: docs/media/generations.md.

### e. HIGH: Passing `responseMimeType` or `negativePrompt` to Gemini Lyria

Gemini's `GenerateContentConfig` (used by Lyria 3 Pro / Lyria 3 Clip) does
**not** support `responseMimeType` or `negativePrompt`. Lyria 3 Clip always
returns 30-second `audio/mp3`; Lyria 3 Pro returns `audio/mp3`. These fields
are not in `GeminiAudioProviderOptions` — don't reach for them via `as any`.

```typescript
// WRONG — both fields are silently ignored or rejected by the SDK
generateAudio({
  adapter: geminiAudio('lyria-3-pro-preview'),
  prompt: 'ambient piano',
  modelOptions: {
    responseMimeType: 'audio/wav', // unsupported
    negativePrompt: 'vocals', // unsupported
  } as any,
})

// CORRECT — shape the prompt itself for what you want
generateAudio({
  adapter: geminiAudio('lyria-3-pro-preview'),
  prompt: 'ambient piano, no vocals',
})
```

> Source: Gemini API `GenerateContentConfig` type; docs/media/audio-generation.md.

### f. MEDIUM: Passing `duration` to Lyria expecting it to control length

Lyria 3 Clip is fixed at 30 seconds — the `duration` option is ignored on
that model. Lyria 3 Pro accepts duration via natural-language in the
**prompt** ("2-minute ambient track with a 30-second build"), not via the
`duration` field. `duration` works for fal audio models (mapped to each
model's native field like `music_length_ms` or `seconds_total`), but not
for Lyria.

```typescript
// For Lyria: put length guidance in the prompt
generateAudio({
  adapter: geminiAudio('lyria-3-pro-preview'),
  prompt: 'A 2-minute ambient piano piece with gentle strings',
  // duration: 120  // ← does nothing; rely on the prompt
})

// For fal: duration works and is translated per-model
generateAudio({
  adapter: falAudio('fal-ai/minimax-music/v2'),
  prompt: 'upbeat synth melody',
  duration: 60, // → music_length_ms: 60_000
})
```

> Source: Google Lyria 3 docs; docs/media/audio-generation.md.

### g. MEDIUM: Gemini TTS multi-speaker with 0 or 3+ speakers

`multiSpeakerVoiceConfig.speakerVoiceConfigs` is validated to be length 1 or 2. Passing an empty array or three+ entries throws at the adapter boundary
(not at Gemini's API) with a clear error. Don't try to work around it with
`as any`.

```typescript
generateSpeech({
  adapter: geminiSpeech('gemini-2.5-pro-preview-tts'),
  text: '[Alice] Hi. [Bob] Hello!',
  modelOptions: {
    multiSpeakerVoiceConfig: {
      speakerVoiceConfigs: [
        {
          speaker: 'Alice',
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
        {
          speaker: 'Bob',
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
        },
      ],
    },
  },
})
```

> Source: Gemini TTS adapter validation; CodeRabbit review of PR #463.

### h. HIGH: Passing image prompt parts to a model that doesn't support image-conditioned generation

Not every model accepts image-conditioned prompts. The `prompt` type is
narrowed per model, so passing an image part to a text-only model
(dall-e-3, Imagen, grok-2-image) is a **compile-time error**; adapters
also throw a clear runtime error as a backstop, so users learn at call
time rather than getting silently wrong output.

```typescript
// WRONG — dall-e-3 has no edit/inputs API; image parts are a type error
generateImage({
  adapter: openaiImage('dall-e-3'),
  prompt: [
    { type: 'text', content: 'Edit this' },
    { type: 'image', source: { type: 'url', value: url } }, // ❌ type error
  ],
})

// WRONG — Imagen is text-to-image only; same compile-time rejection
generateImage({
  adapter: geminiImage('imagen-4.0-generate-001'),
  prompt: [
    { type: 'text', content: 'Edit this' },
    { type: 'image', source: { type: 'url', value: url } }, // ❌ type error
  ],
})

// CORRECT — use a model that supports image-conditioned generation
generateImage({
  adapter: openaiImage('gpt-image-2'), // edits up to 16 images
  prompt: [
    { type: 'text', content: 'Edit this' },
    { type: 'image', source: { type: 'url', value: url } },
  ],
})

generateImage({
  adapter: geminiImage('gemini-3.1-flash-image-preview'), // native multimodal
  prompt: [
    { type: 'text', content: 'Edit this' },
    { type: 'image', source: { type: 'url', value: url } },
  ],
})
```

> Source: docs/media/image-generation.md, docs/media/video-generation.md.

### i. LOW: Writing a logging middleware to see media chunks flow through

Every media activity — `generateAudio`, `generateSpeech`,
`generateTranscription`, `generateImage`, `generateVideo` — accepts the
same `debug?: DebugOption` option that `chat()` does. Reach for `debug`
instead of wiring up logging middleware.

```typescript
// When a speech generation sounds wrong or a transcription returns garbage
generateSpeech({
  adapter: openaiSpeech('tts-1'),
  text: 'Hello',
  debug: { provider: true, output: true }, // raw SDK chunks + yielded chunks
})
```

See the `ai-core/debug-logging` sub-skill for full details on categories
and piping into a custom logger.

> Source: docs/advanced/debug-logging.md.

---

## Cross-References

- See also: **ai-core/adapter-configuration/SKILL.md** -- Each media
  activity requires a specific activity adapter (e.g., `openaiImage` for
  images, `openaiSpeech` for speech, `openaiTranscription` for transcription,
  `openaiVideo` for video). The adapter-configuration skill covers provider
  setup, API keys, and model selection.
- See also: **ai-core/debug-logging/SKILL.md** -- When a media request
  returns unexpected output or fails mid-stream, toggle `debug: true` on
  any `generate*()` call to see request metadata, raw provider chunks, and
  errors. Covers per-category toggling and piping into pino/winston.
