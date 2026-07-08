---
title: Generation Hooks
id: generation-hooks
order: 7
description: "Framework hooks for every TanStack AI media generation type — useGenerateImage, useGenerateAudio, useGenerateSpeech, useTranscription, useSummarize, useGenerateVideo."
keywords:
  - tanstack ai
  - generation hooks
  - useGenerateImage
  - useGenerateAudio
  - useGenerateSpeech
  - useTranscription
  - useSummarize
  - useGenerateVideo
  - react hooks
---

# Generation Hooks

TanStack AI provides framework hooks for every generation type: image, audio, speech, transcription, summarization, and video. Each hook connects to a server endpoint and manages loading, error, and result state for you.

## Overview

Generation hooks share a consistent API across all media types:

| Hook | Input | Result Type |
|------|-------|-------------|
| `useGenerateImage` | `ImageGenerateInput` | `ImageGenerationResult` |
| `useGenerateAudio` | `AudioGenerateInput` | `AudioGenerationResult` |
| `useGenerateSpeech` | `SpeechGenerateInput` | `TTSResult` |
| `useTranscription` | `TranscriptionGenerateInput` | `TranscriptionResult` |
| `useSummarize` | `SummarizeGenerateInput` | `SummarizationResult` |
| `useGenerateVideo` | `VideoGenerateInput` | `VideoGenerateResult` |
| `useGeneration` | Generic `TInput` | Generic `TResult` |

Every hook returns the same core shape: `generate`, `result`, `isLoading`, `error`, `status`, `stop`, and `reset`. Streaming hooks also expose lightweight resume state and persisted artifact refs. You provide either a `connection` (streaming transport) or a `fetcher` (direct async call).

## Server Setup

Before using hooks on the client, you need a server endpoint that runs the generation and returns the result as SSE. Here's a minimal image generation endpoint:

```typescript
// routes/api/generate/image.ts
import { generateImage, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

export async function POST(req: Request) {
  const { prompt, size, numberOfImages } = await req.json()

  const stream = generateImage({
    adapter: openaiImage('dall-e-3'),
    prompt,
    size,
    numberOfImages,
    stream: true,
  })

  return toServerSentEventsResponse(stream)
}
```

The same pattern applies to all generation types -- swap `generateImage` for `generateSpeech`, `generateTranscription`, `summarize`, or `generateVideo`. See the individual media guides for server-side details.

For refresh-safe generation, wrap the server call with `withPersistence(...)`
and parse hook requests with `generationParamsFromRequest(...)`. See
[Generation Persistence](../persistence/generation-persistence) for the complete
server and client flow.

## useGenerateImage

Trigger image generation and render the results.

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

The `generate` function accepts an `ImageGenerateInput`:

| Field | Type | Description |
|-------|------|-------------|
| `prompt` | `string` | Text description of the desired image (required) |
| `numberOfImages` | `number` | Number of images to generate |
| `size` | `string` | Image size in WIDTHxHEIGHT format (e.g., `"1024x1024"`) |
| `modelOptions` | `Record<string, any>` | Model-specific options |

## useGenerateSpeech

Convert text to speech and play it back.

```tsx
import { useGenerateSpeech, fetchServerSentEvents } from '@tanstack/ai-react'
import { useRef } from 'react'

function SpeechGenerator() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const { generate, result, isLoading, error } = useGenerateSpeech({
    connection: fetchServerSentEvents('/api/generate/speech'),
  })

  return (
    <div>
      <button
        onClick={() => generate({ text: 'Hello, welcome to TanStack AI!', voice: 'alloy' })}
        disabled={isLoading}
      >
        {isLoading ? 'Generating...' : 'Generate Speech'}
      </button>

      {error && <p>Error: {error.message}</p>}

      {result && (
        <audio
          ref={audioRef}
          src={`data:audio/${result.format};base64,${result.audio}`}
          controls
          autoPlay
        />
      )}
    </div>
  )
}
```

The `generate` function accepts a `SpeechGenerateInput`:

| Field | Type | Description |
|-------|------|-------------|
| `text` | `string` | The text to convert to speech (required) |
| `voice` | `string` | The voice to use (e.g., `"alloy"`, `"echo"`) |
| `format` | `'mp3' \| 'opus' \| 'aac' \| 'flac' \| 'wav' \| 'pcm'` | Output audio format |
| `speed` | `number` | Audio speed (0.25 to 4.0) |
| `modelOptions` | `Record<string, any>` | Model-specific options |

The `TTSResult` contains `audio` (base64-encoded), `format`, and optionally `duration` and `contentType`.

## useTranscription

Transcribe audio files to text.

```tsx
import { useTranscription, fetchServerSentEvents } from '@tanstack/ai-react'

function Transcriber() {
  const { generate, result, isLoading, error } = useTranscription({
    connection: fetchServerSentEvents('/api/transcribe'),
  })

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = () => {
        const audio = reader.result
        if (typeof audio === 'string') {
          generate({ audio, language: 'en' })
        }
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <div>
      <input type="file" accept="audio/*" onChange={handleFile} />

      {isLoading && <p>Transcribing...</p>}
      {error && <p>Error: {error.message}</p>}

      {result && (
        <div>
          <h3>Transcription</h3>
          <p>{result.text}</p>
          {result.language && <p>Language: {result.language}</p>}
          {result.duration && <p>Duration: {result.duration}s</p>}
        </div>
      )}
    </div>
  )
}
```

The `generate` function accepts a `TranscriptionGenerateInput`:

| Field | Type | Description |
|-------|------|-------------|
| `audio` | `string \| File \| Blob \| ArrayBuffer` | Audio data -- base64 string, File, Blob, or ArrayBuffer (required) |
| `language` | `string` | Language in ISO-639-1 format (e.g., `"en"`) |
| `prompt` | `string` | Optional prompt to guide the transcription |
| `responseFormat` | `'json' \| 'text' \| 'srt' \| 'verbose_json' \| 'vtt'` | Common output format |
| `modelOptions` | `Record<string, any>` | Model-specific options |

## useSummarize

Summarize long text with configurable output styles.

```tsx
import { useSummarize, fetchServerSentEvents } from '@tanstack/ai-react'
import { useState } from 'react'

function Summarizer() {
  const [text, setText] = useState('')
  const { generate, result, isLoading, error } = useSummarize({
    connection: fetchServerSentEvents('/api/summarize'),
  })

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste text to summarize..."
        rows={8}
      />
      <button
        onClick={() => generate({ text, style: 'bullet-points', maxLength: 200 })}
        disabled={isLoading || !text.trim()}
      >
        {isLoading ? 'Summarizing...' : 'Summarize'}
      </button>

      {error && <p>Error: {error.message}</p>}

      {result && (
        <div>
          <h3>Summary</h3>
          <p>{result.summary}</p>
        </div>
      )}
    </div>
  )
}
```

The `generate` function accepts a `SummarizeGenerateInput`:

| Field | Type | Description |
|-------|------|-------------|
| `text` | `string` | The text to summarize (required) |
| `maxLength` | `number` | Maximum length of the summary |
| `style` | `'bullet-points' \| 'paragraph' \| 'concise'` | Summary style |
| `focus` | `Array<string>` | Topics to focus on |
| `modelOptions` | `Record<string, any>` | Model-specific options |

## useGenerateVideo

Video generation is asynchronous -- a job is created on the server, then polled for status until completion. The hook manages the full lifecycle and exposes `jobId` and `videoStatus` so you can show progress.

```tsx
import { useGenerateVideo, fetchServerSentEvents } from '@tanstack/ai-react'

function VideoGenerator() {
  const { generate, result, jobId, videoStatus, isLoading, error } =
    useGenerateVideo({
      connection: fetchServerSentEvents('/api/generate/video'),
      onStatusUpdate: (status) => {
        console.log(`Video ${status.jobId}: ${status.status} (${status.progress}%)`)
      },
    })

  return (
    <div>
      <button
        onClick={() => generate({ prompt: 'A flying car over a city', duration: 5 })}
        disabled={isLoading}
      >
        {isLoading ? 'Generating...' : 'Generate Video'}
      </button>

      {isLoading && videoStatus && (
        <div>
          <p>Job: {jobId}</p>
          <p>Status: {videoStatus.status}</p>
          {videoStatus.progress != null && (
            <progress value={videoStatus.progress} max={100} />
          )}
        </div>
      )}

      {error && <p>Error: {error.message}</p>}

      {result && (
        <video src={result.url} controls autoPlay style={{ maxWidth: '100%' }} />
      )}
    </div>
  )
}
```

The `generate` function accepts a `VideoGenerateInput`:

| Field | Type | Description |
|-------|------|-------------|
| `prompt` | `string` | Text description of the desired video (required) |
| `size` | `string` | Video size -- format depends on provider (e.g., `"16:9"`, `"1280x720"`) |
| `duration` | `number` | Video duration in seconds |
| `modelOptions` | `Record<string, any>` | Model-specific options |

`useGenerateVideo` returns two extra properties beyond the standard set:

| Property | Type | Description |
|----------|------|-------------|
| `jobId` | `string \| null` | The current job ID, set when the server creates a video job |
| `videoStatus` | `VideoStatusInfo \| null` | Live status updates with `status`, `progress`, and `jobId` |

The `VideoStatusInfo` type:

```typescript
interface VideoStatusInfo {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number     // 0-100
  url?: string          // Set when completed
  error?: string        // Set when failed
}
```

The hook also accepts `onJobCreated` and `onStatusUpdate` callbacks for fine-grained tracking.

## Base Hook: useGeneration

All specialized hooks are built on `useGeneration`. Use it directly when you have a custom generation type that doesn't fit the built-in hooks.

```tsx
import { useGeneration, fetchServerSentEvents } from '@tanstack/ai-react'

interface EmbeddingInput {
  text: string
  model?: string
}

interface EmbeddingResult {
  embedding: Array<number>
  model: string
  usage: { totalTokens: number }
}

function EmbeddingGenerator() {
  const { generate, result, isLoading, error } = useGeneration<
    EmbeddingInput,
    EmbeddingResult
  >({
    connection: fetchServerSentEvents('/api/generate/embedding'),
  })

  return (
    <div>
      <button onClick={() => generate({ text: 'Hello world' })} disabled={isLoading}>
        Generate Embedding
      </button>
      {result && <p>Dimensions: {result.embedding.length}</p>}
    </div>
  )
}
```

### Options

`UseGenerationOptions<TInput, TResult>` accepts:

| Option | Type | Description |
|--------|------|-------------|
| `connection` | `ConnectConnectionAdapter` | Streaming transport (SSE, HTTP stream, custom) |
| `fetcher` | `GenerationFetcher<TInput, TResult>` | Direct async function (no streaming protocol needed) |
| `id` | `string` | Unique identifier for this generation instance |
| `body` | `Record<string, any>` | Additional body parameters sent with connection requests |
| `persistence` | `{ server?: GenerationServerPersistence }` | Stores the lightweight generation resume snapshot. Generated media bytes are not stored in browser persistence. |
| `autoResume` | `boolean` | Whether the hook should resume a persisted run on mount. Defaults to `true`. |
| `initialResumeSnapshot` | `GenerationResumeSnapshot` | Initial lightweight snapshot restored by the app or a persistence adapter. |
| `resumeState` | `GenerationResumeState` | Explicit `{ threadId, runId, cursor }` to use for the next resume or generation request. |
| `onResult` | `(result: TResult) => TOutput \| null \| void` | Transform or react to results |
| `onError` | `(error: Error) => void` | Error callback |
| `onProgress` | `(progress: number, message?: string) => void` | Progress updates (0-100) |
| `onChunk` | `(chunk: StreamChunk) => void` | Per-chunk callback (connection mode only) |

### Return Value

`UseGenerationReturn<TOutput>` provides:

| Property | Type | Description |
|----------|------|-------------|
| `generate` | `(input: TInput) => Promise<void>` | Trigger a generation request |
| `result` | `TOutput \| null` | The generation result, or null |
| `isLoading` | `boolean` | Whether a generation is in progress |
| `error` | `Error \| undefined` | Current error, if any |
| `status` | `GenerationClientState` | `'idle'` \| `'generating'` \| `'success'` \| `'error'` |
| `stop` | `() => void` | Abort the current generation |
| `reset` | `() => void` | Clear result, error, and return to idle |
| `resume` | `(state?: GenerationResumeState) => Promise<boolean>` | Reconnect to the current, initial, or explicit resumable generation run |
| `resumeSnapshot` | `GenerationResumeSnapshot \| undefined` | Lightweight snapshot containing resume cursor, status, errors, and artifact refs |
| `resumeState` | `GenerationResumeState \| null` | Current `{ threadId, runId, cursor }`, or `null` when nothing is resumable |
| `pendingArtifacts` | `Array<GenerationPendingArtifact>` | Persisted artifact refs observed during generation or replay before completion |
| `resultArtifacts` | `Array<PersistedArtifactRef>` | Persisted artifact refs attached to the final replayed result |

`stop()` aborts only the current client connection. It does not durably cancel
server-side generation work or delete persisted run state.

Generation hooks do not store generated image, audio, speech, transcription, or
video bytes in browser persistence. The client snapshot keeps only
`{ threadId, runId, cursor }` plus lightweight artifact refs. Use server
persistence artifacts when generated media must survive refresh:
[Generation Persistence](../persistence/generation-persistence) shows the full
pattern.

### Result Transforms

The `onResult` callback can transform what gets stored in `result`:

```tsx
import { useGenerateImage, fetchServerSentEvents } from '@tanstack/ai-react'
import type { ImageGenerationResult } from '@tanstack/ai'

const { result } = useGenerateImage({
  connection: fetchServerSentEvents('/api/generate/image'),
  onResult: (raw: ImageGenerationResult) => raw.images.map((img) => img.url || img.b64Json),
})
// result is now string[] instead of ImageGenerationResult
```

## Resumable Generation

All generation hooks can resume streamed generation endpoints when the server
uses `withPersistence(...)` and returns SSE events. Add `persistence.server` to
store the latest snapshot, rely on the default `autoResume: true`, or opt out
and call `resume()` from your UI.

```tsx
import { localStorageAIPersistence } from '@tanstack/ai-client'
import { fetchServerSentEvents, useGenerateVideo } from '@tanstack/ai-react'

export function TrailerVideoGenerator() {
  const video = useGenerateVideo({
    id: 'trailer-video',
    connection: fetchServerSentEvents('/api/generate/video'),
    persistence: {
      server: localStorageAIPersistence({
        keyPrefix: 'tanstack-ai:generation-resume:',
      }),
    },
  })

  return (
    <button disabled={video.isLoading} onClick={() => video.resume()}>
      Resume
    </button>
  )
}
```

If the server aborts provider work on disconnect, resume can only replay events
that were already persisted. If a durable producer keeps running on the server,
the hook can reconnect and receive the later artifact/result events.

## Framework Variants

Generation hooks are available across React, Vue, Svelte, Solid, and Angular with the same capabilities. Preact currently exposes chat hooks only, not generation hooks. The API shapes are identical -- only the naming convention and reactive primitives differ.

| Generation Type | React | Vue | Svelte | Solid | Angular |
|----------------|-------|-----|--------|-------|---------|
| Image | `useGenerateImage` | `useGenerateImage` | `createGenerateImage` | `useGenerateImage` | `injectGenerateImage` |
| Audio | `useGenerateAudio` | `useGenerateAudio` | `createGenerateAudio` | `useGenerateAudio` | `injectGenerateAudio` |
| Speech | `useGenerateSpeech` | `useGenerateSpeech` | `createGenerateSpeech` | `useGenerateSpeech` | `injectGenerateSpeech` |
| Transcription | `useTranscription` | `useTranscription` | `createTranscription` | `useTranscription` | `injectTranscription` |
| Summarization | `useSummarize` | `useSummarize` | `createSummarize` | `useSummarize` | `injectSummarize` |
| Video | `useGenerateVideo` | `useGenerateVideo` | `createGenerateVideo` | `useGenerateVideo` | `injectGenerateVideo` |
| Base (generic) | `useGeneration` | `useGeneration` | `createGeneration` | `useGeneration` | `injectGeneration` |

All framework packages re-export `fetchServerSentEvents`, `fetchHttpStream`, and `stream` from `@tanstack/ai-client` for convenience.

**React note:** Return values are plain values/functions. `resumeState` is a value and `pendingArtifacts` / `resultArtifacts` are arrays.

**Vue note:** Return values are wrapped in `DeepReadonly<ShallowRef<>>` -- access them with `.value` in both `<script>` and `<template>`.

**Svelte note:** Functions use the `create*` naming convention and return Svelte 5 reactive getters. Call `dispose()` or `stop()` during cleanup when needed.

**Solid note:** Reactive return values are accessors. Read `resumeState()` and `pendingArtifacts()`.

**Angular note:** Injectables return read-only Angular `Signal`s. Read `resumeState()` and `pendingArtifacts()` from the injected result.

## Next Steps

- [Image Generation](./image-generation) -- Provider-specific options, sizes, and model availability
- [Text-to-Speech](./text-to-speech) -- Voice options, audio formats, and streaming audio
- [Transcription](./transcription) -- File formats, language detection, and word-level timestamps
- [Video Generation](./video-generation) -- Job lifecycle, polling, and provider setup
- [Generations Overview](./generations) -- Architecture and server-side streaming patterns
- [Generation Persistence](../persistence/generation-persistence) -- Refresh-safe generation and persisted artifact refs
