---
name: ai-core/media-generation
description: >
  Image, audio, video, speech (TTS), and transcription generation using
  activity-specific adapters: generateImage() with openaiImage/geminiImage,
  generateAudio() with geminiAudio/falAudio, generateVideo() with async
  polling, generateSpeech() with openaiSpeech, generateTranscription() with
  openaiTranscription. React hooks: useGenerateImage, useGenerateAudio,
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
gpt-image-1-mini) and `geminiImage` (gemini-3.1-flash-image-preview,
imagen-4.0-generate-001, etc.).

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
gpt-4o-mini-transcribe).

```typescript
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'

const result = await generateTranscription({
  adapter: openaiTranscription('whisper-1'),
  audio: audioFile, // File, Blob, base64 string, or data URL
  language: 'en',
  responseFormat: 'verbose_json',
  modelOptions: {
    include: ['segment', 'word'],
  },
})

// result.text       -- full transcribed text
// result.language   -- detected/specified language
// result.duration   -- audio duration in seconds
// result.segments   -- timestamped segments with optional word-level timestamps
```

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

Client hook with job tracking:

```tsx
import { useGenerateVideo, fetchServerSentEvents } from '@tanstack/ai-react'

const { generate, result, jobId, videoStatus, isLoading } = useGenerateVideo({
  connection: fetchServerSentEvents('/api/generate/video'),
  onJobCreated: (id) => console.log('Job created:', id),
  onStatusUpdate: (status) =>
    console.log(`${status.status} (${status.progress}%)`),
})

// videoStatus: { jobId, status, progress?, url?, error? }
// result (on completion): { url }
```

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

### h. LOW: Writing a logging middleware to see media chunks flow through

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
